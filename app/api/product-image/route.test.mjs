import test from "node:test";
import assert from "node:assert/strict";
import { isAllowedRemoteUrl } from "../../../lib/image-url-security.mjs";

test("allows public HTTPS retailer and CDN image hosts", () => {
  assert.equal(isAllowedRemoteUrl(new URL("https://static.zara.net/image.jpg")), true);
  assert.equal(isAllowedRemoteUrl(new URL("https://assets.myntassets.com/image.jpg")), true);
  assert.equal(isAllowedRemoteUrl(new URL("https://cdn.savana.com/image.jpg")), true);
  assert.equal(isAllowedRemoteUrl(new URL("https://new-retailer-cdn.example/image.avif")), true);
});

test("blocks non-HTTPS, private, unknown, and metadata hosts", () => {
  assert.equal(isAllowedRemoteUrl(new URL("http://cdn.savana.com/image.jpg")), false);
  assert.equal(isAllowedRemoteUrl(new URL("https://127.0.0.1/image.jpg")), false);
  assert.equal(isAllowedRemoteUrl(new URL("https://localhost/image.jpg")), false);
  assert.equal(isAllowedRemoteUrl(new URL("https://metadata.google.internal/image.jpg")), false);
});
