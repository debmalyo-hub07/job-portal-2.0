import type { CookieOptions, Response } from "express";
import type { Portal } from "@jobportal/shared";
import { env } from "../config/env.js";

/**
 * `__Host-` is applied only when the cookie is Secure, because the browser
 * rejects a `__Host-` cookie without it — over plain HTTP in local development
 * the prefixed cookie would simply never be stored. The prefix is therefore
 * assembled from config rather than hardcoded into the name.
 *
 * This is not a weakening of the guardrail in CLAUDE.md: `secure`, `httpOnly`
 * and `sameSite` are unchanged in every environment. Only the name differs.
 */
function prefixed(base: string): string {
  return isSecure() ? `__Host-${base}` : base;
}

function isSecure(): boolean {
  return env().NODE_ENV === "production";
}

export function accessCookieName(portal: Portal): string {
  return prefixed(`jp_${portal}_at`);
}

export function refreshCookieName(portal: Portal): string {
  return prefixed(`jp_${portal}_rt`);
}

/**
 * The CSRF cookie is portal-scoped, exactly like the access and refresh
 * cookies: `jp_seeker_csrf`, `jp_recruiter_csrf`, `jp_admin_csrf`. A single
 * global name would let a second portal's sign-in overwrite the first
 * portal's token cookie — the later session would work and the earlier one's
 * mutations would 403 with a token that no longer matches the cookie. The
 * token itself is MAC-bound and session-independent, so nothing else about
 * the double-submit check changes; only which cookie a portal reads.
 */
export function csrfCookieName(portal: Portal): string {
  return prefixed(`jp_${portal}_csrf`);
}

/**
 * Note the absence of `domain` and the hardcoded `path: "/"`. Both are mandatory
 * for `__Host-`, and keeping them identical in development means a cookie bug
 * cannot hide until production. COOKIE_DOMAIN is deliberately not consulted here.
 */
function base(): CookieOptions {
  return {
    httpOnly: true,
    secure: isSecure(),
    sameSite: env().COOKIE_SAMESITE,
    path: "/",
  };
}

export function setAccessCookie(res: Response, portal: Portal, token: string): void {
  res.cookie(accessCookieName(portal), token, {
    ...base(),
    maxAge: env().ACCESS_TOKEN_TTL_MINUTES * 60_000,
  });
}

export function setRefreshCookie(res: Response, portal: Portal, token: string): void {
  res.cookie(refreshCookieName(portal), token, {
    ...base(),
    maxAge: env().REFRESH_TOKEN_TTL_DAYS * 86_400_000,
  });
}

/** Readable by design — the client must echo it in a header. */
export function setCsrfCookie(res: Response, portal: Portal, token: string): void {
  res.cookie(csrfCookieName(portal), token, { ...base(), httpOnly: false });
}

/**
 * Cleared with the same attributes they were set with. The inherited logout sent
 * `cookie("token", "", { maxAge: 0 })` with no path, secure or sameSite; a cookie
 * whose attributes do not match is not overwritten, so in production the session
 * survived a logout.
 */
export function clearAuthCookies(res: Response, portal: Portal): void {
  const opts = base();
  res.clearCookie(accessCookieName(portal), opts);
  res.clearCookie(refreshCookieName(portal), opts);
  res.clearCookie(csrfCookieName(portal), { ...opts, httpOnly: false });
}

const GOOGLE_TXN_COOKIE = "jp_gtxn";

export function googleTxnCookieName(): string {
  return prefixed(GOOGLE_TXN_COOKIE);
}

/**
 * sameSite is hardcoded "lax", NOT the configured value.
 *
 * The callback is a cross-site top-level GET arriving from
 * accounts.google.com; a `strict` cookie is not sent on that navigation, so
 * with the default COOKIE_SAMESITE=strict every sign-in would die with a
 * missing-transaction error and nothing in any log to explain it. `lax` sends
 * the cookie on top-level navigations — exactly and only what the callback is.
 *
 * The session cookies are NOT loosened; they keep the configured value. They
 * are SET on the callback response, which is always allowed; sameSite gates
 * sending, not setting.
 */
export function setGoogleTxnCookie(res: Response, token: string): void {
  res.cookie(googleTxnCookieName(), token, {
    httpOnly: true,
    secure: isSecure(),
    sameSite: isSecure() ? "none" : "lax",
    path: "/",
    maxAge: 10 * 60_000,
  });
}

export function clearGoogleTxnCookie(res: Response): void {
  res.clearCookie(googleTxnCookieName(), {
    httpOnly: true,
    secure: isSecure(),
    sameSite: isSecure() ? "none" : "lax",
    path: "/",
  });
}
