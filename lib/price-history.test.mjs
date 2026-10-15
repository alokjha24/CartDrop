import test from "node:test";
import assert from "node:assert/strict";
import {
  getLatestPriceRecord,
  getPriceHistoryForRange,
  normalizeCurrencyCode,
  normalizePrice,
  shouldRecordPriceSample,
  summarizePriceHistory,
} from "./price-history.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-13T12:00:00.000Z");

function record(id, daysAgo, price, productId = "product-a") {
  return {
    id,
    product_id: productId,
    checked_at: new Date(NOW - daysAgo * DAY_MS).toISOString(),
    price,
  };
}

test("normalizes positive numeric prices and rejects invalid, zero, or negative prices", () => {
  assert.equal(normalizePrice(1521), 1521);
  assert.equal(normalizePrice("1,521.50"), 1521.5);
  assert.equal(normalizePrice("1,52,100"), 152100);
  assert.equal(normalizePrice("12,4"), null);
  assert.equal(normalizePrice("0"), null);
  assert.equal(normalizePrice(-12), null);
  assert.equal(normalizePrice("₹1,521"), null);
  assert.equal(normalizePrice("12.4.5"), null);
  assert.equal(normalizePrice(null), null);
  assert.equal(normalizePrice(""), null);
});

test("calculates min, max, count, and chronological change from actual samples", () => {
  const history = [
    record("d5", 0, 1400),
    record("d2", 3, 1521),
    record("d1", 4, 1800),
    record("d3", 2, 1650),
  ];
  const filtered = getPriceHistoryForRange(history, { range: "all", now: NOW });
  const summary = summarizePriceHistory(filtered, { now: NOW });

  assert.deepEqual(filtered.map((item) => item.price), [1800, 1521, 1650, 1400]);
  assert.deepEqual(summary, {
    lowestPrice: 1400,
    highestPrice: 1800,
    sampleCount: 4,
    firstPrice: 1800,
    lastPrice: 1400,
    averagePrice: 1592.75,
    typicalPrice: 1650,
    change: -400,
  });
  assert.equal(getLatestPriceRecord(history, { now: NOW })?.price, 1400);
});

test("identical prices still count as separate saved samples", () => {
  const history = [record("second", 0, 1521), record("first", 1, 1521)];
  const summary = summarizePriceHistory(
    getPriceHistoryForRange(history, { range: "all", now: NOW }),
    { now: NOW }
  );

  assert.equal(summary.lowestPrice, 1521);
  assert.equal(summary.highestPrice, 1521);
  assert.equal(summary.sampleCount, 2);
  assert.equal(summary.averagePrice, 1521);
  assert.equal(summary.typicalPrice, 1521);
  assert.equal(summary.change, 0);
});

test("range cutoffs are inclusive and future records are excluded", () => {
  const history = [
    record("inside", 7, 1200),
    record("outside", 7 + 1 / DAY_MS, 1100),
    { ...record("future", 0, 1000), checked_at: new Date(NOW + 1).toISOString() },
  ];

  const filtered = getPriceHistoryForRange(history, { range: "7d", now: NOW });

  assert.deepEqual(filtered.map((item) => item.id), ["inside"]);
});

test("30D and 90D use inclusive millisecond cutoffs", () => {
  const history = [
    record("at-30d", 30, 1300),
    { ...record("before-30d", 30, 1250), checked_at: new Date(NOW - 30 * DAY_MS - 1).toISOString() },
    record("at-90d", 90, 1200),
    { ...record("before-90d", 90, 1150), checked_at: new Date(NOW - 90 * DAY_MS - 1).toISOString() },
  ];

  assert.deepEqual(
    getPriceHistoryForRange(history, { range: "30d", now: NOW }).map((item) => item.id),
    ["at-30d"]
  );
  assert.deepEqual(
    getPriceHistoryForRange(history, { range: "90d", now: NOW }).map((item) => item.id),
    ["at-90d", "before-30d", "at-30d"]
  );
});

test("filters isolate products and handle out-of-order input", () => {
  const history = [
    record("b", 1, 900, "product-b"),
    record("a2", 2, 1200, "product-a"),
    record("a1", 3, 1300, "product-a"),
  ];

  assert.deepEqual(
    getPriceHistoryForRange(history, {
      range: "all",
      now: NOW,
      productId: "product-a",
    }).map((item) => item.id),
    ["a1", "a2"]
  );
});

test("duplicate timestamps have deterministic ordering", () => {
  const checkedAt = new Date(NOW - DAY_MS).toISOString();
  const history = [
    { id: "b", product_id: "product-a", checked_at: checkedAt, price: 1200 },
    { id: "a", product_id: "product-a", checked_at: checkedAt, price: 1300 },
  ];

  const ordered = getPriceHistoryForRange(history, { range: "all", now: NOW });
  assert.deepEqual(ordered.map((item) => item.id), ["a", "b"]);
  assert.equal(getLatestPriceRecord(history, { now: NOW })?.price, 1200);
});

test("latest history record is independent from an older selected period", () => {
  const history = [record("latest", 8, 1400)];
  const selectedPeriod = getPriceHistoryForRange(history, {
    range: "7d",
    now: NOW,
  });

  assert.equal(getLatestPriceRecord(history, { now: NOW })?.price, 1400);
  assert.deepEqual(summarizePriceHistory(selectedPeriod, { now: NOW }), {
    lowestPrice: null,
    highestPrice: null,
    sampleCount: 0,
    firstPrice: null,
    lastPrice: null,
    averagePrice: null,
    typicalPrice: null,
    change: null,
  });
});

test("saved product current price can differ from historical samples", () => {
  const product = { current_price: "1,450" };
  const history = [record("latest-sample", 0, 1521)];
  const summary = summarizePriceHistory(
    getPriceHistoryForRange(history, { range: "all", now: NOW }),
    { now: NOW }
  );

  assert.equal(normalizePrice(product.current_price), 1450);
  assert.equal(summary.lastPrice, 1521);
  assert.equal(summary.lowestPrice, 1521);
  assert.equal(summary.highestPrice, 1521);
});

test("empty or entirely invalid history has null statistics and zero samples", () => {
  assert.deepEqual(summarizePriceHistory([]), {
    lowestPrice: null,
    highestPrice: null,
    sampleCount: 0,
    firstPrice: null,
    lastPrice: null,
    averagePrice: null,
    typicalPrice: null,
    change: null,
  });
  assert.equal(
    getPriceHistoryForRange(
      [record("invalid", 0, 0), { ...record("missing-time", 0, 10), checked_at: "bad" }],
      { range: "all", now: NOW }
    ).length,
    0
  );
});

test("same-day duplicate samples are suppressed but real price changes are saved", () => {
  const latest = record("latest", 0, 1521);
  assert.equal(shouldRecordPriceSample(latest, 1521, NOW), false);
  assert.equal(shouldRecordPriceSample(latest, 1500, NOW), true);
  assert.equal(shouldRecordPriceSample(latest, 0, NOW), false);
  assert.equal(shouldRecordPriceSample(record("yesterday", 1, 1521), 1521, NOW), true);
  assert.equal(shouldRecordPriceSample(null, 1521, NOW), true);
});

test("normalizes known currencies and falls back to INR for invalid currency codes", () => {
  assert.equal(normalizeCurrencyCode("usd"), "USD");
  assert.equal(normalizeCurrencyCode("not-a-currency"), "INR");
  assert.equal(normalizeCurrencyCode(undefined), "INR");
});
