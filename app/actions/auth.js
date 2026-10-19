"use server";

import { createClient } from "@/utils/supabase/server";
import { scrapeProduct } from "@/lib/firecrawl";
import {
  getLatestPriceRecord,
  normalizeCurrencyCode,
  normalizePrice,
  shouldRecordPriceSample,
} from "@/lib/price-history.mjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getProductDisplayTitle,
  getRetailerLabel,
  normalizeProductUrl,
} from "@/lib/product-url.mjs";
import { storeProductImage } from "@/lib/product-image-storage.mjs";

let lastCheckedAtSchemaWarningShown = false;

function warnMissingLastCheckedAtColumn() {
  if (lastCheckedAtSchemaWarningShown) return;
  lastCheckedAtSchemaWarningShown = true;
  console.warn(
    "The products.last_checked_at column is missing. Apply supabase/migrations/20261019090000_add_last_checked_at.sql."
  );
}

/**
 * Add a new product or update an existing product
 */
export async function addProduct(formData) {
  const submittedUrl = formData?.get("url")?.toString();
  const normalizedUrl = normalizeProductUrl(submittedUrl);
  if (normalizedUrl.error) return { error: normalizedUrl.error };
  const url = normalizedUrl.url;

  try {
    const supabase = await createClient();

    // --------------------------------------------------
    // 1. Get authenticated user
    // --------------------------------------------------
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      console.error("Auth error:", userError);

      return {
        error: "Unable to verify your account.",
      };
    }

    if (!user) {
      return {
        error: "Please sign in first.",
      };
    }

    // Reject a response if a newer overlapping fetch has already been saved.
    const scrapeStartedAt = Date.now();

    // --------------------------------------------------
    // 2. Scrape product using Firecrawl
    // --------------------------------------------------
    const fastRefresh = formData?.get("fastRefresh") === "true";
    let productData;
    if (fastRefresh) {
      try {
        productData = await scrapeProduct(url, { fast: true });
      } catch (fastError) {
        const needsFullExtraction =
          /product name not found|current selling price not found|no data extracted/i.test(
            fastError?.message || ""
          );
        if (!needsFullExtraction) throw fastError;
        console.info("Fast product extraction fell back to full extraction.");
        productData = await scrapeProduct(url);
      }
    } else {
      productData = await scrapeProduct(url);
    }
    if (productData.diagnostics) {
      console.info("Product scrape diagnostics:", productData.diagnostics);
    }

    if (!productData) {
      return {
        error: "Failed to scrape product information.",
      };
    }

    if (!productData.productName) {
      return {
        error: "Product name could not be extracted.",
      };
    }

    if (productData.currentPrice === null || productData.currentPrice === undefined) {
      return {
        error: "Product price could not be extracted.",
      };
    }

    // --------------------------------------------------
    // 3. Convert price
    // --------------------------------------------------
    const newPrice = normalizePrice(productData.currentPrice);

    if (newPrice === null) {
      return {
        error: "Invalid product price received. The price must be greater than zero.",
      };
    }

    const currency = normalizeCurrencyCode(productData.currencyCode);

    // --------------------------------------------------
    // 4. Image URL
    // --------------------------------------------------
    const scrapedImageUrl =
      (Array.isArray(productData.productImageCandidates)
        ? productData.productImageCandidates.find(
            (candidate) => typeof candidate === "string" && candidate.trim()
          )
        : null) ||
      productData.productImageUrl?.trim() ||
      null;

    // --------------------------------------------------
    // 5. Check whether product already exists
    // --------------------------------------------------
    const {
      data: existingProduct,
      error: existingProductError,
    } = await supabase
      .from("products")
      .select("id, current_price, image_url")
      .eq("user_id", user.id)
      .eq("url", url)
      .maybeSingle();

    if (existingProductError) {
      console.error(
        "Existing product lookup error:",
        existingProductError
      );

      return {
        error: existingProductError.message,
      };
    }

    let product = existingProduct;
    let isUpdate = Boolean(existingProduct);

    // A new product row is needed before inserting its first history record.
    if (!product) {
      const checkedAt = new Date().toISOString();
      const productValues = {
        user_id: user.id,
        url,
        name: getProductDisplayTitle(productData.productName, url),
        current_price: newPrice,
        currency,
        image_url: scrapedImageUrl,
        updated_at: checkedAt,
      };
      let insertResult = await supabase
        .from("products")
        .insert({ ...productValues, last_checked_at: checkedAt })
        .select()
        .single();
      if (insertResult.error?.code === "PGRST204") {
        warnMissingLastCheckedAtColumn();
        insertResult = await supabase
          .from("products")
          .insert(productValues)
          .select()
          .single();
      }
      const { data, error } = insertResult;

      if (error) {
        console.error("Product insert error:", error);
        throw error;
      }

      product = data;
      isUpdate = false;
    } else {
      const historyNow = new Date().toISOString();
      const { data: latestHistoryRow, error: latestHistoryError } = await supabase
        .from("price_history")
        .select("id, price, checked_at")
        .eq("product_id", product.id)
        .gt("price", 0)
        .lte("checked_at", historyNow)
        .order("checked_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestHistoryError) {
        console.error("Price history lookup error:", latestHistoryError);
        throw new Error(`Price history lookup error: ${latestHistoryError.message}`);
      }

      const latestHistory = getLatestPriceRecord(
        latestHistoryRow ? [latestHistoryRow] : []
      );

      if (latestHistory && latestHistory.timestamp > scrapeStartedAt) {
        revalidatePath("/");
        return {
          success: true,
          message: "A newer price check already finished. The latest price was kept.",
        };
      }

      const now = Date.now();
      const nowIso = new Date(now).toISOString();

      if (shouldRecordPriceSample(latestHistory, newPrice, now)) {
        const { error: historyInsertError } = await supabase
          .from("price_history")
          .insert({
            product_id: product.id,
            price: newPrice,
            currency,
            checked_at: nowIso,
          });

        if (historyInsertError) {
          console.error("Price history insert error:", historyInsertError);
          throw new Error(`Price history error: ${historyInsertError.message}`);
        }
      }

      const productValues = {
        name: getProductDisplayTitle(productData.productName, url),
        current_price: newPrice,
        currency,
        image_url:
          scrapedImageUrl ||
          (product.image_url && !product.image_url.includes("placehold.co")
            ? product.image_url
            : null),
        updated_at: nowIso,
      };
      let updateResult = await supabase
        .from("products")
        .update({ ...productValues, last_checked_at: nowIso })
        .eq("id", product.id)
        .eq("user_id", user.id)
        .select()
        .single();
      if (updateResult.error?.code === "PGRST204") {
        warnMissingLastCheckedAtColumn();
        updateResult = await supabase
          .from("products")
          .update(productValues)
          .eq("id", product.id)
          .eq("user_id", user.id)
          .select()
          .single();
      }
      const { data, error } = updateResult;

      if (error) {
        console.error("Product update error:", error);
        throw error;
      }

      product = data;
    }

    const storedImageUrl = await storeProductImage(supabase, {
      candidates: productData.productImageCandidates,
      userId: user.id,
      productId: product.id,
      referer: url,
    });
    if (storedImageUrl && storedImageUrl !== product.image_url) {
      const { data, error: imageUpdateError } = await supabase
        .from("products")
        .update({ image_url: storedImageUrl })
        .eq("id", product.id)
        .eq("user_id", user.id)
        .select()
        .single();
      if (!imageUpdateError) product = data;
    }

    if (!isUpdate) {
      const now = Date.now();
      const { error: historyInsertError } = await supabase
        .from("price_history")
        .insert({
          product_id: product.id,
          price: newPrice,
          currency,
          checked_at: new Date(now).toISOString(),
        });

      if (historyInsertError) {
        console.error("Price history insert error:", historyInsertError);
        throw new Error(`Price history error: ${historyInsertError.message}`);
      }
    }

    const priceChanged =
      !existingProduct || normalizePrice(existingProduct.current_price) !== newPrice;

    // --------------------------------------------------
    // 9. Refresh homepage
    // --------------------------------------------------
    revalidatePath("/");

    return {
      success: true,
      product,
      message: isUpdate
        ? priceChanged
          ? "Product updated with the latest price!"
          : "This product is already tracked and up to date."
        : "Product added successfully!",
      retailer: getRetailerLabel(normalizedUrl.hostname),
    };
  } catch (error) {
    console.error("Add Product Error:", error);

    return {
      error:
        error?.message ||
        "Something went wrong while adding the product.",
    };
  }
}

