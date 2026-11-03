import { lookup as dnsLookup } from "node:dns";
import https from "node:https";
import { Readable } from "node:stream";
import ipaddr from "ipaddr.js";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
]);
const BODYLESS_STATUSES = new Set([204, 205, 304]);
const NON_PUBLIC_IP_RANGES = [
  "198.18.0.0/15", // Benchmarking networks.
  "64:ff9b:1::/48", // Local-use NAT64 prefix.
  "100::/64", // IPv6 discard-only prefix.
  "2001::/23", // IETF protocol assignments.
  "3fff::/20", // IPv6 documentation range.
].map((range) => ipaddr.parseCIDR(range));

function normalizeHostname(hostname) {
  return hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

export function isPublicIpAddress(address) {
  if (typeof address !== "string" || !ipaddr.isValid(address)) return false;

  try {
    // process() converts IPv4-mapped IPv6 addresses before checking their range.
    const parsedAddress = ipaddr.process(address);
    return (
      parsedAddress.range() === "unicast" &&
      !NON_PUBLIC_IP_RANGES.some(
        ([rangeAddress, prefix]) =>
          parsedAddress.kind() === rangeAddress.kind() &&
          parsedAddress.match(rangeAddress, prefix)
      )
    );
  } catch {
    return false;
  }
}

export function isAllowedRemoteUrl(value) {
  if (!(value instanceof URL) || value.protocol !== "https:") return false;

  const hostname = normalizeHostname(value.hostname);
  const isIpAddress = ipaddr.isValid(hostname);
  return (
    (!value.port || value.port === "443") &&
    !value.username &&
    !value.password &&
    !BLOCKED_HOSTNAMES.has(hostname) &&
    !hostname.endsWith(".localhost") &&
    !hostname.endsWith(".internal") &&
    !hostname.endsWith(".local") &&
    (isIpAddress ? isPublicIpAddress(hostname) : hostname.includes("."))
  );
}

function createDnsAccessError() {
  const error = new Error("Remote host resolves to a non-public IP address.");
  error.code = "EACCES";
  return error;
}

/**
 * Resolve the host at connection time, reject the whole DNS answer if any
 * address is non-public, and return only the validated addresses to Node's
 * socket connector. This prevents a second DNS lookup from rebinding the host
 * between validation and connection.
 */
export function createPublicAddressLookup(resolve = dnsLookup) {
  return (hostname, options, callback) => {
    const lookupOptions = typeof options === "object" && options !== null ? options : {};

    resolve(hostname, { all: true, verbatim: true }, (error, addresses) => {
      if (error) {
        callback(error);
        return;
      }

      if (
        !Array.isArray(addresses) ||
        addresses.length === 0 ||
        addresses.some(({ address }) => !isPublicIpAddress(address))
      ) {
        callback(createDnsAccessError());
        return;
      }

      const matchingFamily = lookupOptions.family
        ? addresses.filter(({ family }) => family === lookupOptions.family)
        : addresses;
      if (matchingFamily.length === 0) {
        callback(Object.assign(new Error("No public address matches the requested IP family."), {
          code: "ENOTFOUND",
        }));
        return;
      }

      if (lookupOptions.all) {
        callback(null, matchingFamily);
        return;
      }

      const { address, family } = matchingFamily[0];
      callback(null, address, family || (address.includes(":") ? 6 : 4));
    });
  };
}

const publicAddressLookup = createPublicAddressLookup();

function toWebHeaders(incomingHeaders) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incomingHeaders)) {
    if (value === undefined) continue;
    for (const headerValue of Array.isArray(value) ? value : [value]) {
      headers.append(name, headerValue);
    }
  }
  return headers;
}

/** Fetch an HTTPS URL using a DNS lookup that validates and pins public IPs. */
export function fetchPublicHttps(value, { headers = {}, signal } = {}) {
  const url = value instanceof URL ? value : new URL(value);
  if (!isAllowedRemoteUrl(url)) {
    return Promise.reject(new Error("Remote URL is not allowed."));
  }

  return new Promise((resolve, reject) => {
    const agent = new https.Agent({ keepAlive: false, lookup: publicAddressLookup });
    let settled = false;
    const request = https.request(
      url,
      { method: "GET", headers, signal, agent },
      (incoming) => {
        const status = incoming.statusCode || 502;
        incoming.once("close", () => agent.destroy());
        const body = BODYLESS_STATUSES.has(status) ? null : Readable.toWeb(incoming);
        if (body === null) incoming.resume();
        settled = true;
        resolve(new Response(body, { status, headers: toWebHeaders(incoming.headers) }));
      }
    );

    request.once("error", (error) => {
      agent.destroy();
      if (!settled) reject(error);
    });
    request.end();
  });
}
