import test from "node:test";
import assert from "node:assert/strict";
import {
  extractProductImageCandidates,
  getProductImageSrc,
  normalizeProductImageUrl,
} from "./product-image.mjs";

const pageUrl = "https://shop.example/products/headphones";

test("extracts JSON-LD image strings and arrays before social metadata", () => {
  const html = `
    <script type="application/ld+json">
      {"@type":"Product","image":["/images/main.jpg","https://cdn.example/alt.jpg"]}
    </script>
  `;
  assert.deepEqual(
    extractProductImageCandidates({
      html,
      metadata: { ogImage: "https://cdn.example/og.jpg" },
      pageUrl,
    }),
    [
      "https://shop.example/images/main.jpg",
      "https://cdn.example/alt.jpg",
      "https://cdn.example/og.jpg",
    ]
  );
});

test("uses Open Graph and Twitter images when JSON-LD is missing", () => {
  assert.deepEqual(
    extractProductImageCandidates({
      metadata: {
        "og:image": "https://cdn.example/og.jpg",
        "twitter:image": "https://cdn.example/twitter.jpg",
      },
      pageUrl,
    }),
    ["https://cdn.example/og.jpg", "https://cdn.example/twitter.jpg"]
  );
});

test("rejects unsafe image protocols and placeholders", () => {
  assert.equal(normalizeProductImageUrl("javascript:alert(1)", pageUrl), null);
  assert.equal(normalizeProductImageUrl("data:image/png;base64,abc", pageUrl), null);
  assert.equal(normalizeProductImageUrl("https://placehold.co/600x600", pageUrl), null);
  assert.equal(normalizeProductImageUrl("https://cdn.example/assets/transparent.gif", pageUrl), null);
  assert.equal(normalizeProductImageUrl("https://cdn.example/pixel.gif", pageUrl), null);
  assert.equal(normalizeProductImageUrl("https://cdn.example/assets/discount-badge.png", pageUrl), null);
  assert.equal(normalizeProductImageUrl("https://cdn.example/assets/product-icon.svg", pageUrl), null);
  assert.equal(normalizeProductImageUrl(pageUrl, pageUrl), null);
  assert.equal(normalizeProductImageUrl("https://cdn.example/{productImagePath}", pageUrl), null);
  assert.equal(normalizeProductImageUrl("/images/item.jpg", pageUrl), "https://shop.example/images/item.jpg");
});

test("preserves image priority across nested JSON-LD and case-insensitive metadata", () => {
  const html = `
    <script type="application/ld+json">
      {"@graph":[{"mainEntity":{"image":{"url":"/images/primary.jpg"}}}]}
    </script>
  `;
  assert.deepEqual(
    extractProductImageCandidates({
      html,
      metadata: { "OG:IMAGE": "https://cdn.example/social.jpg" },
      pageUrl,
    }),
    [
      "https://shop.example/images/primary.jpg",
      "https://cdn.example/social.jpg",
    ]
  );
});

test("returns ordered HTML candidates after rejecting tracking images", () => {
  const html = `
    <img src="/pixel.gif">
    <img data-src="/images/real-product.webp">
  `;
  assert.deepEqual(
    extractProductImageCandidates({ html, pageUrl }),
    ["https://shop.example/images/real-product.webp"]
  );
});

test("extracts nested Firecrawl product image fields", () => {
  assert.deepEqual(
    extractProductImageCandidates({
      metadata: {
        images: [
          { url: "/images/product-front.jpg" },
          { src: "https://cdn.example/product-side.webp" },
        ],
      },
      pageUrl,
    }),
    [
      "https://shop.example/images/product-front.jpg",
      "https://cdn.example/product-side.webp",
    ]
  );
});

test("finds product photos embedded in escaped retailer page data", () => {
  assert.deepEqual(
    extractProductImageCandidates({
      html: String.raw`<script>window.product={images:["https:\/\/img.example.com\/goods-pic\/front_w1440_q90.webp"]}</script>`,
      pageUrl,
    }),
    ["https://img.example.com/goods-pic/front_w1440_q90.webp"]
  );
});

test("creates a proxy URL for valid remote images", () => {
  const src = getProductImageSrc("https://cdn.example/item.jpg", pageUrl);
  assert.match(src, /^\/api\/product-image\?url=/);
  assert.match(src, /source=/);
});

test("loads Savana CDN photos directly at full product-photo size", () => {
  assert.equal(
    getProductImageSrc(
      "https://img201.savana.com/v1/goods-pic/example_w96_q85.webp",
      "https://www.savana.com/details/example-product-123456"
    ),
    "https://img201.savana.com/v1/goods-pic/example_w1440_q90.webp"
  );
});

test("upgrades Zara catalog thumbnails and loads its product CDN directly", () => {
  assert.equal(
    getProductImageSrc(
      "https://static.zara.net/assets/public/b8dd/4284/43a24827800f/37cb1134adf7/01223504030-f1/01223504030-f1.jpg?ts=1792082225296&w=64",
      "https://www.zara.com/in/en/woman-skirts-l1299.html?v1=2420454"
    ),
    "https://static.zara.net/assets/public/b8dd/4284/43a24827800f/37cb1134adf7/01223504030-f1/01223504030-f1.jpg?ts=1792082225296&w=1200"
  );
});

test("uses stored Supabase product images directly", () => {
  const src = getProductImageSrc(
    "https://project.supabase.co/storage/v1/object/public/product-images/user/product.jpg",
    pageUrl
  );
  assert.equal(
    src,
    "https://project.supabase.co/storage/v1/object/public/product-images/user/product.jpg"
  );
});
