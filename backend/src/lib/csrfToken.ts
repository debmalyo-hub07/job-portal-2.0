import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

/**
 * Double-submit CSRF token as `nonce.HMAC(secret, nonce)`.
 *
 * Plain double-submit assumes only our origin can write the cookie. That is the
 * exact assumption `__Host-` exists because we cannot make: an insecure sibling
 * origin or a compromised subdomain can write cookies for the parent domain, and
 * an attacker who can write the cookie can also send the matching header. Binding
 * the two halves with a MAC means a forged pair does not validate.
 */
export function mintCsrfToken(): string {
  const nonce = randomBytes(24).toString("base64url");
  const mac = createHmac("sha256", env().CSRF_SECRET).update(nonce).digest("base64url");
  return `${nonce}.${mac}`;
}

export function verifyCsrfToken(token: string | undefined): boolean {
  if (!token) return false;

  // Exactly two parts. Destructuring from an unbounded split would accept
  // "nonce.mac.anything" by silently ignoring the tail — a token could then
  // carry arbitrary trailing data through a check that claims to have validated
  // the whole string. Nothing reads that tail today, which is exactly why the
  // looseness would go unnoticed until something did.
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [nonce, mac] = parts;
  if (!nonce || !mac) return false;

  const expected = createHmac("sha256", env().CSRF_SECRET).update(nonce).digest("base64url");
  // Length check BEFORE timingSafeEqual, which throws on unequal-length buffers
  // rather than returning false. Without it, an attacker-chosen short MAC is a
  // 500 instead of a 403.
  if (expected.length !== mac.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(mac));
}
