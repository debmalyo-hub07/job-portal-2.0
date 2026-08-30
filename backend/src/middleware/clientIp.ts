import { createHash, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import type { RequestHandler } from "express";

import { env } from "../config/env.js";

/**
 * The header pair a trusted front-end proxy uses to name the real client.
 *
 * Lowercase because that is how Node stores incoming header names, and these
 * are deleted off `req.headers` by name.
 */
const CLIENT_IP_HEADER = "x-cairn-client-ip";
const PROXY_KEY_HEADER = "x-cairn-proxy-key";

/** Same shape as adminProvisioning's check: digest first, so length cannot leak. */
function keyMatches(presented: string, secret: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(presented), digest(secret));
}

/**
 * Restores the real client address when the browser reached us through the web
 * origin's `/api` proxy.
 *
 * WHY THIS EXISTS, because `app.set("trust proxy", 1)` looks like it should
 * already cover it. With the Vercel proxy in front, a browser request crosses
 * **two** hops, not one, and the address the second hop appends is the proxy's
 * own egress IP. Express hands back that address for every request on earth, so
 * every IP-keyed limiter collapses into a single shared bucket:
 *
 *   app.ts's global limiter   100 requests/minute  → for the entire platform
 *   rlGoogle, rlRegister      10/hour              → for the entire platform
 *   rlRedeem                  10/hour              → for the entire platform
 *
 * Ten Google sign-ins an hour across all users is not a degradation, it is an
 * outage — and one that arrives as "too many requests" for people who have made
 * one. `verifyTurnstile` would also send Cloudflare an IP that did not solve the
 * challenge, which the Turnstile docs specify nothing about in either direction.
 *
 * Raising trust to 2 is the obvious fix and the wrong one: the API stays
 * publicly reachable, so a request sent straight to it with a handwritten
 * `X-Forwarded-For` would then be believed. That turns a login lockout into a
 * header the attacker rotates at will. Trust stays at 1, and the proxy proves
 * who it is instead.
 *
 * So the claim is only honoured when it arrives with a shared secret neither the
 * browser nor a direct caller has. Absent or wrong, the claim is dropped and
 * `req.ip` keeps whatever `trust proxy` derived — which is correct for a request
 * that really did come direct.
 */
export function trustedClientIp(): RequestHandler {
  return function trustedClientIpMiddleware(req, _res, next) {
    const claimed = req.get(CLIENT_IP_HEADER);
    const presented = req.get(PROXY_KEY_HEADER);

    // Stripped before anything decides whether to believe them, and on every
    // path out of here. Until the key is checked these are attacker-controlled,
    // and a rejected claim left in place would still reach the request logger
    // and read there as the client's address.
    delete req.headers[CLIENT_IP_HEADER];
    delete req.headers[PROXY_KEY_HEADER];

    // env() at request time, never at mount time: buildApp() is imported by the
    // test harness before setup.ts assigns MONGO_URI, and a config read during
    // wiring fails validation on 16 suites. Same exception as lib/logger.ts.
    const secret = env().PROXY_SHARED_SECRET;
    if (!secret || !claimed || !presented) {
      next();
      return;
    }

    // Both checks before the override, and the address is validated as an
    // address. `req.ip` reaches rate-limit keys, the request log and the session
    // audit row, so an unvalidated string here is a way to write chosen text
    // into all three.
    if (keyMatches(presented, secret) && isIP(claimed) !== 0) {
      // Shadows Express's prototype getter for this request only.
      Object.defineProperty(req, "ip", { configurable: true, get: () => claimed });
    }

    next();
  };
}
