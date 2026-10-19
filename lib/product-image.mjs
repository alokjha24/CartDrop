const IMAGE_KEYS = new Set(["image", "imageurl", "image_url", "contenturl", "thumbnailurl"]);
const DIRECT_IMAGE_HOSTS = new Set(["savana.com", "static.zara.net"]);

function shouldLoadImageDirectly(parsedUrl) {
  const hostname = parsedUrl.hostname.toLowerCase();
  return [...DIRECT_IMAGE_HOSTS].some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
  );
}

function decodeHtmlEntities(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

export function normalizeProductImageUrl(value, pageUrl) {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const candidate = decodeHtmlEntities(value.trim());
    if (/[{}]/.test(candidate)) return null;
    const parsedUrl = new URL(candidate, pageUrl);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) return null;
    if (pageUrl) {
      const sourceUrl = new URL(pageUrl);
      if (
        parsedUrl.origin === sourceUrl.origin &&
        parsedUrl.pathname === sourceUrl.pathname &&
        parsedUrl.search === sourceUrl.search
      ) {
        return null;
      }
    }
    const imagePath = parsedUrl.pathname.toLowerCase();
    const imageExtension = imagePath.match(/\.([a-z0-9]+)$/)?.[1];
    const isVectorImage = imageExtension === "svg";
    const isPromotionalAsset = /(?:^|[/_.-])(badge|coupon|discount|offer|percent(?:age)?|promo(?:tion)?|sale|sprite|banner|wishlist|cart|rating|delivery)(?:[/_.-]|$)/i.test(
      imagePath
    );
    if (
      parsedUrl.hostname.toLowerCase() === "placehold.co" ||
      isVectorImage ||
      isPromotionalAsset ||
      /(?:^|[/_.-])(pixel|spacer|transparent)(?:[/_.-]|$)/i.test(imagePath) ||
      /(?:^|[/_.-])1x1(?:[/_.-]|$)/i.test(imagePath) ||
      /(?:^|[/_.-])(favicon|robots|logo|icon)(?:[/_.-]|$)/i.test(imagePath)
    ) {
      return null;
    }
    if (pageUrl) {
      const sourceUrl = new URL(pageUrl);
      const hasImageExtension = /\.(?:avif|bmp|gif|jpe?g|png|tiff?|webp)(?:$|[?#])/i.test(
        parsedUrl.pathname
      );
      const hasImagePath = /(?:\/images?\/|\/assets?\/|\/media\/|\/photos?\/|\/uploads?\/|goods-pic|product-image)/i.test(
        parsedUrl.pathname
      );
      if (
        parsedUrl.hostname === sourceUrl.hostname &&
        !hasImageExtension &&
        !hasImagePath
      ) {
        return null;
      }
    }
    if (shouldLoadImageDirectly(parsedUrl) && /\/goods-pic\//i.test(parsedUrl.pathname)) {
      parsedUrl.pathname = parsedUrl.pathname.replace(/_w\d+_q\d+(?=\.)/i, "_w1440_q90");
    }
    if (
      parsedUrl.hostname.toLowerCase() === "static.zara.net" &&
      /\/\d{8,}-(?:f\d*|p)\//i.test(parsedUrl.pathname)
    ) {
      const requestedWidth = Number(parsedUrl.searchParams.get("w"));
      if (requestedWidth > 0 && requestedWidth < 800) {
        parsedUrl.searchParams.set("w", "1200");
      }
    }
    return parsedUrl.toString();
  } catch {
    return null;
  }
}

function collectImageValues(value, values = [], imageContext = false) {
  if (typeof value === "string") {
    values.push(value);
    return values;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectImageValues(item, values, imageContext));
    return values;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, nestedValue]) => {
      if (IMAGE_KEYS.has(key.toLowerCase())) {
        collectImageValues(nestedValue, values, true);
      } else if (imageContext && ["url", "src"].includes(key.toLowerCase())) {
        collectImageValues(nestedValue, values, true);
      } else if (key === "@graph" || key === "mainEntity" || key === "mainEntityOfPage") {
        collectImageValues(nestedValue, values);
      }
    });
  }
  return values;
}

