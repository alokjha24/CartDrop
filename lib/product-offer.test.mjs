import assert from "node:assert/strict";
import test from "node:test";
import {
  extractLabeledProductPricing,
  extractProductPageMetadata,
} from "./product-offer.mjs";

test("extracts MRP and ignores conditional Get it for promotions", () => {
  assert.deepEqual(
    extractLabeledProductPricing({
      html: "<main><span>MRP</span><b>₹1,390</b><div>Get it for</div><strong>₹1,112</strong></main>",
    }),
    { mrp: 1390 }
  );
});

test("reads labeled MRP from plain page text without treating promotions as the selling price", () => {
  assert.deepEqual(
    extractLabeledProductPricing({ markdown: "MRP ₹1,390 · Get it for ₹1,112" }),
    { mrp: 1390 }
  );
});

test("does not invent MRP or offer prices when labels are absent", () => {
  assert.deepEqual(
    extractLabeledProductPricing({ markdown: "Price ₹1,112 · Save 20%" }),
    { mrp: null }
  );
});

test("reads the product title from a direct retailer HTML response", () => {
  assert.deepEqual(
    extractProductPageMetadata('<html><head><title>A-Line Dress | Savana</title></head></html>'),
    { productName: "A-Line Dress | Savana" }
  );
});
