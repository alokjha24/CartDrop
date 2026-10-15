import test from "node:test";
import assert from "node:assert/strict";
import { evaluatePriceAlert, evaluatePriceAlerts } from "./price-alerts.mjs";

const NOW = Date.parse("2026-10-15T00:00:00.000Z");

test("target alerts trigger at or below the target", () => {
  assert.ok(evaluatePriceAlert({
    id: "target",
    alert_type: "target_price",
    threshold: 1200,
    frequency: "immediate",
    enabled: true,
  }, { currentPrice: 1200, now: NOW }));
  assert.equal(evaluatePriceAlert({
    id: "target",
    alert_type: "target_price",
    threshold: 1200,
    frequency: "immediate",
    enabled: true,
  }, { currentPrice: 1201, now: NOW }), null);
});

test("percentage alerts use the previous valid observation", () => {
  const event = evaluatePriceAlert({
    id: "drop",
    alert_type: "percentage_drop",
    threshold: 10,
    frequency: "immediate",
    enabled: true,
  }, { currentPrice: 900, previousPrice: 1000, now: NOW });

  assert.equal(event.triggeringPrice, 900);
  assert.equal(evaluatePriceAlert({
    id: "drop",
    alert_type: "percentage_drop",
    threshold: 10,
    frequency: "immediate",
    enabled: true,
  }, { currentPrice: 901, previousPrice: 1000, now: NOW }), null);
});

test("lowest-price alerts need an existing observation in the window", () => {
  const config = {
    id: "low",
    alert_type: "lowest_price",
    observation_window_days: 30,
    frequency: "immediate",
    enabled: true,
  };
  assert.equal(evaluatePriceAlert(config, { currentPrice: 900, now: NOW }), null);
  assert.ok(evaluatePriceAlert(config, {
    currentPrice: 900,
    history: [{ price: 950, checked_at: "2026-10-10T00:00:00.000Z" }],
    now: NOW,
  }));
});

test("invalid prices and disabled alerts never trigger", () => {
  const alerts = evaluatePriceAlerts([
    { id: "disabled", alert_type: "target_price", threshold: 1000, frequency: "immediate", enabled: false },
    { id: "invalid", alert_type: "target_price", threshold: 1000, frequency: "immediate", enabled: true },
  ], { currentPrice: null, now: NOW });
  assert.deepEqual(alerts, []);
});

test("frequency limits repeated events", () => {
  const event = {
    id: "target",
    alert_type: "target_price",
    threshold: 1200,
    frequency: "daily",
    enabled: true,
    last_triggered_at: "2026-10-14T12:00:00.000Z",
  };
  assert.equal(evaluatePriceAlert(event, { currentPrice: 1100, now: NOW }), null);
  assert.ok(evaluatePriceAlert(event, {
    currentPrice: 1100,
    now: Date.parse("2026-10-15T13:00:00.000Z"),
  }));
});

test("target alerts do not repeat while the price stays below target", () => {
  assert.equal(evaluatePriceAlert({
    id: "target",
    alert_type: "target_price",
    threshold: 1200,
    frequency: "immediate",
    enabled: true,
    last_triggered_at: "2026-10-14T12:00:00.000Z",
  }, {
    currentPrice: 1100,
    previousPrice: 1150,
    now: NOW,
  }), null);
});
