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
  if (octets.length === 4 && octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)) {
    const [first, second] = octets;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && (second === 0 || second === 168)) ||
      (first === 198 && (second === 18 || second === 19)) ||
      first >= 224
    );
  }

  if (!hostname.includes(":")) return false;

  const address = hostname.replace(/^\[|\]$/g, "");
  const halves = address.split("::");
  if (halves.length > 2) return true;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missingWords = 8 - left.length - right.length;
  if ((halves.length === 1 && missingWords !== 0) || (halves.length === 2 && missingWords < 1)) {
    return true;
  }
  const words = [
    ...left,
    ...(halves.length === 2 ? Array(missingWords).fill("0") : []),
    ...right,
  ].map((word) => Number.parseInt(word || "0", 16));
  if (words.length !== 8 || words.some((word) => !Number.isInteger(word) || word < 0 || word > 0xffff)) {
    return true;
  }

  const firstWord = words[0];
  const isIpv4MappedOrCompatible =
    words.slice(0, 5).every((word) => word === 0) &&
    (words[5] === 0 || words[5] === 0xffff);
  const isGlobalUnicast = firstWord >= 0x2000 && firstWord <= 0x3fff;

  return (
    address === "::" ||
    address === "::1" ||
    isIpv4MappedOrCompatible ||
    (firstWord & 0xfe00) === 0xfc00 ||
    (firstWord & 0xffc0) === 0xfe80 ||
    (firstWord & 0xff00) === 0xff00 ||
    !isGlobalUnicast ||
    (firstWord === 0x2001 && words[1] === 0x0db8)
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

  if (parsedUrl.username || parsedUrl.password) {
    return { error: "Product URLs cannot contain a username or password." };
  }

  const hostname = parsedUrl.hostname.toLowerCase().replace(/\.$/, "");
  parsedUrl.hostname = hostname;
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
  const hostname = getHostname(value);
  if (!hostname) {
    return String(value ?? "Retailer").trim() || "Retailer";
  }

  const knownRetailers = [
    [/(^|\.)amazon\./, "Amazon"],
    [/(^|\.)flipkart\./, "Flipkart"],
    [/(^|\.)myntra\./, "Myntra"],
    [/(^|\.)meesho\./, "Meesho"],
    [/(^|\.)ajio\./, "AJIO"],
    [/(^|\.)zara\./, "Zara"],
    [/(^|\.)walmart\./, "Walmart"],
    [/(^|\.)target\./, "Target"],
    [/(^|\.)savana\./, "Savana"],
  ];
  const knownRetailer = knownRetailers.find(([pattern]) => pattern.test(hostname));
  if (knownRetailer) return knownRetailer[1];

  const labels = hostname.split(".").filter(Boolean);
  const multiPartPublicSuffixes = new Set([
    "ac.in", "co.in", "com.au", "com.br", "com.cn", "com.mx", "com.sg",
    "co.nz", "co.uk", "org.au", "org.uk", "net.au", "net.in", "net.nz",
  ]);
  const suffix = labels.slice(-2).join(".");
  const brand = labels.at(multiPartPublicSuffixes.has(suffix) ? -3 : -2) || labels[0];

  return brand
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

export function getRetailerHomeUrl(value) {
  const hostname = getHostname(value);
  return hostname ? `https://${hostname}/` : null;
}

function getHostname(value) {
  if (typeof value !== "string" || !value.trim()) return "";

  const input = value.trim();
  try {
    return new URL(input.includes("://") ? input : `https://${input}`).hostname.toLowerCase();
  } catch {
    return "";
  }
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
