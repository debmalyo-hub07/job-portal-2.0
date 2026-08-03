import { createHmac, hkdfSync } from "node:crypto";
import type { Portal } from "@jobportal/shared";
import { env } from "../config/env.js";

/**
 * Per-portal access-token signing key.
 *
 * A shared key plus a `type === portal` claim check is correct but fragile: the
 * entire portal boundary rests on one comparison, and a refactor that drops it
 * has no cryptographic backstop. Deriving separate keys makes a seeker token
 * presented to a recruiter route fail *signature verification*. The claim check
 * stays too — they are independent defenses, and the claim is what catches a
 * token that was minted for the right portal but the wrong subject type.
 */
export function accessTokenKey(portal: Portal): Buffer {
  // hkdfSync returns an ArrayBuffer; jsonwebtoken wants a Buffer or string,
  // hence the wrap. The empty salt is intentional — HKDF's salt is optional and
  // the `info` parameter is what separates the two portals.
  return Buffer.from(hkdfSync("sha256", env().JWT_ACCESS_SECRET, "", `access:${portal}`, 32));
}

/**
 * Key for the OAuth transaction cookie's JWT and the mailed link-confirmation
 * token. Derived, not a fifth env secret: same HKDF pattern as the access keys,
 * with its own info string so it can never collide with a portal key.
 */
export function googleTxnKey(): Buffer {
  return Buffer.from(hkdfSync("sha256", env().JWT_ACCESS_SECRET, "", "google-txn", 32));
}

/** Keyed hash of an opaque refresh token. A dump alone must not be replayable. */
export function hashRefreshToken(token: string): string {
  return createHmac("sha256", env().JWT_REFRESH_PEPPER).update(token).digest("hex");
}
