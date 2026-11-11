import test from "node:test";
import assert from "node:assert/strict";
import {
  getInitials,
  normalizeEmail,
  safeInternalPath,
  validateEmail,
  validatePassword,
} from "./auth-validation.mjs";

test("email values are trimmed, lowercased, and validated", () => {
  assert.equal(normalizeEmail("  ALICE@EXAMPLE.COM "), "alice@example.com");
  assert.equal(validateEmail(" Alice@Example.com "), "alice@example.com");
  assert.equal(validateEmail("alice.example.com"), null);
});

test("password validation enforces the app's strength rules", () => {
  assert.equal(validatePassword("short"), "Use at least 12 characters.");
  assert.match(validatePassword("lowercaseonly123!"), /uppercase/);
  assert.match(validatePassword("UPPERCASEONLY123!"), /lowercase/);
  assert.match(validatePassword("GoodPasswordOnly!"), /number/);
  assert.equal(validatePassword("CartDropPass123!"), null);
});

test("redirect destinations stay inside the app", () => {
  assert.equal(safeInternalPath("/settings?tab=security"), "/settings?tab=security");
  assert.equal(safeInternalPath("https://example.com"), "/");
  assert.equal(safeInternalPath("//example.com"), "/");
  assert.equal(safeInternalPath("/\\example.com"), "/");
  assert.equal(safeInternalPath("/private", "/fallback"), "/private");
});

test("profile initials handle names and email fallback", () => {
  assert.equal(getInitials("Alok Jha"), "AJ");
  assert.equal(getInitials("CartDrop"), "CA");
  assert.equal(getInitials("", "alok@example.com"), "A");
});
