import test from "node:test";
import assert from "node:assert/strict";
import {
  getProductDisplayTitle,
  getRetailerHomeUrl,
  getRetailerLabel,
  normalizeProductUrl,
} from "./product-url.mjs";

test("normalizes tracking parameters without removing product parameters", () => {
  const result = normalizeProductUrl(
    "https://www.amazon.in/dp/ABC123?tag=partner&utm_source=mail&variant=blue#details"
  );

  assert.equal(result.url, "https://www.amazon.in/dp/ABC123?variant=blue");
  assert.equal(result.retailer, "Amazon");
});

test("rejects malformed, unsupported, and private URLs", () => {
  assert.match(normalizeProductUrl("not a url").error, /valid product URL/);
  assert.match(normalizeProductUrl("ftp://example.com/item").error, /HTTP/);
  assert.match(normalizeProductUrl("http://localhost:3000/item").error, /Private/);
});

test("uses a readable store name for any retailer domain", () => {
  assert.equal(getRetailerLabel("https://www.savana.com/details/item-123"), "Savana");
  assert.equal(getRetailerLabel("shop.example.com"), "Example");
  assert.equal(getRetailerLabel("https://shop.example.co.uk/products/item"), "Example");
});

test("creates the retailer home page URL from a product URL", () => {
  assert.equal(
    getRetailerHomeUrl("https://www.savana.com/details/item-123?vid=5"),
    "https://www.savana.com/"
  );
  assert.equal(getRetailerHomeUrl("not a URL"), null);
});

test("creates a readable fallback when a legacy title is a raw URL", () => {
  assert.equal(
    getProductDisplayTitle(
      "https://www.savana.com/details/high-waist-vintage-wash-straight-leg-jeans-123456",
      "https://www.savana.com/details/high-waist-vintage-wash-straight-leg-jeans-123456"
    ),
    "High Waist Vintage Wash Straight Leg Jeans"
  );
});

test("removes an embedded raw URL from a legacy product title", () => {
  assert.equal(
    getProductDisplayTitle(
      "Gathered A-Line Dress https://www.savana.com/details/gathered-a-line-dress-2373332?vid=5",
      "https://www.savana.com/details/gathered-a-line-dress-2373332?vid=5"
    ),
    "Gathered A-Line Dress"
  );
});

test("removes a Savana URL and everything after it from a legacy title", () => {
  assert.equal(
    getProductDisplayTitle(
      "Gathered A-Line Dress https://www.savana.com/details/gathered-a-line-dress-2373332?vid=5 extra",
      "https://www.savana.com/details/gathered-a-line-dress-2373332?vid=5"
    ),
    "Gathered A-Line Dress"
  );
});

test("removes a Savana URL without a protocol from a legacy title", () => {
  assert.equal(
    getProductDisplayTitle(
      "Gathered A-Line Dress www.savana.com/details/gathered-a-line-dress-2373332",
      "https://www.savana.com/details/gathered-a-line-dress-2373332"
    ),
    "Gathered A-Line Dress"
  );
});

test("never returns Savana text as the visible title", () => {
  assert.equal(
    getProductDisplayTitle(
      "HTTPS://WWW.SAVANA.COM/DETAILS/GATHERED-A-LINE-DRESS-2373332?VID=5",
      "https://www.savana.com/details/gathered-a-line-dress-2373332?vid=5"
    ),
    "Gathered A Line Dress"
  );
});
