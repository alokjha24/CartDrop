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

test("extracts Amazon's product title and current price from its main price panel", () => {
  const result = {
    html: `
      <html><head><title>Amazon.in</title></head><body>
        <span id="productTitle">Men's 505 Blue Straight fit mid Rise Jeans</span>
        <div id="corePrice_feature_div">
          <span class="a-price"><span class="a-offscreen">₹1,099.00</span></span>
          <span class="a-price a-text-price" data-a-strike="true">
            <span class="a-offscreen">₹3,099.00</span>
          </span>
          <span>M.R.P.: ₹3,099.00</span>
        </div>
      </body></html>
    `,
    metadata: {},
  };
  const extracted = createRetailerAdapter("https://www.amazon.in/dp/B0GRTTNB3J")
    .extractProduct(result);

  assert.equal(extracted.productName, "Men's 505 Blue Straight fit mid Rise Jeans");
  assert.equal(extracted.currentPrice, 1099);
  assert.equal(extracted.originalPrice, 3099);
  assert.equal(extracted.currencyCode, "INR");
  assert.equal(extracted.method, "amazon-html");
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
