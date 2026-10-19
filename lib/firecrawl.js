import Firecrawl from "@mendable/firecrawl-js";
import { normalizeCurrencyCode, normalizePrice } from "@/lib/price-history.mjs";
import { getCurrentProductPrice } from "@/lib/product-price.mjs";

const firecrawl = new Firecrawl({
  apiKey: process.env.FIRECRAWL_API_KEY,
});

function getUsableImageUrl(value, sourceUrl) {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const imageUrl = new URL(value.trim(), sourceUrl);
    if (!["http:", "https:"].includes(imageUrl.protocol)) return null;
    if (imageUrl.hostname === "placehold.co") return null;
    return imageUrl.toString();
  } catch {
    return null;
  }
}

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

  for (const candidate of [...normalizedCandidates, ...markdownImages]) {
    const imageUrl = getUsableImageUrl(candidate, sourceUrl);
    if (imageUrl) return imageUrl;
  }

  return null;
}

export async function scrapeProduct(url) {
  try {
    const result = await firecrawl.scrape(url, {
      formats: [
        "markdown",
        "product",
        {
          type: "json",
          schema: {
            type: "object",
            required: ["productName", "currentPrice"],
            properties: {
              productName: {
                type: "string",
              },
              currentPrice: {
                type: "string",
                description:
                  "The current customer payable selling price after discounts, never the MRP, list price, or crossed-out original price.",
              },
              originalPrice: {
                type: "string",
                description:
                  "The MRP/list/original price only when separately shown from the current selling price.",
              },
              currencyCode: {
                type: "string",
              },
              productImageUrl: {
                type: "string",
                description:
                  "Absolute URL of the main product image.",
              },
              imageUrls: {
                type: "array",
                items: { type: "string" },
                description:
                  "Absolute URLs of product images, with the main image first.",
              },
            },
          },
          prompt: `
Extract the following information from the product page.

Return ONLY valid JSON.

Fields:
- productName
- currentPrice (the amount a customer pays now after discounts; numbers only, no currency symbols)
- originalPrice (MRP/list/original price only if shown separately; numbers only, no currency symbols)
- currencyCode (INR, USD, EUR, etc.)
- productImageUrl
- imageUrls (optional)

Rules:
- Prefer the live selling/offer price beside the purchase controls. For example, if the page shows "MRP ₹1,690" and "Get it for ₹1,590", currentPrice is 1590 and originalPrice is 1690.
- Never return MRP, list price, crossed-out price, EMI, installment, savings, delivery, or another variant's price as currentPrice.
- If a live selling price is unavailable, do not substitute the MRP as currentPrice.
- productImageUrl must be the main/highest quality product image.
- Return the complete absolute image URL.
- Do not return thumbnails.
- Do not return data:image URLs.
- If multiple images exist, return the first main image.
`,
        },
      ],
    });

    const extractedData = result?.json;
    const productProfile = result?.product;
    const structuredPrice = getCurrentProductPrice(productProfile, { sourceUrl: url });
    const extractedName =
      (typeof productProfile?.title === "string" && productProfile.title.trim()) ||
      (typeof extractedData?.productName === "string" && extractedData.productName.trim());

    if (!productProfile && !extractedData) {
      throw new Error("No data extracted from the page.");
    }

    if (!extractedName) {
      throw new Error("Product name not found.");
    }

    const hasStructuredVariants = (productProfile?.variants?.length ?? 0) > 0;
    const normalizedPrice =
      structuredPrice?.currentPrice ??
      (hasStructuredVariants ? null : normalizePrice(extractedData?.currentPrice));
    if (normalizedPrice === null) {
      throw new Error("Current selling price not found. MRP will not be saved as a substitute.");
    }

    const imageUrl = getImageCandidates(
      result,
      extractedData,
      productProfile,
      url
    );

    return {
      productName: extractedName,
      currentPrice: normalizedPrice,
      currencyCode: normalizeCurrencyCode(
        structuredPrice?.currencyCode || extractedData?.currencyCode
      ),
      productImageUrl: imageUrl,
    };
  } catch (error) {
    console.error("Firecrawl Error:", error);

    throw new Error(
      `Failed to scrape product: ${error.message || "Unknown error"}`
    );
  }
}
