import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { scrapeProduct } from "@/lib/firecrawl";
import {
  getLatestPriceRecord,
  normalizeCurrencyCode,
  normalizePrice,
  shouldRecordPriceSample,
} from "@/lib/price-history.mjs";
import { evaluatePriceAlerts } from "@/lib/price-alerts.mjs";
import { sendPriceAlertEmail } from "@/lib/notifications";
import { storeProductImage } from "@/lib/product-image-storage.mjs";

export const runtime = "nodejs";

export async function GET(request) {
  if (!request.headers.get("authorization")) {
    return NextResponse.json({
      message: "Price check endpoint is ready.",
    });
  }

  return runPriceCheck(request);
}

export async function POST(request) {
  return runPriceCheck(request);
}

async function runPriceCheck(request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: "Price check endpoint is not configured." },
      { status: 503 }
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Price check database access is not configured." },
      { status: 503 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, user_id, name, url, image_url, current_price, currency, updated_at");

  if (productsError) {
    console.error("Scheduled price lookup error:", productsError);
    return NextResponse.json(
      { error: "Unable to load tracked products." },
      { status: 500 }
    );
  }

  const result = {
    total: products?.length ?? 0,
    updated: 0,
    failed: 0,
    skippedAsStale: 0,
    priceChanges: 0,
    historySamplesAdded: 0,
    alertsTriggered: 0,
    alertFailures: 0,
  };

  for (const product of products ?? []) {
    const scrapeStartedAt = Date.now();

    try {
      const productData = await scrapeProduct(product.url);
      if (productData.diagnostics) {
        console.info("Cron product scrape diagnostics:", productData.diagnostics);
      }
      const newPrice = normalizePrice(productData?.currentPrice);

      if (newPrice === null) {
        result.failed += 1;
        console.error(`Price check returned an invalid price for product ${product.id}.`);
        continue;
      }

      const historyReadAt = Date.now();
      const { data: latestHistoryRow, error: historyLookupError } = await supabase
        .from("price_history")
        .select("id, price, checked_at")
        .eq("product_id", product.id)
        .gt("price", 0)
        .lte("checked_at", new Date(historyReadAt).toISOString())
        .order("checked_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (historyLookupError) {
        throw new Error(`Price history lookup failed: ${historyLookupError.message}`);
      }

      const latestHistory = getLatestPriceRecord(
        latestHistoryRow ? [latestHistoryRow] : [],
        { now: historyReadAt }
      );

      if (latestHistory && latestHistory.timestamp > scrapeStartedAt) {
        const productUpdatedAt = product.updated_at
          ? new Date(product.updated_at).getTime()
          : 0;

        if (latestHistory.timestamp > productUpdatedAt) {
          const { error: reconciliationError } = await supabase
            .from("products")
            .update({
              current_price: latestHistory.price,
              updated_at: latestHistory.checked_at,
            })
            .eq("id", product.id);

          if (reconciliationError) {
            throw new Error(
              `Product reconciliation failed: ${reconciliationError.message}`
            );
          }

          result.updated += 1;
        }

        result.skippedAsStale += 1;
        continue;
      }

      const now = Date.now();
      const checkedAt = new Date(now).toISOString();
      const currency = normalizeCurrencyCode(
        productData.currencyCode,
        product.currency || "INR"
      );

      if (shouldRecordPriceSample(latestHistory, newPrice, now)) {
        const { error: historyInsertError } = await supabase
          .from("price_history")
          .insert({
            product_id: product.id,
            price: newPrice,
            currency,
            checked_at: checkedAt,
          });

        if (historyInsertError) {
          throw new Error(`Price history insert failed: ${historyInsertError.message}`);
        }

        result.historySamplesAdded += 1;
      }

      const oldPrice = normalizePrice(latestHistory?.price ?? product.current_price);
      const refreshedImageUrl = await storeProductImage(supabase, {
        candidates: productData.productImageCandidates,
        userId: product.user_id,
        productId: product.id,
        referer: product.url,
      });
      const { error: productUpdateError } = await supabase
        .from("products")
        .update({
          current_price: newPrice,
          currency,
          ...(refreshedImageUrl ? { image_url: refreshedImageUrl } : {}),
          updated_at: checkedAt,
        })
        .eq("id", product.id);

      if (productUpdateError) {
        throw new Error(`Product price update failed: ${productUpdateError.message}`);
      }

      result.updated += 1;
      if (oldPrice !== newPrice) {
        result.priceChanges += 1;
      }

      const { data: alerts, error: alertsLookupError } = await supabase
        .from("price_alerts")
        .select("*")
        .eq("product_id", product.id)
        .eq("user_id", product.user_id)
        .eq("enabled", true);

      if (alertsLookupError) {
        throw new Error(`Price alert lookup failed: ${alertsLookupError.message}`);
      }

      if (alerts?.length) {
        const { data: history, error: alertHistoryError } = await supabase
          .from("price_history")
          .select("price, checked_at")
          .eq("product_id", product.id)
          .gt("price", 0)
          .gte(
            "checked_at",
            new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
          )
          .lte("checked_at", checkedAt)
          .order("checked_at", { ascending: true });

        if (alertHistoryError) {
          throw new Error(`Alert history lookup failed: ${alertHistoryError.message}`);
        }

        const events = evaluatePriceAlerts(alerts, {
          currentPrice: newPrice,
          previousPrice: oldPrice,
          history: history ?? [],
          now,
        });

        for (const event of events) {
          const eventKey = [
            event.alertId,
            event.alertType,
            event.triggeringPrice,
            event.previousPrice ?? "none",
            event.triggeredAt,
          ].join(":");

          const { error: eventInsertError } = await supabase
            .from("price_alert_events")
            .insert({
              user_id: product.user_id,
              product_id: product.id,
              alert_id: event.alertId,
              alert_type: event.alertType,
              triggering_price: event.triggeringPrice,
              previous_price: event.previousPrice,
              triggered_at: event.triggeredAt,
              notification_status: "pending",
              event_key: eventKey,
            });

          if (eventInsertError?.code === "23505") {
            continue;
          }
          if (eventInsertError) {
            result.alertFailures += 1;
            console.error(`Price alert event failed for ${product.id}:`, eventInsertError);
            continue;
          }

          let notificationStatus = "recorded";
          try {
            await sendPriceAlertEmail({
              productName: product.name,
              productUrl: product.url,
              productImageUrl: product.image_url,
              currency,
              price: event.triggeringPrice,
              previousPrice: event.previousPrice,
              alertType: event.alertType,
              targetPrice: alerts.find((alert) => alert.id === event.alertId)?.threshold,
              observationWindowDays: alerts.find((alert) => alert.id === event.alertId)?.observation_window_days,
            });
          } catch (notificationError) {
            notificationStatus = "failed";
            result.alertFailures += 1;
            console.error(`Price alert email failed for ${product.id}:`, notificationError);
          }

          const { error: notificationUpdateError } = await supabase
            .from("price_alert_events")
            .update({ notification_status: notificationStatus })
            .eq("event_key", eventKey);

          if (notificationUpdateError) {
            result.alertFailures += 1;
            console.error(
              `Price alert notification status update failed for ${product.id}:`,
              notificationUpdateError
            );
          }

          const { error: alertUpdateError } = await supabase
            .from("price_alerts")
            .update({
              last_triggered_at: event.triggeredAt,
              last_triggered_price: event.triggeringPrice,
              updated_at: event.triggeredAt,
            })
            .eq("id", event.alertId)
            .eq("user_id", product.user_id);

          if (alertUpdateError) {
            result.alertFailures += 1;
            console.error(`Price alert state update failed for ${product.id}:`, alertUpdateError);
            continue;
          }

          result.alertsTriggered += 1;
        }
      }
    } catch (error) {
      result.failed += 1;
      console.error(`Price check failed for product ${product.id}:`, error);
    }
  }

  if (result.updated > 0) {
    revalidatePath("/");
  }

  return NextResponse.json(result);
}
