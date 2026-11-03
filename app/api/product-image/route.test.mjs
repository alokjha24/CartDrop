import test from "node:test";
import assert from "node:assert/strict";
import {
  createPublicAddressLookup,
  isAllowedRemoteUrl,
  isPublicIpAddress,
} from "../../../lib/image-url-security.mjs";

test("allows public HTTPS retailer and CDN image hosts", () => {
  assert.equal(isAllowedRemoteUrl(new URL("https://static.zara.net/image.jpg")), true);
  assert.equal(isAllowedRemoteUrl(new URL("https://assets.myntassets.com/image.jpg")), true);
  assert.equal(isAllowedRemoteUrl(new URL("https://cdn.savana.com/image.jpg")), true);
  assert.equal(isAllowedRemoteUrl(new URL("https://new-retailer-cdn.example/image.avif")), true);
});

test("allows public IP literals while blocking non-public ranges", () => {
  assert.equal(isAllowedRemoteUrl(new URL("https://8.8.8.8/image.jpg")), true);
  assert.equal(isAllowedRemoteUrl(new URL("https://[2001:4860:4860::8888]/image.jpg")), true);
  for (const address of [
    "0.0.0.0",
    "10.0.0.1",
    "100.64.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.0.2.1",
    "192.168.1.1",
    "198.18.0.1",
    "203.0.113.1",
    "224.0.0.1",
    "::",
    "::1",
    "fc00::1",
    "fe80::1",
    "64:ff9b:1::1",
    "100::1",
    "2001:1::1",
    "2001:db8::1",
    "3fff::1",
    "::ffff:7f00:1",
  ]) {
    assert.equal(isPublicIpAddress(address), false, `${address} should not be public`);
  }
});

test("blocks non-HTTPS, private, metadata, and nonstandard-port hosts", () => {
  assert.equal(isAllowedRemoteUrl(new URL("http://cdn.savana.com/image.jpg")), false);
  assert.equal(isAllowedRemoteUrl(new URL("https://127.0.0.1/image.jpg")), false);
  assert.equal(isAllowedRemoteUrl(new URL("https://169.254.169.254/image.jpg")), false);
  assert.equal(isAllowedRemoteUrl(new URL("https://localhost/image.jpg")), false);
  assert.equal(isAllowedRemoteUrl(new URL("https://[::1]/image.jpg")), false);
  assert.equal(isAllowedRemoteUrl(new URL("https://[::ffff:7f00:1]/image.jpg")), false);
  assert.equal(isAllowedRemoteUrl(new URL("https://localhost./image.jpg")), false);
  assert.equal(isAllowedRemoteUrl(new URL("https://metadata.google.internal/image.jpg")), false);
  assert.equal(isAllowedRemoteUrl(new URL("https://cdn.savana.com:8443/image.jpg")), false);
  assert.equal(isAllowedRemoteUrl(new URL("https://user:pass@cdn.savana.com/image.jpg")), false);
});

test("pins DNS results and rejects any answer containing a non-public address", async () => {
  const publicLookup = createPublicAddressLookup((_hostname, _options, callback) => {
    callback(null, [
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ]);
  });
  const pinned = await new Promise((resolve, reject) => {
    publicLookup("retailer.example", { all: true }, (error, addresses) => {
      if (error) reject(error);
      else resolve(addresses);
    });
  });
  assert.deepEqual(pinned.map(({ address }) => address), [
    "93.184.216.34",
    "2606:2800:220:1:248:1893:25c8:1946",
  ]);

  const singleAddressLookup = createPublicAddressLookup((_hostname, _options, callback) => {
    callback(null, [{ address: "93.184.216.34", family: 4 }]);
  });
  const pinnedAddress = await new Promise((resolve, reject) => {
    singleAddressLookup("retailer.example", { family: 4 }, (error, address, family) => {
      if (error) reject(error);
      else resolve({ address, family });
    });
  });
  assert.deepEqual(pinnedAddress, { address: "93.184.216.34", family: 4 });

  const rebindingLookup = createPublicAddressLookup((_hostname, _options, callback) => {
    callback(null, [
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);
  });
  const error = await new Promise((resolve) => {
    rebindingLookup("retailer.example", {}, (lookupError) => resolve(lookupError));
  });
  assert.equal(error.code, "EACCES");
});
