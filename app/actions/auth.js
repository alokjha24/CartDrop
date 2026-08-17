"use server";

import { createClient } from "@/utils/supabase/server";
import { scrapeProduct } from "@/lib/firecrawl";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/**
 * Add a new product or update an existing product
 */
export async function addProduct(formData) {
  const url = formData?.get("url")?.toString().trim();

  // Validate URL
  if (!url) {
    return {
      error: "Product URL is required.",
    };
  }

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

    // --------------------------------------------------
    // 2. Scrape product using Firecrawl
    // --------------------------------------------------
    const productData = await scrapeProduct(url);

    console.log("Scraped Product:", productData);

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

    if (!productData.currentPrice) {
      return {
        error: "Product price could not be extracted.",
      };
    }

    // --------------------------------------------------
    // 3. Convert price
    // --------------------------------------------------
    const newPrice = Number(productData.currentPrice);

    if (!Number.isFinite(newPrice) || newPrice < 0) {
      return {
        error: "Invalid product price received.",
      };
    }

    const currency =
      productData.currencyCode?.trim().toUpperCase() || "USD";

    // --------------------------------------------------
    // 4. Image URL
    // --------------------------------------------------
    const imageUrl =
      productData.productImageUrl?.trim() ||
      "https://placehold.co/600x600?text=No+Image";

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

    let product;
    let isUpdate = false;

    // --------------------------------------------------
    // 6. Update existing product
    // --------------------------------------------------
    if (existingProduct) {
      isUpdate = true;

      const { data, error } = await supabase
        .from("products")
        .update({
          name: productData.productName.trim(),
          current_price: newPrice,
          currency: currency,
          image_url: imageUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingProduct.id)
        .eq("user_id", user.id)
        .select()
        .single();

      if (error) {
        console.error("Product update error:", error);
        throw error;
      }

      product = data;
    }

    // --------------------------------------------------
    // 7. Insert new product
    // --------------------------------------------------
    else {
      const { data, error } = await supabase
        .from("products")
        .insert({
          user_id: user.id,
          url: url,
          name: productData.productName.trim(),
          current_price: newPrice,
          currency: currency,
          image_url: imageUrl,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        console.error("Product insert error:", error);
        throw error;
      }

      product = data;
    }

    // --------------------------------------------------
    // 8. Add daily price history snapshot
    // --------------------------------------------------

    const priceChanged =
      !existingProduct ||
      Number(existingProduct.current_price) !== newPrice;

    const nowIso = new Date().toISOString();
    const todayUtcKey = nowIso.slice(0, 10);

    const {
      data: latestHistory,
      error: latestHistoryError,
    } = await supabase
      .from("price_history")
      .select("id, checked_at")
      .eq("product_id", product.id)
      .order("checked_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    if (latestHistoryError) {
      console.error(
        "Latest price history lookup error:",
        latestHistoryError
      );

      throw new Error(
        `Price history lookup error: ${latestHistoryError.message}`
      );
    }

    const latestUtcKey = latestHistory?.checked_at
      ? new Date(latestHistory.checked_at)
        .toISOString()
        .slice(0, 10)
      : null;

    if (latestHistory?.id && latestUtcKey === todayUtcKey) {
      const {
        error: historyUpdateError,
      } = await supabase
        .from("price_history")
        .update({
          price: newPrice,
          currency: currency,
          checked_at: nowIso,
        })
        .eq("id", latestHistory.id);

      if (historyUpdateError) {
        console.error(
          "Price history daily update error:",
          historyUpdateError
        );

        throw new Error(
          `Price history update error: ${historyUpdateError.message}`
        );
      }
    } else {
      const {
        error: historyInsertError,
      } = await supabase.from("price_history").insert({
        product_id: product.id,
        price: newPrice,
        currency: currency,
        checked_at: nowIso,
      });

      if (historyInsertError) {
        console.error(
          "Price history insert error:",
          historyInsertError
        );

        throw new Error(
          `Price history error: ${historyInsertError.message}`
        );
      }
    }

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
          : "Product is already up to date."
        : "Product added successfully!",
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

    return data ?? [];
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

    // Get price history only for user's own product
    const { data, error } = await supabase
      .from("price_history")
      .select("*")
      .eq("product_id", productId)
      .order("checked_at", {
        ascending: true,
      });

    if (error) {
      console.error("Get price history error:", error);
      return [];
    }

    return data ?? [];
  } catch (error) {
    console.error("Get Price History Error:", error);

    return [];
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