export function extractProductImageCandidates({ html = "", metadata = {}, pageUrl } = {}) {
  const candidates = [];
  const jsonLdMatches = String(html).matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );

  for (const match of jsonLdMatches) {
    try {
      collectImageValues(JSON.parse(match[1].trim()), candidates);
    } catch {
      // Ignore malformed JSON-LD and continue with other metadata.
    }
  }

  const metadataEntries = Object.entries(metadata ?? {});
  const preferredMetadataKeys = new Set([
    "ogimage",
    "og:image",
    "twitterimage",
    "twitter:image",
    "image",
    "imageurl",
    "image_url",
    "images",
  ]);
  for (const [metadataKey, value] of metadataEntries) {
    if (preferredMetadataKeys.has(metadataKey.toLowerCase())) {
      collectImageValues(
        value,
        candidates,
        ["image", "imageurl", "image_url", "images"].includes(metadataKey.toLowerCase())
      );
    }
  }

  const htmlImageTags = String(html).matchAll(/<img\b[^>]*>/gi);
  for (const match of htmlImageTags) {
    const tag = match[0];
    for (const attribute of ["src", "data-src", "data-lazy-src", "data-original", "data-image-url"]) {
      const attributeMatch = tag.match(new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, "i"));
      if (attributeMatch) candidates.push(attributeMatch[1]);
    }

    const srcsetMatch = tag.match(/srcset\s*=\s*["']([^"']+)["']/i);
    if (srcsetMatch) {
      candidates.push(
        ...srcsetMatch[1]
          .split(",")
          .map((entry) => entry.trim().split(/\s+/)[0])
          .filter(Boolean)
      );
    }
  }

  const metaTags = String(html).matchAll(/<meta\b[^>]*>/gi);
  for (const match of metaTags) {
    const tag = match[0];
    const property = tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const content = tag.match(/content\s*=\s*["']([^"']+)["']/i)?.[1];
    if (content && ["og:image", "og:image:url", "twitter:image", "twitter:image:src"].includes(property)) {
      candidates.push(content);
    }
  }

  const embeddedJson = String(html)
    .replaceAll("\\/", "/")
    .replaceAll("\\u0026", "&")
    .replaceAll("&amp;", "&");
  const embeddedUrls = embeddedJson.matchAll(/https?:\/\/[^\s"'<>\\]+/gi);
  for (const match of embeddedUrls) {
    const candidate = match[0].replace(/[),.;\]}]+$/g, "");
    if (
      /\.(?:avif|bmp|gif|jpe?g|png|tiff?|webp)(?:[?#]|$)/i.test(candidate) ||
      /(?:goods-pic|product[-_/]?images?)/i.test(candidate)
    ) {
      candidates.push(candidate);
    }
  }

  return [...new Set(candidates)]
    .map((candidate) => normalizeProductImageUrl(candidate, pageUrl))
    .filter(Boolean);
}

export function getProductImageSrc(imageUrl, pageUrl) {
  const normalizedUrl = normalizeProductImageUrl(imageUrl, pageUrl);
  if (!normalizedUrl) return null;
  try {
    const parsedUrl = new URL(normalizedUrl);
    if (
      parsedUrl.hostname.endsWith(".supabase.co") &&
      parsedUrl.pathname.includes("/storage/v1/object/public/product-images/")
    ) {
      return parsedUrl.toString();
    }
    // Savana's CDN serves these images to browsers but rejects server-side proxy
    // fetches. Let the browser load its public image URL directly for faster cards.
    if (parsedUrl.protocol === "https:" && shouldLoadImageDirectly(parsedUrl)) {
      return parsedUrl.toString();
    }
  } catch {
    return null;
  }
  const source = typeof pageUrl === "string" ? pageUrl.trim() : "";
  const sourceQuery = source ? `&source=${encodeURIComponent(source)}` : "";
  return `/api/product-image?url=${encodeURIComponent(normalizedUrl)}${sourceQuery}`;
}