export async function repairProductImage(productId) {
  if (typeof productId !== "string" || !productId.trim() || productId.length > 128) {
    return { error: "Product ID is invalid." };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Please sign in first." };

    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, url, image_url")
      .eq("id", productId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (productError || !product) {
      return { error: "Product not found." };
    }

    const productData = await scrapeProduct(product.url, { imagesOnly: true });
    const imageUrl = await storeProductImage(supabase, {
      candidates: productData.productImageCandidates,
      userId: user.id,
      productId: product.id,
      referer: product.url,
    });
    if (!imageUrl) return { error: "No working product image was found." };

    const { error: updateError } = await supabase
      .from("products")
      .update({ image_url: imageUrl })
      .eq("id", product.id)
      .eq("user_id", user.id);
    if (updateError) {
      console.error("Product image repair update failed:", updateError);
      return { error: "Unable to save the repaired product image." };
    }

    revalidatePath("/");
    return { success: true, imageUrl };
  } catch (error) {
    console.error("Product image repair failed:", error);
    return { error: "Unable to refresh this product image right now." };
  }
}

/**
 * Delete a product
 */
export async function deleteProduct(productId) {
  if (!productId) {
    return {
      error: "Product ID is required.",
    };
  }

  try {
    const supabase = await createClient();

    // Make sure user is authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        error: "Please sign in first.",
      };
    }

    const { error } = await supabase
      .from("products")
      .delete()
      .eq("id", productId)
      .eq("user_id", user.id);

    if (error) {
      console.error("Delete product error:", error);
      throw error;
    }

    revalidatePath("/");

    return {
      success: true,
      message: "Product deleted successfully.",
    };
  } catch (error) {
    console.error("Delete Product Error:", error);

    return {
      error: error?.message || "Failed to delete product.",
    };
  }
}

