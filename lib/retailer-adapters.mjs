import { normalizePrice } from "./price-history.mjs";

function getHostname(sourceUrl) {
  try {
    return new URL(sourceUrl).hostname.toLowerCase();
  } catch {
    return "unknown";
  }
}

function normalizeOptionalCurrency(value) {
  if (typeof value !== "string" || !/^[A-Z]{3}$/i.test(value.trim())) return null;
  try {
    new Intl.NumberFormat("en", {
      style: "currency",
      currency: value.trim().toUpperCase(),
    });
    return value.trim().toUpperCase();
  } catch {
    return null;
  }
}

function parseJsonLd(html) {
  const values = [];
  const matches = String(html ?? "").matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );

  for (const match of matches) {
    try {
      values.push(JSON.parse(match[1].trim()));
    } catch {
      // Continue when one JSON-LD block is malformed.
    }
  }
  return values;
}

function walkJsonLd(value, callback) {
  if (!value || typeof value !== "object") return;
  callback(value);
  if (Array.isArray(value)) {
    value.forEach((item) => walkJsonLd(item, callback));
    return;
  }
  Object.values(value).forEach((nestedValue) => walkJsonLd(nestedValue, callback));
}

function getJsonLdProduct(html) {
  let product = null;
  for (const document of parseJsonLd(html)) {
    walkJsonLd(document, (value) => {
      const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
      if (!product && types.some((type) => String(type).toLowerCase() === "product")) {
        product = value;
      }
    });
  }
  return product;
}

function getOfferPrice(product) {
  const offers = Array.isArray(product?.offers) ? product.offers : [product?.offers];
  for (const offer of offers) {
    const price = normalizePrice(offer?.price ?? offer?.lowPrice);
    if (price !== null) {
      return {
        currentPrice: price,
        currencyCode: normalizeOptionalCurrency(offer?.priceCurrency),
      };
    }
  }
  return null;
}

function getMetaValue(metadata, keys) {
  const entries = Object.entries(metadata ?? {});
  const wanted = keys.map((key) => key.toLowerCase());
  return entries.find(([key, value]) =>
    wanted.includes(key.toLowerCase()) && typeof value === "string" && value.trim()
  )?.[1]?.trim() || null;
}

export function createRetailerAdapter(sourceUrl) {
  const hostname = getHostname(sourceUrl);
  return {
    retailer: hostname,
    canHandle: () => true,
    extractProduct: (result) => {
      const json = result?.json && typeof result.json === "object" ? result.json : {};
      const product = result?.product && typeof result.product === "object"
        ? result.product
        : null;
      const jsonLdProduct = getJsonLdProduct(result?.html);
      const structuredOffer = getOfferPrice(jsonLdProduct);
      const profileVariant = product?.variants?.length
        ? product.variants.find((variant) => normalizePrice(variant?.price?.amount) !== null)
        : null;
      const profilePrice = normalizePrice(profileVariant?.price?.amount);

      const productName =
        (typeof product?.title === "string" && product.title.trim()) ||
        (typeof json.productName === "string" && json.productName.trim()) ||
        (typeof jsonLdProduct?.name === "string" && jsonLdProduct.name.trim()) ||
        getMetaValue(result?.metadata, ["og:title", "ogTitle", "title"]);
      const currentPrice = profilePrice !== null
        ? profilePrice
        : normalizePrice(json.currentPrice) ?? structuredOffer?.currentPrice ?? null;
      const currencyCode =
        normalizeOptionalCurrency(profileVariant?.price?.currency) ||
        normalizeOptionalCurrency(json.currencyCode) ||
        structuredOffer?.currencyCode;

      return {
        productName: productName || null,
        currentPrice,
        currencyCode,
        method: product ? "firecrawl-product" : json.productName ? "firecrawl-json" : jsonLdProduct ? "json-ld" : "metadata",
      };
    },
  };
}

export function getScrapeDiagnostics(sourceUrl, result, extracted, imageCandidates) {
  return {
    retailer: getHostname(sourceUrl),
    pageAccessible: Boolean(result),
    extractionMethod: extracted?.method || "none",
    productNameExtracted: Boolean(extracted?.productName),
    priceExtracted: extracted?.currentPrice !== null && extracted?.currentPrice !== undefined,
    validImageCandidates: imageCandidates.length,
  };
}
