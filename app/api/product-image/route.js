import { NextResponse } from "next/server";
import { isAllowedRemoteUrl } from "@/lib/image-url-security.mjs";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function limitImageStreamSize(stream, maxBytes) {
  let totalBytes = 0;
  return stream.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        totalBytes += chunk.byteLength;
        if (totalBytes > maxBytes) {
          throw new RangeError("Product image is too large.");
        }
        controller.enqueue(chunk);
      },
    })
  );
}

export async function GET(request) {
  const value = request.nextUrl.searchParams.get("url");
  if (!value) return new NextResponse("Missing image URL.", { status: 400 });

  let imageUrl;
  try {
    imageUrl = new URL(value);
  } catch {
    return new NextResponse("Invalid image URL.", { status: 400 });
  }

  if (!isAllowedRemoteUrl(imageUrl)) {
    return new NextResponse("Image host is not allowed.", { status: 400 });
  }

  try {
    const sourceValue = request.nextUrl.searchParams.get("source");
    let referer;
    try {
      const sourceUrl = new URL(sourceValue || "");
      if (sourceUrl.protocol === "https:") {
        referer = sourceUrl.toString();
      }
    } catch {
      referer = undefined;
    }

    let currentUrl = imageUrl;
    let response;
    let redirectLimitReached = true;
    const pageOrigin = referer || currentUrl.origin;
    for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
      response = await fetch(currentUrl, {
        headers: {
          Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          Referer: referer || `${currentUrl.origin}/`,
          Origin: pageOrigin,
          "Sec-Fetch-Dest": "image",
          "Sec-Fetch-Mode": "no-cors",
          "Sec-Fetch-Site": "cross-site",
          "User-Agent": IMAGE_USER_AGENT,
        },
        redirect: "manual",
        signal: AbortSignal.timeout(10000),
        cache: "no-store",
      });

      if (![301, 302, 303, 307, 308].includes(response.status)) {
        redirectLimitReached = false;
        break;
      }
      const location = response.headers.get("location");
      if (!location) break;
      currentUrl = new URL(location, currentUrl);
      if (!isAllowedRemoteUrl(currentUrl)) {
        return new NextResponse("Image redirect host is not allowed.", { status: 400 });
      }
    }

    if (redirectLimitReached) {
      return new NextResponse("Too many image redirects.", { status: 502 });
    }

    if (!response.ok) {
      return new NextResponse("Unable to load product image.", { status: 502 });
    }

    const contentType = response.headers.get("content-type")?.split(";")[0].trim();
    if (!contentType?.startsWith("image/")) {
      return new NextResponse("Remote resource is not an image.", { status: 415 });
    }

    const declaredLength = response.headers.get("content-length");
    const contentLength = declaredLength === null ? null : Number(declaredLength);
    if (contentLength > MAX_IMAGE_BYTES) {
      return new NextResponse("Product image is too large.", { status: 413 });
    }
    if (!response.body) {
      return new NextResponse("Product image is empty.", { status: 502 });
    }

    return new NextResponse(limitImageStreamSize(response.body, MAX_IMAGE_BYTES), {
      headers: {
        "Content-Type": contentType,
        ...(Number.isFinite(contentLength) ? { "Content-Length": String(contentLength) } : {}),
        "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
      },
    });
  } catch (error) {
    console.error("Product image proxy error:", error);
    return new NextResponse("Unable to load product image.", { status: 502 });
  }
}
