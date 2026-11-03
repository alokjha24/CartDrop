import assert from "node:assert/strict";
import test from "node:test";
import {
  extractLabeledProductPricing,
  extractProductPageMetadata,
} from "./product-offer.mjs";

test("extracts exact MRP and Get it for amounts from labeled product HTML", () => {
  assert.deepEqual(
    extractLabeledProductPricing({
      html: "<main><span>MRP</span><b>₹1,390</b><div>Get it for</div><strong>₹1,112</strong></main>",
    }),
    { getItForPrice: 1112, mrp: 1390 }
  );
});

test("extracts labeled prices from plain page text", () => {
  assert.deepEqual(
    extractLabeledProductPricing({ markdown: "MRP ₹1,390 · Get it for ₹1,112" }),
    { getItForPrice: 1112, mrp: 1390 }
  );
});

test("does not invent MRP or offer prices when labels are absent", () => {
  assert.deepEqual(
    extractLabeledProductPricing({ markdown: "Price ₹1,112 · Save 20%" }),
    { getItForPrice: null, mrp: null }
  );
});

test("reads the product title from a direct retailer HTML response", () => {
  assert.deepEqual(
    extractProductPageMetadata('<html><head><title>A-Line Dress | Savana</title></head></html>'),
    { productName: "A-Line Dress | Savana" }
  );
});
