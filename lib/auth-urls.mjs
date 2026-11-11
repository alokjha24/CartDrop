export function getSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  const vercelHost = process.env.VERCEL_ENV === "production"
    ? process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
    : process.env.VERCEL_URL;
  const candidate = configured || (vercelHost ? `https://${vercelHost}` : "http://localhost:3000");
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      return "http://localhost:3000";
    }
    return url.origin;
  } catch {
    return "http://localhost:3000";
  }
}

export function getAuthCallbackUrl(nextPath = "/") {
  const callback = new URL("/auth/callback", getSiteUrl());
  callback.searchParams.set("next", nextPath);
  return callback.toString();
}
