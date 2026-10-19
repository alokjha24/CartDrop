import { createHash } from "node:crypto";
import sharp from "sharp";
import { isAllowedRemoteUrl } from "./image-url-security.mjs";
import { normalizeProductImageUrl } from "./product-image.mjs";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_CANDIDATES = 8;
const IMAGE_CANDIDATE_BATCH_SIZE = 3;
const IMAGE_FETCH_TIMEOUT_MS = 2000;
const IMAGE_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const IMAGE_TYPES = new Set([
  "image/avif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MIN_IMAGE_DIMENSION = 160;
const MIN_IMAGE_BYTES = 2 * 1024;

let storageWarningShown = false;

function getExtension(contentType) {
  return {
    "image/avif": "avif",
    "image/bmp": "bmp",
    "image/gif": "gif",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/svg+xml": "svg",
    "image/tiff": "tiff",
    "image/webp": "webp",
  }[contentType] || "bin";
}

async function downloadCandidate(candidate, referer, controller) {
  let imageUrl;
  try {
    imageUrl = new URL(candidate);
  } catch {
    throw new Error("Invalid image URL");
  }
  if (!isAllowedRemoteUrl(imageUrl)) throw new Error("Image host is not allowed");

  const signal = AbortSignal.any([
    controller.signal,
    AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
  ]);
  let pageOrigin;
  try {
    pageOrigin = new URL(referer).origin;
  } catch {
    pageOrigin = imageUrl.origin;
  }
  let currentUrl = imageUrl;
  let response;

  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    response = await fetch(currentUrl, {
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
        Referer: referer || `${pageOrigin}/`,
        Origin: pageOrigin,
        "Sec-Fetch-Dest": "image",
        "Sec-Fetch-Mode": "no-cors",
        "Sec-Fetch-Site": "cross-site",
        "User-Agent": IMAGE_USER_AGENT,
      },
      redirect: "manual",
      signal,
      cache: "no-store",
    });

    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get("location");
    await response.body?.cancel().catch(() => {});
    if (!location) throw new Error("Image redirect had no location");
    currentUrl = new URL(location, currentUrl);
    if (!isAllowedRemoteUrl(currentUrl)) {
      throw new Error("Image redirect host is not allowed");
    }
  }

  if (!response?.ok) {
    await response?.body?.cancel().catch(() => {});
    throw new Error("Image download failed");
  }

  const contentType = response.headers.get("content-type")?.split(";")[0].trim();
  if (!IMAGE_TYPES.has(contentType)) {
    await response.body?.cancel().catch(() => {});
    throw new Error("Remote resource is not an image");
  }
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_IMAGE_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw new Error("Product image is too large");
  }

  const body = await response.arrayBuffer();
  if (body.byteLength < MIN_IMAGE_BYTES || body.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("Product image is too small or too large");
  }

  let dimensions;
  try {
    dimensions = await sharp(Buffer.from(body), {
      limitInputPixels: 40_000_000,
      failOn: "error",
    }).metadata();
  } catch {
    throw new Error("Remote image could not be decoded");
  }
  const { width, height, format } = dimensions;
  if (
    !["avif", "jpeg", "png", "webp"].includes(format) ||
    width < MIN_IMAGE_DIMENSION ||
    height < MIN_IMAGE_DIMENSION ||
    width / height > 4 ||
    height / width > 4
  ) {
    throw new Error("Remote image is too small or is not a product photo");
  }

  return { body, contentType, imageUrl: imageUrl.toString() };
}

function getCandidateScore(candidate, referer) {
  const value = candidate.toLowerCase();
  const score = [
    [/\b(?:product|item|goods|catalog|zoom|original|main)\b|product[-_]?image/, 4],
    [/\b(?:icon|logo|badge|coupon|discount|offer|percent|promo|sale|sprite|banner|wishlist|cart|rating|delivery)\b/, -12],
    [/\b(?:og|social|share|default)\b/, -5],
  ].reduce((total, [pattern, points]) => total + (pattern.test(value) ? points : 0), 0);

  try {
    const page = new URL(referer);
    const itemIds = page.pathname.match(/\d{5,}/g) || [];
    const matchingId = itemIds.some((id) => value.includes(id));
    return score + (matchingId ? 12 : 0);
  } catch {
    return score;
  }
}

function getBrowserLoadableProductPhoto(candidates) {
  return candidates.find((candidate) => {
    try {
      const url = new URL(candidate);
      const hasProductPath = /(?:\/goods-pic\/|\/product[-_/]?images?\/|\/products?\/)/i.test(
        url.pathname
      );
      const hasPhotoExtension = /\.(?:avif|jpe?g|png|webp)(?:$|[?#])/i.test(url.pathname);
      const isZaraProductPhoto =
        url.hostname.toLowerCase() === "static.zara.net" &&
        /\/\d{8,}-(?:f\d*|p)\//i.test(url.pathname) &&
        hasPhotoExtension;
      return (
        isAllowedRemoteUrl(url) &&
        (isZaraProductPhoto || (hasProductPath && (hasPhotoExtension || /\/goods-pic\//i.test(url.pathname))))
      );
    } catch {
      return false;
    }
  }) || null;
}

export async function storeProductImage(
  supabase,
  { candidates, userId, productId, referer }
) {
  const candidateUrls = [...new Set(Array.isArray(candidates) ? candidates : [])]
    .filter((candidate) => typeof candidate === "string" && candidate.trim())
    .map((candidate) => normalizeProductImageUrl(candidate, referer))
    .filter(Boolean)
    .map((candidate, index) => ({
      candidate,
      index,
      score: getCandidateScore(candidate, referer),
    }))
    .filter(({ score }) => score > -8)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ candidate }) => candidate)
    .slice(0, MAX_IMAGE_CANDIDATES);
  const controllers = [];
  let image;
  for (let start = 0; start < candidateUrls.length && !image; start += IMAGE_CANDIDATE_BATCH_SIZE) {
    const group = candidateUrls.slice(start, start + IMAGE_CANDIDATE_BATCH_SIZE).map((candidate) => {
      const controller = new AbortController();
      controllers.push(controller);
      return downloadCandidate(candidate, referer, controller);
    });
    try {
      image = await Promise.any(group);
    } catch {
      // Move to the next lower-ranked group while keeping the overall scrape bounded.
    }
    if (!image) controllers.splice(-group.length).forEach((controller) => controller.abort());
  }
  controllers.forEach((controller) => controller.abort());
  // Some retailer CDNs allow browser image requests but reject Node fetches.
  // Keep a high-confidence product-photo URL as a browser fallback in that case.
  if (!image) return getBrowserLoadableProductPhoto(candidateUrls);

  const imageHash = createHash("sha256").update(Buffer.from(image.body)).digest("hex");
  const path = `${userId}/${productId}/${imageHash}.${getExtension(image.contentType)}`;
  try {
    const { error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(path, image.body, {
        contentType: image.contentType,
        upsert: true,
        cacheControl: "31536000",
      });

    if (uploadError) {
      if (!storageWarningShown) {
        storageWarningShown = true;
        console.warn(
          "Product image storage is unavailable; using validated remote image fallback:",
          uploadError.message
        );
      }
      return image.imageUrl;
    }

    const { data } = supabase.storage.from("product-images").getPublicUrl(path);
    return data?.publicUrl || image.imageUrl;
  } catch (error) {
    if (!storageWarningShown) {
      storageWarningShown = true;
      console.warn(
        "Product image storage failed; using validated remote image fallback:",
        error?.message || "unknown error"
      );
    }
    return image.imageUrl;
  }
}
