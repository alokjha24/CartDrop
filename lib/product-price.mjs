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
function getSelectedPricedVariant(productProfile, sourceUrl) {
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

  return selected;
}

export function getCurrentProductPricing(productProfile, { sourceUrl } = {}) {
  const selected = getSelectedPricedVariant(productProfile, sourceUrl);
  if (!selected) return null;

  // Firecrawl's sale.originalPrice is the explicit crossed-out/list price.
  // Avoid guessing MRP from loosely named fields that may mean something else.
  const originalPrice = [
    selected.variant?.sale?.originalPrice?.amount ?? selected.variant?.sale?.originalPrice,
  ]
    .map(normalizePrice)
    .find((price) => price !== null && price > selected.price) ?? null;

  return {
    currentPrice: selected.price,
    originalPrice,
    currencyCode: normalizeCurrencyCode(selected.variant?.price?.currency),
  };
}

export function selectCurrentSellingPrice({
  structuredPrice,
  extractedPrice,
  adapterPrice,
  amazonPrice,
  hasStructuredVariants = false,
} = {}) {
  const fallbackPrice = hasStructuredVariants
    ? amazonPrice
    : normalizePrice(extractedPrice) ?? adapterPrice;

  return normalizePrice(structuredPrice) ?? normalizePrice(fallbackPrice);
}

export function getCurrentProductPrice(productProfile, options) {
  const pricing = getCurrentProductPricing(productProfile, options);
  return pricing
    ? {
        currentPrice: pricing.currentPrice,
        currencyCode: pricing.currencyCode,
      }
    : null;
}
