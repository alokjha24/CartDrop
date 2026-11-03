import test from "node:test";
import assert from "node:assert/strict";
import { getCurrentProductPrice, selectCurrentSellingPrice } from "./product-price.mjs";

test("uses the discounted selling price instead of the MRP", () => {
  const result = getCurrentProductPrice({
    variants: [
      {
        price: { amount: 1590, currency: "INR", formatted: "₹1,590" },
        sale: { originalPrice: { amount: 1690, currency: "INR" } },
        availability: { inStock: true },
      },
    ],
  });

  assert.deepEqual(result, { currentPrice: 1590, currencyCode: "INR" });
});

test("uses the variant selected in the product URL when the page has variants", () => {
  const result = getCurrentProductPrice(
    {
      variants: [
        {
          id: "small",
          price: { amount: 1590, currency: "INR" },
          availability: { inStock: true },
        },
        {
          id: "484",
          price: { amount: 1690, currency: "INR" },
          availability: { inStock: true },
        },
      ],
    },
    { sourceUrl: "https://savana.com/details/item?vid=484" }
  );

  assert.deepEqual(result, { currentPrice: 1690, currencyCode: "INR" });
});

test("prefers an in-stock variant and skips variants without a valid current price", () => {
  const result = getCurrentProductPrice({
    variants: [
      {
        price: { amount: 0, currency: "INR" },
        availability: { inStock: true },
      },
      {
        price: { amount: 1800, currency: "INR" },
        availability: { inStock: false },
      },
      {
        price: { amount: 1700, currency: "INR" },
        availability: { inStock: true },
      },
    ],
  });

  assert.deepEqual(result, { currentPrice: 1700, currencyCode: "INR" });
});

test("returns null when structured product data has no valid selling price", () => {
  assert.equal(
    getCurrentProductPrice({
      variants: [{ sale: { originalPrice: { amount: 1690 } } }],
    }),
    null
  );
  assert.equal(getCurrentProductPrice(null), null);
});

test("prefers the structured selling price over an extracted promotional amount", () => {
  assert.equal(selectCurrentSellingPrice({
    structuredPrice: 1521,
    extractedPrice: 1421,
    adapterPrice: 1521,
  }), 1521);
});

test("falls back only to extracted or adapter selling prices when structured price is absent", () => {
  assert.equal(selectCurrentSellingPrice({ extractedPrice: "572" }), 572);
  assert.equal(selectCurrentSellingPrice({ adapterPrice: 999 }), 999);
  assert.equal(selectCurrentSellingPrice({
    hasStructuredVariants: true,
    adapterPrice: 1521,
    amazonPrice: 1521,
  }), 1521);
  assert.equal(selectCurrentSellingPrice({ structuredPrice: 0, extractedPrice: "bad" }), null);
});
