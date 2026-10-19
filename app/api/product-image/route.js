import { NextResponse } from "next/server";

export const runtime = "nodejs";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "metadata.google.internal",
]);

function isPrivateIpv4(hostname) {
  const octets = hostname.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }

  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
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

  const hostname = imageUrl.hostname.toLowerCase();
  if (
    !["http:", "https:"].includes(imageUrl.protocol) ||
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".local") ||
    isPrivateIpv4(hostname)
  ) {
    return new NextResponse("Image host is not allowed.", { status: 400 });
  }

  try {
    const sourceValue = request.nextUrl.searchParams.get("source");
    let referer;
    try {
      const sourceUrl = new URL(sourceValue || "");
      if (["http:", "https:"].includes(sourceUrl.protocol)) {
        referer = sourceUrl.toString();
      }
    } catch {
      referer = undefined;
    }

    const response = await fetch(imageUrl, {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        Referer: referer || imageUrl.origin,
        "User-Agent": "Mozilla/5.0 (compatible; CartDrop/1.0)",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });

    if (!response.ok) {
      return new NextResponse("Unable to load product image.", { status: 502 });
    }

    const contentType = response.headers.get("content-type")?.split(";")[0].trim();
    if (!contentType?.startsWith("image/")) {
      return new NextResponse("Remote resource is not an image.", { status: 415 });
    }

    return new NextResponse(response.body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
      },
    });
  } catch (error) {
    console.error("Product image proxy error:", error);
    return new NextResponse("Unable to load product image.", { status: 502 });
  }
}
