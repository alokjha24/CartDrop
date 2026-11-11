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

function isMissingOriginalPriceColumn(error) {
  return (
    ["PGRST204", "42703"].includes(error?.code) &&
    /original_price/i.test(error?.message || "")
  );
}

function isMissingLastCheckedAtColumn(error) {
  return (
    ["PGRST204", "42703"].includes(error?.code) &&
    /last_checked_at/i.test(error?.message || "")
  );
}

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

  const batchSize = Math.min(
    Math.max(Number(process.env.CRON_PRODUCT_BATCH_SIZE) || 50, 1),
    200
  );
  const concurrency = Math.min(
    Math.max(Number(process.env.CRON_PRODUCT_CONCURRENCY) || 4, 1),
    10
  );
  const maxProducts = Math.min(
    Math.max(Number(process.env.CRON_MAX_PRODUCTS) || 500, 1),
    5000
  );
  let originalPriceColumnAvailable = true;
  let lastCheckedAtColumnAvailable = true;
  const products = [];

  for (let offset = 0; products.length < maxProducts; offset += batchSize) {
    const batchEnd = offset + Math.min(batchSize, maxProducts - products.length) - 1;
    let productsResult;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const columns = [
        "id", "user_id", "name", "url", "image_url", "current_price", "currency", "updated_at",
        ...(originalPriceColumnAvailable ? ["original_price"] : []),
        ...(lastCheckedAtColumnAvailable ? ["last_checked_at"] : []),
      ];
      let query = supabase.from("products").select(columns.join(", "));
      query = lastCheckedAtColumnAvailable
        ? query.order("last_checked_at", { ascending: true, nullsFirst: true })
        : query.order("updated_at", { ascending: true, nullsFirst: true });

      const batchResult = await query
        .order("id", { ascending: true })
        .range(offset, batchEnd);

      if (isMissingOriginalPriceColumn(batchResult.error) && originalPriceColumnAvailable) {
        originalPriceColumnAvailable = false;
        console.warn(
          "The products.original_price column is missing. Apply supabase/migrations/20261020020000_add_original_price_to_products.sql."
        );
        continue;
      }
      if (isMissingLastCheckedAtColumn(batchResult.error) && lastCheckedAtColumnAvailable) {
        lastCheckedAtColumnAvailable = false;
        console.warn(
          "The products.last_checked_at column is missing. Apply supabase/migrations/20261019090000_add_last_checked_at.sql."
        );
        continue;
      }

      productsResult = batchResult;
      break;
    }

    if (productsResult.error) {
      console.error("Scheduled price lookup error:", productsResult.error);
      return NextResponse.json(
        { error: "Unable to load tracked products." },
        { status: 500 }
      );
    }

    products.push(...(productsResult.data ?? []));
    if (!productsResult.data?.length || productsResult.data.length < batchSize) break;
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
  const notificationEmailByUser = new Map();
  const getNotificationEmail = async (userId) => {
    if (notificationEmailByUser.has(userId)) {
      return notificationEmailByUser.get(userId);
    }

    const { data, error } = await supabase.auth.admin.getUserById(userId);
    const email = data?.user?.email?.trim();
    if (error || !email) {
      throw new Error("Unable to find an email address for this alert owner.");
    }

    notificationEmailByUser.set(userId, email);
    return email;
  };

  const processProduct = async (product) => {
    const scrapeStartedAt = Date.now();

    try {
      if (lastCheckedAtColumnAvailable) {
        const { error: markCheckedError } = await supabase
          .from("products")
          .update({ last_checked_at: new Date(scrapeStartedAt).toISOString() })
          .eq("id", product.id);

        if (isMissingLastCheckedAtColumn(markCheckedError)) {
          lastCheckedAtColumnAvailable = false;
          console.warn(
            "The products.last_checked_at column is missing. Apply supabase/migrations/20261019090000_add_last_checked_at.sql."
          );
        } else if (markCheckedError) {
          throw new Error(`Unable to schedule the next price check: ${markCheckedError.message}`);
        }
      }

      const productData = await scrapeProduct(product.url);
      if (productData.diagnostics) {
        console.info("Cron product scrape diagnostics:", productData.diagnostics);
      }
      const newPrice = normalizePrice(productData?.currentPrice);

      if (newPrice === null) {
        result.failed += 1;
        console.error(`Price check returned an invalid price for product ${product.id}.`);
        return;
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
        return;
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
          ...(originalPriceColumnAvailable
            ? { original_price: productData.originalPrice ?? null }
            : {}),
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
            Math.floor(now / 60_000),
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
            const { data: profile } = await supabase
              .from("profiles")
              .select("price_alert_emails_enabled")
              .eq("id", product.user_id)
              .maybeSingle();
            if (profile?.price_alert_emails_enabled !== false) {
              await sendPriceAlertEmail({
                recipientEmail: await getNotificationEmail(product.user_id),
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
            }
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
  };

  const refreshQueue = [...products];
  const worker = async () => {
    let product;
    while ((product = refreshQueue.shift())) {
      await processProduct(product);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, refreshQueue.length) }, () => worker())
  );

  if (result.updated > 0) {
    revalidatePath("/");
  }

  return NextResponse.json(result);
}
