export function getProductImageSrc(imageUrl, pageUrl) {
  if (typeof imageUrl !== "string" || !imageUrl.trim()) return null;

  try {
    const parsedUrl = new URL(imageUrl);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) return null;
    const source = typeof pageUrl === "string" ? pageUrl.trim() : "";
    const sourceQuery = source ? `&source=${encodeURIComponent(source)}` : "";
    return `/api/product-image?url=${encodeURIComponent(parsedUrl.toString())}${sourceQuery}`;
  } catch {
    return null;
  }
}
