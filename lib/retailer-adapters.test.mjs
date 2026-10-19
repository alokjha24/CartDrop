import test from "node:test";
import assert from "node:assert/strict";
import {
  createRetailerAdapter,
  getScrapeDiagnostics,
} from "./retailer-adapters.mjs";

test("keeps the generic adapter compatible with a Savana-style Firecrawl result", () => {
  const result = {
    json: { productName: "Savana Jacket", currentPrice: "1590", currencyCode: "INR" },
    metadata: {},
  };
  const extracted = createRetailerAdapter("https://www.savana.com/product/jacket")
    .extractProduct(result);

  assert.equal(extracted.productName, "Savana Jacket");
  assert.equal(extracted.currentPrice, 1590);
  assert.equal(extracted.method, "firecrawl-json");
});

test("extracts Zara-like accessible JSON-LD without relying on private selectors", () => {
  const result = {
    html: `
      <script type="application/ld+json">
        {"@type":"Product","name":"Tailored Jacket","offers":{"price":"79.95","priceCurrency":"EUR"}}
      </script>
    `,
    metadata: {},
  };
  const extracted = createRetailerAdapter("https://www.zara.com/uk/en/jacket-p123.html")
    .extractProduct(result);

  assert.equal(extracted.productName, "Tailored Jacket");
  assert.equal(extracted.currentPrice, 79.95);
  assert.equal(extracted.currencyCode, "EUR");
  assert.equal(extracted.method, "json-ld");
});

test("reports sanitized extraction diagnostics", () => {
  const diagnostics = getScrapeDiagnostics(
    "https://www.example.com/product",
    {},
    { method: "json-ld", productName: "Item", currentPrice: 10 },
    ["https://cdn.example/item.jpg"]
  );

  assert.deepEqual(diagnostics, {
    retailer: "www.example.com",
    pageAccessible: true,
    extractionMethod: "json-ld",
    productNameExtracted: true,
    priceExtracted: true,
    validImageCandidates: 1,
  });
});
