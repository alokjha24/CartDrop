import Firecrawl from "@mendable/firecrawl-js";
import { normalizeCurrencyCode, normalizePrice } from "@/lib/price-history.mjs";
import { getCurrentProductPricing } from "@/lib/product-price.mjs";
import {
  extractLabeledProductPricing,
  extractProductPageMetadata,
} from "@/lib/product-offer.mjs";
import {
  extractProductImageCandidates,
  normalizeProductImageUrl,
} from "@/lib/product-image.mjs";
import {
  createRetailerAdapter,
  getScrapeDiagnostics,
} from "@/lib/retailer-adapters.mjs";
import {
  fetchPublicHttps,
  isAllowedRemoteUrl,
} from "@/lib/image-url-security.mjs";

const DIRECT_PAGE_FETCH_TIMEOUT_MS = 6000;
const MAX_PRODUCT_PAGE_HTML_BYTES = 5 * 1024 * 1024;
const PAGE_FETCH_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const productImageJsonFormat = {
  type: "json",
  schema: {
    type: "object",
    properties: {
      productImageUrl: { type: "string" },
      imageUrls: { type: "array", items: { type: "string" } },
    },
  },
  prompt: `Return the main product photo URL and other product gallery photo URLs from this product page.
Ignore discount badges, offer graphics, logos, icons, recommendation tiles, and images smaller than 160×160 pixels.
Use the large product gallery image, not the green discount icon beside the price. Return complete absolute image URLs.`,
};

const productPriceJsonFormat = {
  type: "json",
  schema: {
    type: "object",
    properties: {
      productName: { type: "string" },
      currentPrice: {
        type: "string",
        description:
          "The current customer payable selling price after discounts, never the MRP, list price, or crossed-out price.",
      },
      currencyCode: { type: "string" },
      productImageUrl: {
        type: "string",
        description: "Absolute URL of the main product image.",
      },
      imageUrls: { type: "array", items: { type: "string" } },
    },
  },
  prompt: `
Extract the following information from the product page.

Return ONLY valid JSON.

Fields:
- productName
- currentPrice (the amount a customer pays now after discounts; numbers only, no currency symbols)
- currencyCode (INR, USD, EUR, etc.)
- productImageUrl
- imageUrls (optional)

Rules:
- Prefer the live selling/offer price beside the purchase controls, never MRP or a crossed-out price.
- Never return MRP, list price, EMI, installment, savings, delivery, or another variant's price as currentPrice.
- If a live selling price is unavailable, do not substitute the MRP.
- Return the main product image URL and do not return thumbnails or data URLs.
- Do not infer a discount or MRP. Those values are read only from explicit page labels or structured sale data.
`,
};

const firecrawl = new Firecrawl({
  apiKey: process.env.FIRECRAWL_API_KEY,
});

function getImageCandidates(result, extractedData, productProfile, sourceUrl) {
  const candidates = [
    extractedData?.productImageUrl,
    ...(Array.isArray(extractedData?.imageUrls) ? extractedData.imageUrls : []),
    productProfile?.image,
    productProfile?.imageUrl,
    productProfile?.image_url,
    ...(Array.isArray(productProfile?.images) ? productProfile.images : []),
    result?.metadata?.ogImage,
    result?.metadata?.image,
    result?.metadata?.["og:image"],
    result?.metadata?.twitterImage,
    result?.metadata?.["twitter:image"],
  ];

  const normalizedCandidates = candidates.flatMap((candidate) => {
    if (typeof candidate === "string") return [candidate];
    if (candidate && typeof candidate === "object") {
      return [candidate.url, candidate.src, candidate.image];
    }
    return [];
  });

  const markdown = typeof result?.markdown === "string" ? result.markdown : "";
  const markdownImages = [...markdown.matchAll(/!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)]
    .map((match) => match[1]);

  const htmlCandidates = extractProductImageCandidates({
    html: result?.html,
    metadata: {
      ...result?.metadata,
      ...extractedData,
      ...productProfile,
    },
    pageUrl: sourceUrl,
  });

  return [...new Set(
    [...normalizedCandidates, ...markdownImages, ...htmlCandidates]
      .map((candidate) => normalizeProductImageUrl(candidate, sourceUrl))
      .filter(Boolean)
  )];
}

async function getDirectPageHtml(sourceUrl, timeoutMs = DIRECT_PAGE_FETCH_TIMEOUT_MS) {
  let currentUrl;
  try {
    currentUrl = new URL(sourceUrl);
  } catch {
    return null;
  }
  if (!isAllowedRemoteUrl(currentUrl)) return null;

  const signal = AbortSignal.timeout(timeoutMs);
  let response;
  try {
    for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
      response = await fetchPublicHttps(currentUrl, {
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-IN,en-US;q=0.9,en;q=0.8",
          "User-Agent": PAGE_FETCH_USER_AGENT,
        },
        signal,
      });

      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => {});
      if (!location) return null;
      currentUrl = new URL(location, currentUrl);
      if (!isAllowedRemoteUrl(currentUrl)) return null;
    }

    if (!response?.ok) {
      await response?.body?.cancel().catch(() => {});
      return null;
    }
    const contentType = response.headers.get("content-type")?.toLowerCase() || "";
    if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      await response.body?.cancel().catch(() => {});
      return null;
    }
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_PRODUCT_PAGE_HTML_BYTES || !response.body) {
      await response.body?.cancel().catch(() => {});
      return null;
    }

    const reader = response.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_PRODUCT_PAGE_HTML_BYTES) {
          await reader.cancel();
          return null;
        }
        chunks.push(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
    }
    return Buffer.concat(chunks, totalBytes).toString("utf8");
  } catch {
    await response?.body?.cancel().catch(() => {});
    return null;
  }
}

