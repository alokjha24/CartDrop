export function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function validateEmail(value) {
  const email = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function validatePassword(value) {
  const password = String(value ?? "");
  if (password.length < 12) return "Use at least 12 characters.";
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) {
    return "Include at least one lowercase and one uppercase letter.";
  }
  if (!/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return "Include at least one number and one symbol.";
  }
  return null;
}

export function safeInternalPath(value, fallback = "/") {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }
  if (value.includes("\\") || /[\u0000-\u001f]/.test(value)) return fallback;
  return value;
}

export function getInitials(name, email = "") {
  const words = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return String(email ?? "?").slice(0, 1).toUpperCase() || "?";
}