export async function updateProduct(productId, input) {
  if (!productId) return { error: "Product ID is required." };
  const name = String(input?.name ?? "").trim();
  const currency = String(input?.currency ?? "").trim().toUpperCase();
  if (!name) return { error: "Product name is required." };
  if (name.length > 160) return { error: "Product name must be 160 characters or fewer." };

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Please sign in first." };
    const { data, error } = await supabase
      .from("products")
      .update({ name, currency: normalizeCurrencyCode(currency) })
      .eq("id", productId)
      .eq("user_id", user.id)
      .select()
      .single();
    if (error) {
      console.error("Update product error:", error);
      return { error: "Unable to update this product." };
    }
    revalidatePath("/");
    return { success: true, product: data };
  } catch (error) {
    console.error("Update Product Error:", error);
    return { error: "Unable to update this product." };
  }
}

export async function deleteProducts(productIds) {
  const ids = Array.isArray(productIds) ? productIds.filter(Boolean) : [];
  if (!ids.length) return { error: "Select at least one product." };
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Please sign in first." };
    const { error } = await supabase.from("products").delete().in("id", ids).eq("user_id", user.id);
    if (error) {
      console.error("Delete products error:", error);
      return { error: "Unable to remove the selected products." };
    }
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("Delete Products Error:", error);
    return { error: "Unable to remove the selected products." };
  }
}

/**
 * Get products belonging to the current user
 */
export async function getProducts() {
  try {
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return [];
    }

    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      console.error("Get products error:", error);
      return [];
    }

    if (!data?.length) {
      return [];
    }

    return data.map((product) => ({
      ...product,
      current_price: normalizePrice(product.current_price),
      currency: normalizeCurrencyCode(product.currency),
      name: getProductDisplayTitle(product.name, product.url),
      retailer: getRetailerLabel(product.url),
    }));
  } catch (error) {
    console.error("Get Products Error:", error);

    return [];
  }
}

/**
 * Get price history for a product
 */
