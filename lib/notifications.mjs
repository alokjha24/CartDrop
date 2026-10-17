const ALERT_COPY = {
  target_price: {
    headline: "Your price target has been reached.",
    description: "The product you are watching is now at or below your target price.",
    action: "View Product",
    badge: "TARGET REACHED",
  },
  percentage_drop: {
    headline: "The price just dropped.",
    description: "A verified price drop was detected for a product on your watchlist.",
    action: "Check New Price",
    badge: "PRICE DROP",
  },
  lowest_price: {
    headline: "A new low price has been detected.",
    description: "This is the lowest verified price in the selected observation window.",
    action: "View Price History",
    badge: "NEW LOW",
  },
};

const DEFAULT_COPY = {
  headline: "Your price alert was triggered.",
  description: "A new verified price observation is available for a product you track.",
  action: "View Product",
  badge: "PRICE ALERT",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeUrl(value, { allowRelative = false } = {}) {
  if (!value) return null;
  try {
    const url = new URL(String(value), allowRelative ? "https://cartdrop.app" : undefined);
    if (url.protocol !== "https:" && !(allowRelative && url.protocol === "http:")) {
      return null;
    }
    return escapeHtml(url.toString());
  } catch {
    return null;
  }
}

function validPrice(value) {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function formatPrice(value, currency = "INR") {
  const price = validPrice(value);
  if (price === null) return null;
  const code = /^[A-Z]{3}$/.test(String(currency).toUpperCase())
    ? String(currency).toUpperCase()
    : "INR";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2,
    }).format(price);
  } catch {
    return `${code} ${price}`;
  }
}

function percentageDrop(previousPrice, currentPrice) {
  const previous = validPrice(previousPrice);
  const current = validPrice(currentPrice);
  if (previous === null || current === null || current >= previous) return null;
  return ((previous - current) / previous) * 100;
}

function moneySummary({
  currency,
  price,
  previousPrice,
  alertType,
  targetPrice,
}) {
  const current = formatPrice(price, currency);
  const previous = formatPrice(previousPrice, currency);
  const target = formatPrice(targetPrice, currency);
  const saved = validPrice(previousPrice) && validPrice(price) && previousPrice > price
    ? formatPrice(previousPrice - price, currency)
    : null;
  const drop = alertType === "percentage_drop"
    ? percentageDrop(previousPrice, price)
    : null;

  return {
    current,
    previous,
    target,
    saved,
    drop: drop === null ? null : `${drop.toFixed(1)}%`,
  };
}

function renderProductImage({ productImageUrl, productName }) {
  const imageUrl = safeUrl(productImageUrl);
  if (!imageUrl) {
    return `<div style="background:#edf2f0;border-radius:12px;color:#53615c;font-size:13px;padding:34px 16px;text-align:center;">Product image unavailable</div>`;
  }
  return `<img src="${imageUrl}" alt="${escapeHtml(productName || "Tracked product")}" width="120" style="border:0;border-radius:12px;display:block;height:120px;object-fit:contain;width:120px;">`;
}

