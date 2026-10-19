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

export function isAllowedRemoteUrl(value) {
  if (!(value instanceof URL)) return false;
  const hostname = value.hostname.toLowerCase();
  return (
    value.protocol === "https:" &&
    !BLOCKED_HOSTNAMES.has(hostname) &&
    !hostname.endsWith(".localhost") &&
    !hostname.endsWith(".internal") &&
    !hostname.endsWith(".local") &&
    !isPrivateIpv4(hostname) &&
    hostname.includes(".")
  );
}
