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

export function extractProductPageMetadata(html) {
  const title =
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
      /\b(?:MRP|maximum\s+retail\s+price)\b\s*[:\-]?/gi
    ),
  };
}
