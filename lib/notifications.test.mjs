import assert from "node:assert/strict";
import test from "node:test";
import {
  renderPriceAlertEmail,
  sendPriceAlertEmail,
} from "./notifications.mjs";

const basePayload = {
  productName: "Noise-cancelling headphones",
  productUrl: "https://shop.example/products/headphones?ref=cartdrop",
  productImageUrl: "https://shop.example/images/headphones.jpg",
  currency: "INR",
  price: 1590,
  previousPrice: 1990,
};

test("renders the supported alert headlines and relevant details", () => {
  const target = renderPriceAlertEmail({
    ...basePayload,
    alertType: "target_price",
    targetPrice: 1600,
  });
  const drop = renderPriceAlertEmail({
    ...basePayload,
    alertType: "percentage_drop",
  });
  const lowest = renderPriceAlertEmail({
    ...basePayload,
    alertType: "lowest_price",
    observationWindowDays: 30,
  });

  assert.match(target.html, /Your price target has been reached/);
  assert.match(target.html, /Your target:.*₹1,600/);
  assert.match(drop.html, /The price just dropped/);
  assert.match(drop.html, /Down 20\.1%/);
  assert.match(lowest.html, /A new low price has been detected/);
  assert.match(lowest.html, /Observation window:.*30 days/);
});

test("escapes product content and rejects unsafe links", () => {
  const email = renderPriceAlertEmail({
    ...basePayload,
    productName: `<img src=x onerror=alert(1)> "deal"`,
    productUrl: "javascript:alert(1)",
    productImageUrl: "data:text/html,bad",
    alertType: "unknown_type",
  });

  assert.match(email.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(email.html, /javascript:/);
  assert.doesNotMatch(email.html, /<img src="data:/);
  assert.doesNotMatch(email.html, /href=/);
  assert.match(email.text, /Your price alert/);
});

test("renders safely when optional fields are missing", () => {
  const email = renderPriceAlertEmail({
    productName: "A product",
    productUrl: "https://shop.example/product",
    currency: "INVALID",
    price: "not-a-price",
    alertType: "lowest_price",
    observationWindowDays: 7,
  });

  assert.match(email.html, /Product image unavailable/);
  assert.match(email.html, /Price unavailable/);
  assert.doesNotMatch(email.html, /Observation window/);
});

test("requires configuration and surfaces Resend failures", async () => {
  const originalEnv = {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    NOTIFICATION_EMAIL: process.env.NOTIFICATION_EMAIL,
  };
  const originalFetch = globalThis.fetch;

  try {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    delete process.env.NOTIFICATION_EMAIL;
    await assert.rejects(
      sendPriceAlertEmail(basePayload),
      /Email notifications are not configured/
    );

    process.env.RESEND_API_KEY = "test-key";
    process.env.RESEND_FROM_EMAIL = "alerts@example.com";
    process.env.NOTIFICATION_EMAIL = "user@example.com";
    let request;
    globalThis.fetch = async (url, options) => {
      request = { url, options };
      return {
        ok: false,
        status: 422,
        text: async () => "invalid recipient",
      };
    };
    await assert.rejects(
      sendPriceAlertEmail({ ...basePayload, alertType: "target_price" }),
      /Resend request failed \(422\): invalid recipient/
    );
    assert.equal(request.url, "https://api.resend.com/emails");
    assert.equal(request.options.headers.Authorization, "Bearer test-key");
    const body = JSON.parse(request.options.body);
    assert.match(body.html, /Noise-cancelling headphones/);
    assert.match(body.text, /View product/);
  } finally {
    for (const [name, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    globalThis.fetch = originalFetch;
  }
});
