"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { sendPriceAlertEmail } from "@/lib/notifications";

const ALERT_TYPES = new Set(["target_price", "percentage_drop", "lowest_price"]);
const FREQUENCIES = new Set(["immediate", "daily", "weekly"]);
const WINDOWS = new Set([30, 90]);

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function validateAlertInput(input) {
  const alertType = String(input?.alert_type ?? "");
  const frequency = String(input?.frequency ?? "immediate");
  const threshold = positiveNumber(input?.threshold);
  const observationWindowDays =
    input?.observation_window_days === null ||
    input?.observation_window_days === undefined ||
    input?.observation_window_days === ""
      ? null
      : Number(input.observation_window_days);

  if (alertType !== "target_price") {
    return { error: "Only target price alerts are supported." };
  }
  if (!FREQUENCIES.has(frequency)) {
    return { error: "Choose a supported notification frequency." };
  }
  if (alertType === "target_price" && threshold === null) {
    return { error: "Target price must be greater than zero." };
  }
  if (alertType === "percentage_drop" &&
      (threshold === null || threshold > 100)) {
    return { error: "Percentage drop must be between 0 and 100." };
  }
  if (alertType === "lowest_price" && !WINDOWS.has(observationWindowDays)) {
    return { error: "Choose a 30-day or 90-day observation window." };
  }

  return {
    value: {
      alert_type: alertType,
      threshold: alertType === "lowest_price" ? null : threshold,
      frequency,
      observation_window_days:
        alertType === "lowest_price" ? observationWindowDays : null,
      enabled: input?.enabled !== false,
    },
  };
}

async function getAuthenticatedContext(productId) {
  if (!productId) {
    return { error: "Product ID is required." };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.error("Alert authentication error:", userError);
    return { error: "Unable to verify your account." };
  }
  if (!user) {
    return { error: "Please sign in first." };
  }

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, name, url, image_url, current_price, currency")
    .eq("id", productId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (productError) {
    console.error("Alert product access error:", productError);
    return { error: "Unable to verify this tracked product." };
  }
  if (!product) {
    return { error: "Tracked product not found." };
  }

  return { supabase, user, product };
}

export async function getPriceAlerts(productId) {
  const context = await getAuthenticatedContext(productId);
  if (context.error) return { error: context.error, alerts: [] };

  const { data, error } = await context.supabase
    .from("price_alerts")
    .select("*")
    .eq("product_id", productId)
    .eq("user_id", context.user.id)
    .eq("alert_type", "target_price")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Get price alerts error:", error);
    return { error: "Unable to load price alerts.", alerts: [] };
  }

  return { alerts: data ?? [] };
}

export async function getAllPriceAlerts() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.error("Alert list authentication error:", userError);
    return { error: "Unable to verify your account.", alerts: [] };
  }
  if (!user) return { alerts: [] };

  const { data, error } = await supabase
    .from("price_alerts")
    .select("*, products(id, name, url, image_url, current_price, currency, updated_at)")
    .eq("user_id", user.id)
    .eq("alert_type", "target_price")
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Get all price alerts error:", error);
    return { error: "Unable to load your price alerts.", alerts: [] };
  }

  return { alerts: data ?? [] };
}

export async function upsertPriceAlert(productId, input) {
  const validation = validateAlertInput(input);
  if (validation.error) return { error: validation.error };

  const context = await getAuthenticatedContext(productId);
  if (context.error) return { error: context.error };

  const { data: existingAlert, error: existingAlertError } = await context.supabase
    .from("price_alerts")
    .select("id, last_triggered_at, last_triggered_price")
    .eq("product_id", productId)
    .eq("user_id", context.user.id)
    .eq("alert_type", validation.value.alert_type)
    .maybeSingle();

  if (existingAlertError) {
    console.error("Existing price alert lookup error:", existingAlertError);
    return { error: "Unable to verify this price alert." };
  }

  const { data, error } = await context.supabase
    .from("price_alerts")
    .upsert(
      {
        ...validation.value,
        user_id: context.user.id,
        product_id: productId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,product_id,alert_type" }
    )
    .select()
    .single();

  if (error) {
    console.error("Save price alert error:", error);
    return { error: "Unable to save this price alert." };
  }

  const currentPrice = positiveNumber(context.product.current_price);
  const targetPrice = positiveNumber(validation.value.threshold);
  const shouldNotifyImmediately =
    validation.value.alert_type === "target_price" &&
    currentPrice !== null &&
    targetPrice !== null &&
    currentPrice <= targetPrice &&
    (!existingAlert?.last_triggered_at ||
      positiveNumber(existingAlert.last_triggered_price) > targetPrice);

  if (shouldNotifyImmediately) {
    try {
      await sendPriceAlertEmail({
        productName: context.product.name,
        productUrl: context.product.url,
        productImageUrl: context.product.image_url,
        currency: context.product.currency,
        price: currentPrice,
        targetPrice,
        alertType: "target_price",
      });

      const triggeredAt = new Date().toISOString();
      const { error: triggerUpdateError } = await context.supabase
        .from("price_alerts")
        .update({
          last_triggered_at: triggeredAt,
          last_triggered_price: currentPrice,
          updated_at: triggeredAt,
        })
        .eq("id", data.id)
        .eq("user_id", context.user.id);

      if (triggerUpdateError) {
        console.error("Immediate price alert state update error:", triggerUpdateError);
      }
    } catch (notificationError) {
      console.error("Immediate price alert email failed:", notificationError);
      return {
        success: true,
        alert: data,
        warning: "Alert saved, but the email could not be sent. Check notification settings.",
      };
    }
  }

  revalidatePath("/");
  revalidatePath("/alerts");
  return { success: true, alert: data };
}

export async function deletePriceAlert(productId, alertId) {
  const context = await getAuthenticatedContext(productId);
  if (context.error) return { error: context.error };
  if (!alertId) return { error: "Alert ID is required." };

  const { error } = await context.supabase
    .from("price_alerts")
    .delete()
    .eq("id", alertId)
    .eq("product_id", productId)
    .eq("user_id", context.user.id);

  if (error) {
    console.error("Delete price alert error:", error);
    return { error: "Unable to remove this price alert." };
  }

  revalidatePath("/");
  revalidatePath("/alerts");
  return { success: true };
}

export async function setProductsAlertsEnabled(productIds, enabled) {
  const ids = Array.isArray(productIds) ? productIds.filter(Boolean) : [];
  if (!ids.length) return { error: "Select at least one product." };
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) {
    console.error("Bulk alert authentication error:", userError);
    return { error: "Unable to verify your account." };
  }
  if (!user) return { error: "Please sign in first." };
  const { error } = await supabase
    .from("price_alerts")
    .update({ enabled: Boolean(enabled), updated_at: new Date().toISOString() })
    .in("product_id", ids)
    .eq("user_id", user.id);
  if (error) {
    console.error("Bulk alert update error:", error);
    return { error: "Unable to update selected alerts." };
  }
  revalidatePath("/");
  revalidatePath("/alerts");
  return { success: true };
}

export async function getPriceAlertEvents(limit = 30) {
  const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.error("Alert event authentication error:", userError);
    return { error: "Unable to verify your account.", events: [] };
  }
  if (!user) return { events: [] };

  const { data, error } = await supabase
    .from("price_alert_events")
    .select("*, products(name, url, image_url)")
    .eq("user_id", user.id)
    .order("triggered_at", { ascending: false })
    .limit(safeLimit);

  if (error) {
    console.error("Get price alert events error:", error);
    return { error: "Unable to load alert history.", events: [] };
  }

  return { events: data ?? [] };
}