function renderPriceAlertEmail({
  productName,
  productUrl,
  productImageUrl,
  merchantName,
  currency,
  price,
  previousPrice,
  alertType,
  targetPrice,
  observationWindowDays,
  logoUrl,
  websiteUrl,
  alertSettingsUrl,
}) {
  const copy = ALERT_COPY[alertType] || DEFAULT_COPY;
  const links = {
    product: safeUrl(productUrl),
    logo: safeUrl(logoUrl),
    website: safeUrl(websiteUrl),
    settings: safeUrl(alertSettingsUrl),
  };
  const amounts = moneySummary({
    currency,
    price,
    previousPrice,
    alertType,
    targetPrice,
  });
  const safeName = escapeHtml(productName || "Tracked product");
  const safeMerchant = merchantName ? escapeHtml(merchantName) : "";
  const supportingDetails = [
    alertType === "target_price" && amounts.target
      ? `Your target: <strong>${escapeHtml(amounts.target)}</strong>`
      : "",
    alertType === "lowest_price" && [30, 90].includes(Number(observationWindowDays))
      ? `Observation window: <strong>${Number(observationWindowDays)} days</strong>`
      : "",
    amounts.saved ? `<span style="color:#16834b;font-weight:700;">You save ${escapeHtml(amounts.saved)}</span>` : "",
    amounts.drop ? `<span style="color:#16834b;font-weight:700;">Down ${escapeHtml(amounts.drop)}</span>` : "",
  ].filter(Boolean);
  const brand = links.logo
    ? `<img src="${links.logo}" alt="CartDrop" width="132" style="border:0;display:block;max-width:132px;">`
    : `<span style="color:#13201a;font-size:24px;font-weight:800;letter-spacing:-1px;">Cart<span style="color:#36b66b;">Drop</span></span>`;
  const productAction = links.product
    ? `<a href="${links.product}" style="background:#13201a;border-radius:8px;color:#fff;display:inline-block;font-size:15px;font-weight:700;padding:14px 24px;text-decoration:none;">${escapeHtml(copy.action)}</a>`
    : "";
  const productFallback = links.product
    ? `<p style="color:#64716c;font-size:12px;line-height:18px;margin:18px 0 0;word-break:break-word;">If the button does not work, copy and paste this link:<br><a href="${links.product}" style="color:#16834b;">${links.product}</a></p>`
    : "";
  const footerLinks = links.settings
    ? ` · <a href="${links.settings}" style="color:#53615c;">Manage alerts</a>`
    : "";
  const subject = `${copy.headline.replace(/\.$/, "")} ${productName || "Your tracked product"}`;
  const text = [
    `CartDrop — ${copy.headline}`,
    copy.description,
    "",
    `${productName || "Tracked product"}: ${amounts.current || "Price unavailable"}`,
    amounts.previous ? `Previous price: ${amounts.previous}` : "",
    amounts.target ? `Target price: ${amounts.target}` : "",
    amounts.saved ? `You save ${amounts.saved}` : "",
    amounts.drop ? `Price drop: ${amounts.drop}` : "",
    alertType === "lowest_price" && [30, 90].includes(Number(observationWindowDays))
      ? `Observation window: ${observationWindowDays} days`
      : "",
    links.product ? `View product: ${productUrl}` : "",
  ].filter(Boolean).join("\n");

  const html = `<!doctype html>
<html lang="en">
  <body style="background:#f2f5f3;margin:0;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#13201a;">
    <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(copy.description)}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f2f5f3;">
      <tr><td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;background:#fff;border:1px solid #e2e9e5;border-radius:16px;overflow:hidden;">
          <tr><td style="padding:26px 28px 22px;border-bottom:1px solid #edf1ef;">${brand}<p style="color:#68766f;font-size:12px;margin:8px 0 0;">Smarter shopping starts here.</p></td></tr>
          <tr><td style="padding:34px 28px 10px;"><span style="background:#e7f7ec;border-radius:999px;color:#16834b;display:inline-block;font-size:11px;font-weight:700;letter-spacing:.7px;padding:7px 10px;">${escapeHtml(copy.badge)}</span><h1 style="font-size:30px;line-height:36px;margin:18px 0 10px;">${escapeHtml(copy.headline)}</h1><p style="color:#53615c;font-size:16px;line-height:24px;margin:0;">${escapeHtml(copy.description)}</p></td></tr>
          <tr><td style="padding:24px 28px;"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e2e9e5;border-radius:14px;"><tr><td style="padding:18px;width:136px;" valign="top">${renderProductImage({ productImageUrl, productName })}</td><td style="padding:20px 18px 20px 0;" valign="top"><p style="color:#68766f;font-size:12px;margin:0 0 6px;">${safeMerchant}</p><h2 style="font-size:18px;line-height:24px;margin:0 0 14px;">${safeName}</h2><p style="font-size:30px;font-weight:800;letter-spacing:-1px;margin:0;">${escapeHtml(amounts.current || "Price unavailable")}</p>${amounts.previous ? `<p style="color:#7c8983;font-size:13px;margin:7px 0 0;text-decoration:line-through;">Previously ${escapeHtml(amounts.previous)}</p>` : ""}</td></tr></table></td></tr>
          ${supportingDetails.length ? `<tr><td style="padding:0 28px 24px;"><p style="border-top:1px solid #edf1ef;color:#53615c;font-size:14px;line-height:22px;margin:0;padding-top:18px;">${supportingDetails.join(" &nbsp; · &nbsp; ")}</p></td></tr>` : ""}
          <tr><td align="center" style="padding:0 28px 30px;">${productAction}${productFallback}</td></tr>
          <tr><td style="background:#f7faf8;padding:22px 28px;"><p style="color:#53615c;font-size:13px;line-height:20px;margin:0;">You received this email because you enabled a price alert on CartDrop.${footerLinks}</p>${links.website ? `<p style="margin:10px 0 0;"><a href="${links.website}" style="color:#16834b;font-size:13px;font-weight:700;">CartDrop</a></p>` : ""}</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return { html, text, subject };
}

async function sendPriceAlertEmail(payload) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || process.env.ALERT_EMAIL_FROM;
  const to = process.env.NOTIFICATION_EMAIL || process.env.ALERT_EMAIL_TO;

  if (!apiKey || !from || !to) {
    throw new Error(
      "Email notifications are not configured. Set RESEND_API_KEY, RESEND_FROM_EMAIL, and NOTIFICATION_EMAIL."
    );
  }

  const email = renderPriceAlertEmail({
    ...payload,
    logoUrl: payload.logoUrl || process.env.CARTDROP_LOGO_URL,
    websiteUrl: payload.websiteUrl || process.env.CARTDROP_WEBSITE_URL,
    alertSettingsUrl: payload.alertSettingsUrl || process.env.CARTDROP_ALERT_SETTINGS_URL,
  });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], ...email }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Resend request failed (${response.status}): ${details}`);
  }

  return response.json();
}

export { renderPriceAlertEmail, sendPriceAlertEmail };
