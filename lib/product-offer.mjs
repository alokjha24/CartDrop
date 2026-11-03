import { normalizePrice } from "./price-history.mjs";

function decodeHtmlText(value) {
  return String(value ?? "")
    .replace(/&nbsp;|&#160;|&#xA0;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(?:x([\da-f]+)|(\d+));/gi, (entity, hex, decimal) => {
      const codePoint = Number.parseInt(hex || decimal, hex ? 16 : 10);
      return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    });
}

function getVisibleText(html) {
  return decodeHtmlText(String(html ?? "")
    .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]*>/g, " "))
    .replace(/[\u00a0\s]+/g, " ")
    .trim();
}

function readMetaContent(html, key) {
  const normalizedKey = key.toLowerCase();
  for (const tagMatch of String(html ?? "").matchAll(/<meta\b[^>]*>/gi)) {
    const tag = tagMatch[0];
    const keyValue = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1];
    if (keyValue?.toLowerCase() !== normalizedKey) continue;
    const content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1];
    if (content) return decodeHtmlText(content).trim();
  }
  return null;
}

function getElementContentById(html, id) {
  const source = String(html ?? "");
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const openingTag = new RegExp(
    `<([a-z][\\w:-]*)\\b(?=[^>]*\\bid\\s*=\\s*["']${escapedId}["'])[^>]*>`,
    "i"
  ).exec(source);
  if (!openingTag) return null;

  const tagName = openingTag[1].toLowerCase();
  const contentStart = openingTag.index + openingTag[0].length;
  const tagPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
  tagPattern.lastIndex = contentStart;
  let depth = 1;
  let tagMatch;

  while ((tagMatch = tagPattern.exec(source))) {
    if (/^<\//.test(tagMatch[0])) {
      depth -= 1;
      if (depth === 0) return source.slice(contentStart, tagMatch.index);
    } else if (!/\/>$/.test(tagMatch[0])) {
      depth += 1;
    }
  }

  return source.slice(contentStart);
}

function parseCurrencyAmount(value) {
  const decoded = decodeHtmlText(value);
  const match = decoded.match(
    /(₹|[$£€¥]|\b(?:INR|USD|GBP|EUR|CAD|AUD|JPY)\b)\s*([\d][\d,]*(?:\.\d{1,2})?)/i
  );
  if (!match) return null;

  const currencyCode = {
    "₹": "INR",
    $: "USD",
    "£": "GBP",
    "€": "EUR",
    "¥": "JPY",
  }[match[1]] || match[1].toUpperCase();
  return { price: normalizePrice(match[2]), currencyCode };
}

function getAmazonCurrentPrice(html) {
  for (const id of ["corePrice_feature_div", "corePriceDisplay_desktop_feature_div"]) {
    const section = getElementContentById(html, id);
    if (!section) continue;

    const amountSpans = /<span\b(?=[^>]*\bclass\s*=\s*["'][^"']*\ba-offscreen\b[^"']*["'])[^>]*>([\s\S]*?)<\/span>/gi;
    let amountMatch;
    while ((amountMatch = amountSpans.exec(section))) {
      const surroundingMarkup = section.slice(Math.max(0, amountMatch.index - 300), amountMatch.index);
      const amountText = getVisibleText(amountMatch[1]);
      if (
        /M\s*\.?\s*R\s*\.?\s*P\s*\.?|list\s+price/i.test(amountText) ||
        /a-text-price|data-a-strike\s*=\s*["']true/i.test(surroundingMarkup)
      ) {
        continue;
      }

      const parsedAmount = parseCurrencyAmount(amountText);
      if (parsedAmount?.price !== null && parsedAmount?.price !== undefined) return parsedAmount;
    }
  }

  return null;
}

export function extractAmazonProductData(html) {
  const source = String(html ?? "");
  const titleContent = getElementContentById(source, "productTitle");
  const currentPrice = getAmazonCurrentPrice(source);
  const originalPrice = extractLabeledProductPricing({ html: source }).mrp;

  return {
    productName: titleContent ? getVisibleText(titleContent) || null : null,
    currentPrice: currentPrice?.price ?? null,
    originalPrice,
    currencyCode: currentPrice?.currencyCode ?? null,
  };
}

export function extractProductPageMetadata(html) {
  const amazonProductTitle = getElementContentById(html, "productTitle");
  const title =
    (amazonProductTitle ? getVisibleText(amazonProductTitle) : null) ||
    readMetaContent(html, "og:title") ||
    readMetaContent(html, "twitter:title") ||
    decodeHtmlText(String(html ?? "").match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();

  return { productName: title || null };
}

function readPriceAfterLabel(text, labelPattern) {
  const amountPattern = /(?:₹|\bINR\b|\bRs\.?\s*)?\s*([\d][\d,]*(?:\.\d{1,2})?)/i;
  for (const labelMatch of text.matchAll(labelPattern)) {
    const tail = text.slice(labelMatch.index + labelMatch[0].length, labelMatch.index + labelMatch[0].length + 40);
    const amountMatch = amountPattern.exec(tail);
    const prefix = amountMatch ? tail.slice(0, amountMatch.index) : "";
    // Keep the value tied to its label; don't jump ahead to another price on the page.
    if (amountMatch && !/[\d%]/.test(prefix) && prefix.length <= 12) {
      const price = normalizePrice(amountMatch[1]);
      if (price !== null) return price;
    }
  }
  return null;
}

/** Read only prices visibly placed next to explicit offer/MRP labels. */
export function extractLabeledProductPricing({ html, markdown } = {}) {
  const visibleText = [getVisibleText(html), String(markdown ?? "")]
    .filter(Boolean)
    .join(" ")
    .replace(/[\u00a0\s]+/g, " ");

  return {
    getItForPrice: readPriceAfterLabel(
      visibleText,
      /\bget\s+it\s+for\b\s*[:\-]?/gi
    ),
    mrp: readPriceAfterLabel(
      visibleText,
      /\b(?:M\s*\.?\s*R\s*\.?\s*P\.?|maximum\s+retail\s+price)\b\s*[:\-]?/gi
    ),
  };
}
