import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/AppError.js";
import { verifyCsrfToken } from "../lib/csrfToken.js";
import { csrfCookieName } from "../lib/cookies.js";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Double-submit CSRF check, on every unsafe method.
 *
 * The cookie is readable by JavaScript on purpose — that is what lets our own
 * client echo it into the header. Its integrity comes from the embedded MAC, not
 * from secrecy: an attacker who can *write* cookies (an insecure sibling origin,
 * a compromised subdomain) can set a cookie and send a matching header, which
 * defeats plain double-submit. They cannot forge the MAC.
 */
export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE.has(req.method)) {
    next();
    return;
  }

  // csrfCookieName(), not the bare constant: in production the cookie is
  // stored as `__Host-jp_csrf`, and reading `jp_csrf` there matches nothing —
  // every mutation would 403 in production only.
  const cookie = req.cookies?.[csrfCookieName()] as string | undefined;
  const header = req.get("x-csrf-token");

  if (!cookie || !header || !verifyCsrfToken(cookie) || cookie !== header) {
    next(AppError.forbidden("CSRF_INVALID", "Request could not be verified. Reload and try again."));
    return;
  }
  next();
}
