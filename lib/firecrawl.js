import Firecrawl from "@mendable/firecrawl-js";

const firecrawl = new Firecrawl({
  apiKey: process.env.FIRECRAWL_API_KEY,
});

export async function scrapeProduct(url) {
  try {
    const result = await firecrawl.scrape(url, {
      formats: [
        "markdown",
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
              },
              currencyCode: {
                type: "string",
              },
              productImageUrl: {
                type: "string",
                description:
                  "Absolute URL of the main product image.",
              },
            },
          },
          prompt: `
Extract the following information from the product page.

Return ONLY valid JSON.

Fields:
- productName
- currentPrice (numbers only, no currency symbols)
- currencyCode (INR, USD, EUR, etc.)
- productImageUrl

Rules:
- productImageUrl must be the main/highest quality product image.
- Return the complete absolute image URL.
- Do not return thumbnails.
- Do not return data:image URLs.
- If multiple images exist, return the first main image.
`,
        },
      ],
    });

    console.log("Firecrawl Response:", result);

    const extractedData = result?.json;

    console.log("Extracted Data:", extractedData);

    if (!extractedData) {
      throw new Error("No data extracted from the page.");
    }

    if (!extractedData.productName) {
      throw new Error("Product name not found.");
    }

    if (!extractedData.currentPrice) {
      throw new Error("Product price not found.");
    }

    const cleanedPrice = extractedData.currentPrice
      ?.toString()
      .replace(/[^\d.]/g, "")
      .trim();

    const imageUrl =
      extractedData.productImageUrl?.trim() ||
      result?.metadata?.ogImage ||
      result?.metadata?.image ||
      result?.metadata?.["og:image"] ||
      null;

    console.log("Final Image URL:", imageUrl);

    return {
      productName: extractedData.productName.trim(),
      currentPrice: cleanedPrice,
      currencyCode: extractedData.currencyCode?.trim() || "USD",
      productImageUrl: imageUrl,
    };
  } catch (error) {
    console.error("Firecrawl Error:", error);

    throw new Error(
      `Failed to scrape product: ${error.message || "Unknown error"}`
    );
  }
}