export const PRICE_RANGES = [
  { label: "7D", value: "7d", days: 7 },
  { label: "1M", value: "30d", days: 30 },
  { label: "3M", value: "90d", days: 90 },
  { label: "All", value: "all", days: null },
];

const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizePrice(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  let normalizedValue = value;

  if (typeof value === "string") {
    const trimmedValue = value.trim();
    const [integerPart, fractionPart, ...extraParts] = trimmedValue.split(".");
    const validCommaGrouping =
      /^\d{1,3}(?:,\d{3})+$/.test(integerPart) ||
      /^\d{1,3}(?:,\d{2})+,\d{3}$/.test(integerPart);
    const validInteger = integerPart.includes(",")
      ? validCommaGrouping
      : /^\d+$/.test(integerPart);
    const validFraction =
      fractionPart === undefined || /^\d+$/.test(fractionPart);

    if (!validInteger || !validFraction || extraParts.length > 0) {
      return null;
    }

    normalizedValue = trimmedValue.replaceAll(",", "");
  }

  const price = Number(normalizedValue);

  return Number.isFinite(price) && price > 0 ? price : null;
}

function toTimestamp(value) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function toNowTimestamp(now) {
  const timestamp = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(timestamp)) {
    throw new TypeError("now must be a valid date or timestamp in milliseconds");
  }
  return timestamp;
}

function compareRecords(a, b) {
  return (
    a.timestamp - b.timestamp ||
    String(a.id ?? "").localeCompare(String(b.id ?? ""))
  );
}

export function getPriceHistoryForRange(
  records,
  { range = "all", now = Date.now(), productId } = {}
) {
  const rangeOption = PRICE_RANGES.find((option) => option.value === range);
  if (!rangeOption) {
    throw new RangeError(`Unsupported price history range: ${range}`);
  }

  const nowTimestamp = toNowTimestamp(now);
  const rangeStart = rangeOption.days === null
    ? Number.NEGATIVE_INFINITY
    : nowTimestamp - rangeOption.days * DAY_MS;

  return (Array.isArray(records) ? records : [])
    .filter((record) => {
      if (!record || (productId !== undefined && String(record.product_id) !== String(productId))) {
        return false;
      }

      const price = normalizePrice(record.price);
      const timestamp = toTimestamp(record.checked_at);

      return (
        price !== null &&
        timestamp !== null &&
        timestamp >= rangeStart &&
        timestamp <= nowTimestamp
      );
    })
    .map((record) => ({
      ...record,
      timestamp: toTimestamp(record.checked_at),
      price: normalizePrice(record.price),
    }))
    .sort(compareRecords);
}

export function getLatestPriceRecord(records, { now = Date.now(), productId } = {}) {
  const validRecords = getPriceHistoryForRange(records, {
    range: "all",
    now,
    productId,
  });

  return validRecords.at(-1) ?? null;
}

export function summarizePriceHistory(records, { now = Date.now(), productId } = {}) {
  const validRecords = getPriceHistoryForRange(records, {
    range: "all",
    now,
    productId,
  });

  if (validRecords.length === 0) {
    return {
      lowestPrice: null,
      highestPrice: null,
      sampleCount: 0,
      firstPrice: null,
      lastPrice: null,
      averagePrice: null,
      typicalPrice: null,
      change: null,
    };
  }

  const prices = validRecords.map((record) => record.price);
  const firstPrice = prices[0];
  const lastPrice = prices.at(-1);
  const averagePrice =
    prices.reduce((total, price) => total + price, 0) / prices.length;
  const frequency = new Map();

  prices.forEach((price, index) => {
    const entry = frequency.get(price) ?? { count: 0, lastIndex: -1 };
    frequency.set(price, {
      count: entry.count + 1,
      lastIndex: index,
    });
  });

  const typicalPrice = [...frequency.entries()]
    .sort(([priceA, entryA], [priceB, entryB]) =>
      entryB.count - entryA.count ||
      Math.abs(priceA - averagePrice) - Math.abs(priceB - averagePrice) ||
      entryB.lastIndex - entryA.lastIndex
    )[0][0];

  return {
    lowestPrice: Math.min(...prices),
    highestPrice: Math.max(...prices),
    sampleCount: validRecords.length,
    firstPrice,
    lastPrice,
    averagePrice,
    typicalPrice,
    change: lastPrice - firstPrice,
  };
}

export function shouldRecordPriceSample(latestRecord, value, now = Date.now()) {
  const price = normalizePrice(value);
  if (price === null) return false;

  const nowTimestamp = toNowTimestamp(now);
  const latestPrice = normalizePrice(latestRecord?.price);
  const latestTimestamp = toTimestamp(latestRecord?.checked_at);

  if (
    latestPrice === null ||
    latestTimestamp === null ||
    latestTimestamp > nowTimestamp
  ) {
    return true;
  }

  const latestDay = new Date(latestTimestamp).toISOString().slice(0, 10);
  const currentDay = new Date(nowTimestamp).toISOString().slice(0, 10);

  // Keep one unchanged observation per UTC day, while preserving every real
  // same-day price change as a separate point in the history.
  return price !== latestPrice || latestDay !== currentDay;
}

export function normalizeCurrencyCode(value, fallback = "INR") {
  const candidate = typeof value === "string" ? value.trim().toUpperCase() : "";

  if (/^[A-Z]{3}$/.test(candidate)) {
    try {
      new Intl.NumberFormat("en", { style: "currency", currency: candidate });
      return candidate;
    } catch {
      // Fall through to the validated fallback.
    }
  }

  try {
    new Intl.NumberFormat("en", { style: "currency", currency: fallback });
    return fallback;
  } catch {
    return "INR";
  }
}
