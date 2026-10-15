const TRACKING_PARAMETERS = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "ref_",
  "referrer",
  "tag",
  "utm_campaign",
  "utm_content",
  "utm_medium",
  "utm_source",
  "utm_term",
]);

const PRIVATE_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

function isPrivateIp(hostname) {
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

export function normalizeProductUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    return { error: "Product URL is required." };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(value.trim());
  } catch {
    return { error: "Enter a valid product URL, including https://." };
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return { error: "Only HTTP and HTTPS product URLs are supported." };
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  if (
    PRIVATE_HOSTNAMES.has(hostname) ||
    isPrivateIp(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".local")
  ) {
    return { error: "Private and local network URLs cannot be tracked." };
  }

  for (const parameter of [...parsedUrl.searchParams.keys()]) {
    if (TRACKING_PARAMETERS.has(parameter.toLowerCase())) {
      parsedUrl.searchParams.delete(parameter);
    }
  }

  parsedUrl.hash = "";
  if (parsedUrl.pathname.length > 1) {
    parsedUrl.pathname = parsedUrl.pathname.replace(/\/+$/, "");
  }

  return {
    url: parsedUrl.toString(),
    hostname,
    retailer: getRetailerLabel(hostname),
  };
}

export function getRetailerLabel(value) {
  const hostname = String(value ?? "").toLowerCase().replace(/^www\./, "");
  const knownRetailers = [
    ["amazon.", "Amazon"],
    ["flipkart.", "Flipkart"],
    ["myntra.", "Myntra"],
    ["meesho.", "Meesho"],
    ["ajio.", "AJIO"],
    ["zara.", "Zara"],
    ["walmart.", "Walmart"],
    ["target.", "Target"],
  ];

  return knownRetailers.find(([match]) => hostname.includes(match))?.[1] ?? hostname;
}

export function getProductDisplayTitle(value, productUrl) {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (candidate) {
    const withoutUrls = candidate
      .replace(/\s*(?:https?:\/\/\s*)?(?:www\.)?savana\.com.*$/i, "")
      .replace(/\s*https?:\/\/.*$/i, "")
      .replace(/\s*www\.[^\s/]+\.[a-z]{2,}(?:\/.*)?$/i, "")
      .replace(/\s+/g, " ")
      .trim();

    if (
      withoutUrls &&
      !/^(?:https?:\/\/|www\.|[a-z0-9-]+\.[a-z]{2,}(?:\/|$))/i.test(withoutUrls) &&
      !/(?:https?:\/\/|www\.)?[a-z0-9-]*savana\.com/i.test(withoutUrls)
    ) {
      return withoutUrls;
    }
  }

  try {
    const pathname = new URL(productUrl).pathname;
    const readable = decodeURIComponent(pathname)
      .split("/")
      .filter(Boolean)
      .at(-1)
      ?.replace(/\.(html?|aspx?)$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\d{6,}\b/g, "")
      .replace(/\s+/g, " ")
      .trim();

    return readable
      ? readable.replace(/\b\w/g, (letter) => letter.toUpperCase())
      : "Tracked product";
  } catch {
    return "Tracked product";
  }
}
