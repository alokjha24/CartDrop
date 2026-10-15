const FREQUENCY_WINDOW_MS = {
  immediate: 0,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

function validPrice(value) {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function validTimestamp(value) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function evaluatePriceAlert(alert, {
  currentPrice,
  previousPrice,
  history = [],
  now = Date.now(),
} = {}) {
  if (!alert?.enabled) return null;

  const price = validPrice(currentPrice);
  const previous = validPrice(previousPrice);
  if (price === null) return null;

  const lastTriggeredAt = validTimestamp(alert.last_triggered_at);
  const frequencyWindow = FREQUENCY_WINDOW_MS[alert.frequency];
  if (frequencyWindow === undefined) {
    throw new RangeError(`Unsupported alert frequency: ${alert.frequency}`);
  }
  if (lastTriggeredAt !== null && now - lastTriggeredAt < frequencyWindow) {
    return null;
  }

  let qualifies = false;
  if (alert.alert_type === "target_price") {
    const target = validPrice(alert.threshold);
    const previouslyTriggered = validTimestamp(alert.last_triggered_at) !== null;
    qualifies =
      target !== null &&
      price <= target &&
      (!previouslyTriggered || previous === null || previous > target);
  } else if (alert.alert_type === "percentage_drop") {
    const baseline = validPrice(alert.baseline_price) ?? previous;
    const threshold = Number(alert.threshold);
    qualifies =
      baseline !== null &&
      Number.isFinite(threshold) &&
      threshold > 0 &&
      threshold <= 100 &&
      price < baseline &&
      ((baseline - price) / baseline) * 100 >= threshold;
  } else if (alert.alert_type === "lowest_price") {
    const windowDays = Number(alert.observation_window_days);
    if (![30, 90].includes(windowDays)) {
      throw new RangeError(`Unsupported lowest-price window: ${alert.observation_window_days}`);
    }
    const cutoff = now - windowDays * 24 * 60 * 60 * 1000;
    const validHistory = history
      .map((record) => ({
        price: validPrice(record.price),
        timestamp: validTimestamp(record.checked_at),
      }))
      .filter((record) => record.price !== null && record.timestamp !== null && record.timestamp >= cutoff && record.timestamp <= now);
    const priorLowest = validHistory.length > 0
      ? Math.min(...validHistory.map((record) => record.price))
      : null;
    qualifies = priorLowest !== null && price < priorLowest;
  } else {
    throw new RangeError(`Unsupported alert type: ${alert.alert_type}`);
  }

  if (!qualifies) return null;

  return {
    alertId: alert.id,
    alertType: alert.alert_type,
    triggeringPrice: price,
    previousPrice: previous,
    triggeredAt: new Date(now).toISOString(),
  };
}

export function evaluatePriceAlerts(alerts, context = {}) {
  return (Array.isArray(alerts) ? alerts : [])
    .map((alert) => evaluatePriceAlert(alert, context))
    .filter(Boolean);
}
