import { normalizeCurrencyCode, normalizePrice } from "./price-history.mjs";

function getRequestedVariantId(sourceUrl) {
  try {
    const params = new URL(sourceUrl).searchParams;
    return (
      params.get("variant") ||
      params.get("variant_id") ||
      params.get("variantId") ||
      params.get("vid") ||
      params.get("sku")
    );
  } catch {
    return null;
  }
}

/**
 * Select the live selling price from Firecrawl's structured product result.
 * `variant.price` is the current price; `variant.sale.originalPrice` is the
 * crossed-out/list price and must not be used as today's price.
 */
export function getCurrentProductPrice(productProfile, { sourceUrl } = {}) {
  const variants = Array.isArray(productProfile?.variants)
    ? productProfile.variants
    : [];
  const pricedVariants = variants
    .map((variant, index) => ({
      variant,
      index,
      price: normalizePrice(variant?.price?.amount),
    }))
    .filter(({ price }) => price !== null);

  if (pricedVariants.length === 0) {
    return null;
  }

  const requestedVariantId = getRequestedVariantId(sourceUrl);
  const requestedVariant = requestedVariantId
    ? pricedVariants.find(({ variant }) =>
        [variant?.id, variant?.sku].some(
          (value) => value !== null && value !== undefined && String(value) === requestedVariantId
        )
      )
    : null;
  const selected =
    requestedVariant ??
    pricedVariants.find(({ variant }) => variant?.availability?.inStock === true) ??
    pricedVariants.find(({ variant }) => variant?.availability?.inStock !== false) ??
    pricedVariants[0];

  return {
    currentPrice: selected.price,
    currencyCode: normalizeCurrencyCode(selected.variant?.price?.currency),
  };
}