export async function getPriceHistory(productId) {
  if (!productId) {
    return [];
  }

  try {
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return [];
    }

    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id")
      .eq("id", productId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (productError) {
      throw new Error(`Product access check failed: ${productError.message}`);
    }

    if (!product) {
      return [];
    }

    // Product ownership is checked above before reading its history.
    const pageSize = 1000;
    let offset = 0;
    const history = [];

    while (true) {
      const { data, error } = await supabase
        .from("price_history")
        .select("*")
        .eq("product_id", productId)
        .order("checked_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (error) {
        console.error("Get price history error:", error);
        throw new Error(`Unable to load price history: ${error.message}`);
      }

      history.push(...(data ?? []));
      if ((data?.length ?? 0) < pageSize) {
        break;
      }

      offset += pageSize;
    }

    return history;
  } catch (error) {
    console.error("Get Price History Error:", error);
    throw error;
  }
}

/**
 * Sign out
 */
export async function signOut() {
  try {
    const supabase = await createClient();

    await supabase.auth.signOut();

    revalidatePath("/");
  } catch (error) {
    console.error("Sign out error:", error);
  }

  redirect("/");
}

export async function refreshTrackedProducts() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) {
      console.error("Refresh products authentication error:", userError);
      return { error: "Unable to verify your account." };
    }
    if (!user) return { error: "Please sign in first." };

    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("id, url, name")
      .eq("user_id", user.id);

    if (productsError) {
      console.error("Refresh products lookup error:", productsError);
      return { error: "Unable to load tracked products." };
    }

    const failures = [];
    const makeFailure = (product, reason) => ({
      productId: product.id,
      name: getProductDisplayTitle(product.name, product.url),
      reason: String(reason || "The store could not be refreshed.").slice(0, 240),
    });
    const refreshProduct = async (product) => {
      try {
        const formData = new FormData();
        formData.set("url", product.url);
        formData.set("fastRefresh", "true");
        const result = await addProduct(formData);

        // A failed scrape must not make an old price look freshly checked.
        if (!result?.success || result.error) {
          return makeFailure(product, result?.error || "No fresh product data was returned.");
        }

        const checkedAt = new Date().toISOString();
        const { data: checkedProduct, error: checkedAtError } = await supabase
          .from("products")
          .update({ last_checked_at: checkedAt, updated_at: checkedAt })
          .eq("id", product.id)
          .eq("user_id", user.id)
          .select("id")
          .maybeSingle();

        if (checkedAtError) {
          if (checkedAtError.code === "PGRST204") {
            warnMissingLastCheckedAtColumn();
            // Keep the visible fallback timestamp fresh if the optional column
            // has not been added to this Supabase project yet.
            const { data: fallbackProduct, error: fallbackError } = await supabase
              .from("products")
              .update({ updated_at: checkedAt })
              .eq("id", product.id)
              .eq("user_id", user.id)
              .select("id")
              .maybeSingle();
            if (fallbackError || !fallbackProduct) {
              console.error("Refresh timestamp fallback error:", fallbackError);
              return makeFailure(product, "The price was fetched, but its checked time could not be saved.");
            }
          } else {
            console.error("Last checked timestamp update error:", checkedAtError);
            return makeFailure(product, "The price was fetched, but its checked time could not be saved.");
          }
        } else if (!checkedProduct) {
          console.error("Last checked timestamp update found no product:", product.id);
          return makeFailure(product, "The price was fetched, but its checked time could not be saved.");
        }

        return null;
      } catch (error) {
        console.error("Refresh product failed:", product.id, error);
        return makeFailure(product, error?.message || "The store could not be reached.");
      }
    };

    const refreshQueue = [...(products ?? [])];
    const worker = async () => {
      let product;
      while ((product = refreshQueue.shift())) {
        const failure = await refreshProduct(product);
        if (failure) failures.push(failure);
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(5, refreshQueue.length) },
        () => worker()
      )
    );

    revalidatePath("/");
    return {
      success: true,
      total: products?.length ?? 0,
      failed: failures.length,
      failures,
    };
  } catch (error) {
    console.error("Refresh tracked products error:", error);
    return { error: "Unable to refresh tracked products." };
  }
}
