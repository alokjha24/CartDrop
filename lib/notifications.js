function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendPriceAlertEmail({
  productName,
  productUrl,
  currency,
  price,
  previousPrice,
  alertType,
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || process.env.ALERT_EMAIL_FROM;
  const to = process.env.NOTIFICATION_EMAIL || process.env.ALERT_EMAIL_TO;

  if (!apiKey || !from || !to) {
    throw new Error(
      "Email notifications are not configured. Set RESEND_API_KEY, RESEND_FROM_EMAIL, and NOTIFICATION_EMAIL."
    );
  }

  const formattedPrice = `${currency || "INR"} ${price}`;
  const formattedPreviousPrice = previousPrice
    ? `${currency || "INR"} ${previousPrice}`
    : null;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Price alert: ${productName} is now ${formattedPrice}`,
      text: [
        `CartDrop price alert`,
        ``,
        `${productName} is now ${formattedPrice}.`,
        formattedPreviousPrice ? `Previous price: ${formattedPreviousPrice}.` : "",
        `Alert type: ${alertType}.`,
        ``,
        `View product: ${productUrl}`,
      ].filter(Boolean).join("\n"),
      html: `
        <h2>CartDrop price alert</h2>
        <p><strong>${escapeHtml(productName)}</strong> is now <strong>${escapeHtml(formattedPrice)}</strong>.</p>
        ${formattedPreviousPrice ? `<p>Previous price: ${escapeHtml(formattedPreviousPrice)}.</p>` : ""}
        <p>Alert type: ${escapeHtml(alertType)}.</p>
        <p><a href="${escapeHtml(productUrl)}">View product</a></p>
      `,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Resend request failed (${response.status}): ${details}`);
  }

  return response.json();
}
