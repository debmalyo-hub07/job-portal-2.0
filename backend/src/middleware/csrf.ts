import type { NextFunction, Request, Response } from "express";
import type { Portal } from "@jobportal/shared";
import { AppError } from "../lib/AppError.js";
import { verifyCsrfToken } from "../lib/csrfToken.js";
import { csrfCookieName } from "../lib/cookies.js";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Double-submit CSRF check, on every unsafe method.
 *
 * The cookie is readable by JavaScript on purpose — that is what lets our own
 * client echo it into a header. Its integrity comes from the embedded MAC, not
 * from secrecy: an attacker who can *write* cookies (an insecure sibling origin,
 * a compromised subdomain) can set a cookie and send a matching header, which
 * defeats plain double-submit. They cannot forge the MAC.
 *
 * The cookie name is portal-scoped, so the portal must be resolved to find it.
 * Two ways, both literals or server-derived, never from the request:
 *
 * - Explicit: `/refresh` and `/logout` run BEFORE the authenticate middleware
 *   (refresh *establishes* the identity), so they pass the mount's own portal.
 * - From `req.auth`: on every domain route `authenticate(...)` runs first, so
 *   the portal comes from the cookie the request authenticated with. A cookie
 *   left over from another portal simply does not match under that name.
 */
export function csrfProtection(portal?: Portal) {
  return function csrfProtectionMiddleware(req: Request, _res: Response, next: NextFunction): void {
    if (SAFE.has(req.method)) {
      next();
      return;
    }

    const resolved = portal ?? req.auth?.portal;
    // csrfCookieName(portal), not the bare constant: in production the cookie is
    // stored as `__Host-jp_<portal>_csrf`, and reading the bare name there
    // matches nothing — every mutation would 403 in production only.
    const cookie = resolved
      ? (req.cookies?.[csrfCookieName(resolved)] as string | undefined)
      : undefined;
    const header = req.get("x-csrf-token");

    if (!cookie || !header || !verifyCsrfToken(cookie) || cookie !== header) {
      next(AppError.forbidden("CSRF_INVALID", "Request could not be verified. Reload and try again."));
      return;
    }
    next();
  };
}