async function getDirectPageImageCandidates(sourceUrl) {
  const html = await getDirectPageHtml(sourceUrl);
  return html ? extractProductImageCandidates({ html, pageUrl: sourceUrl }) : [];
}

export async function scrapeProduct(url, { imagesOnly = false, fast = false } = {}) {
  try {
    const formats = imagesOnly
      ? ["markdown", "html", "product", productImageJsonFormat]
      : fast
        // Keep fast refresh LLM-free while retaining the visible price labels
        // (Savana's MRP/Get it for values are present in page text, not always
        // in its structured product variant).
        ? ["markdown", "product"]
        : [
          "markdown",
          "html",
          "product",
          productPriceJsonFormat,
        ];
    const directImageCandidates = imagesOnly
      ? getDirectPageImageCandidates(url).catch(() => [])
      : Promise.resolve([]);
    let result;
    let directHtml = null;
    let scrapeError = null;
    try {
      result = await firecrawl.scrape(url, {
        formats,
        // Product prices are time-sensitive, so a manual refresh must bypass
        // Firecrawl's default two-day page cache.
        ...(!imagesOnly ? { maxAge: 0 } : {}),
      });
    } catch (error) {
      scrapeError = error;
      result = null;
      if (!imagesOnly) {
        directHtml = await getDirectPageHtml(
          url,
          fast ? 2500 : DIRECT_PAGE_FETCH_TIMEOUT_MS
        ).catch(() => null);
      }
    }

    const directMetadata = extractProductPageMetadata(directHtml);
    const mergedHtml = [directHtml, result?.html].filter(Boolean).join("\n");
    const pageResult = result
      ? {
          ...result,
          html: mergedHtml,
          metadata: { ...directMetadata, ...result.metadata },
        }
      : directHtml
        ? { html: mergedHtml, metadata: directMetadata }
        : null;
    if (!imagesOnly && !pageResult && scrapeError) throw scrapeError;

    const extractedData = pageResult?.json;
    const productProfile = pageResult?.product;
    const labeledPricing = extractLabeledProductPricing({
      html: mergedHtml,
      markdown: pageResult?.markdown,
    });
    const adapter = createRetailerAdapter(url);
    const adapterProduct = adapter.extractProduct(pageResult);
    const structuredPrice = getCurrentProductPricing(productProfile, { sourceUrl: url });
    const extractedName =
      (typeof productProfile?.title === "string" && productProfile.title.trim()) ||
      (typeof extractedData?.productName === "string" && extractedData.productName.trim()) ||
      directMetadata.productName ||
      adapterProduct.productName;

    if (
      !imagesOnly &&
      !productProfile &&
      !extractedData &&
      !directMetadata.productName &&
      !adapterProduct.productName
    ) {
      throw new Error("No data extracted from the page.");
    }

    if (!imagesOnly && !extractedName) {
      throw new Error("Product name not found.");
    }

    const hasStructuredVariants = (productProfile?.variants?.length ?? 0) > 0;
    const normalizedPrice =
      labeledPricing.getItForPrice ??
      structuredPrice?.currentPrice ??
      (hasStructuredVariants
        ? null
        : normalizePrice(extractedData?.currentPrice) ?? adapterProduct.currentPrice);
    if (!imagesOnly && normalizedPrice === null) {
      throw scrapeError || new Error(
        "Current selling price not found. MRP will not be saved as a substitute."
      );
    }
    const extractedOriginalPrice =
      labeledPricing.mrp ??
      structuredPrice?.originalPrice ??
      adapterProduct.originalPrice;
    const normalizedOriginalPrice =
      normalizedPrice !== null &&
      extractedOriginalPrice !== null &&
      extractedOriginalPrice > normalizedPrice
        ? extractedOriginalPrice
        : null;

    const imageCandidates = [...new Set([
      ...getImageCandidates(
      pageResult,
      extractedData,
      productProfile,
      url
      ),
      ...(await directImageCandidates),
    ])];
    if (imagesOnly && imageCandidates.length === 0) {
      throw new Error("Product images not found.");
    }

    return {
      productName: extractedName,
      currentPrice: normalizedPrice,
      originalPrice: normalizedOriginalPrice,
      currencyCode: normalizeCurrencyCode(
        structuredPrice?.currencyCode ||
        extractedData?.currencyCode ||
        adapterProduct.currencyCode
      ),
      productImageUrl: imageCandidates[0] || null,
      productImageCandidates: imageCandidates,
      diagnostics: getScrapeDiagnostics(url, result, {
        ...adapterProduct,
        method: structuredPrice ? "firecrawl-product-variant" : adapterProduct.method,
      }, imageCandidates),
    };
  } catch (error) {
    console.error("Firecrawl Error:", error);

    const category = /timeout|timed out/i.test(error?.message)
      ? "timeout"
      : /blocked|forbidden|captcha|access denied/i.test(error?.message)
        ? "access-restricted"
        : /price/i.test(error?.message)
          ? "price-not-found"
          : "scrape-failed";
    throw new Error(`Failed to scrape product (${category}): ${error.message || "Unknown error"}`);
  }
}
