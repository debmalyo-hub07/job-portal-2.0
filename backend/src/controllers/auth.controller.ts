import type { RequestHandler } from "express";
import {
  confirmGoogleLinkBodySchema,
  forgotPasswordBodySchema,
  loginBodySchema,
  registerBodySchema,
  resendVerificationBodySchema,
  resetPasswordBodySchema,
  verifyEmailBodySchema,
  type Portal,
} from "@jobportal/shared";
import { parseBody } from "../lib/validate.js";
import { AppError } from "../lib/AppError.js";
import { csrfCookieName, refreshCookieName, setCsrfCookie } from "../lib/cookies.js";
import { mintCsrfToken, verifyCsrfToken } from "../lib/csrfToken.js";
import { env } from "../config/env.js";
import { endSession, issueSession, rotateSession } from "../services/session.service.js";
import { findAccountById } from "../services/account.service.js";
import {
  confirmGoogleLink,
  handleGoogleCallback,
  startGoogleFlow,
} from "../services/googleAuth.service.js";
import * as auth from "../services/auth.service.js";

/**
 * Every handler is a factory taking the portal as a server-side literal from
 * the mount (Task 10 passes it when building the router). Nothing in this file
 * reads a portal, a role, or an account id from the request payload.
 */
export function registerHandler(portal: Portal): RequestHandler {
  return async (req, res) => {
    const body = parseBody(registerBodySchema, req.body);
    await auth.register(portal, body);
    res.status(201).json({
      success: true,
      message: "Account created. Enter the code we just emailed you.",
    });
  };
}

export function verifyEmailHandler(portal: Portal): RequestHandler {
  return async (req, res) => {
    const { email, code } = parseBody(verifyEmailBodySchema, req.body);
    const account = await auth.verifyEmail(portal, email, code);
    const { csrfToken } = await issueSession(res, req, account._id, portal);
    res.json({ success: true, user: auth.toSessionUser(portal, account), csrfToken });
  };
}

export function resendCodeHandler(portal: Portal): RequestHandler {
  return async (req, res) => {
    const { email } = parseBody(resendVerificationBodySchema, req.body);
    await auth.resendVerification(portal, email);
    res.json({
      success: true,
      message: "If that address has an unverified account, a new code is on its way.",
    });
  };
}

export function loginHandler(portal: Portal): RequestHandler {
  return async (req, res) => {
    const { email, password } = parseBody(loginBodySchema, req.body);
    const account = await auth.login(portal, email, password);
    const { csrfToken } = await issueSession(res, req, account._id, portal);
    res.json({ success: true, user: auth.toSessionUser(portal, account), csrfToken });
  };
}

export function logoutHandler(portal: Portal): RequestHandler {
  return async (req, res) => {
    const presented = req.cookies?.[refreshCookieName(portal)] as string | undefined;
    // Revokes the family if the cookie is present and known; clears cookies
    // with matching attributes either way (the inherited logout's bug).
    await endSession(res, portal, presented);
    res.json({ success: true, message: "Signed out." });
  };
}

export function forgotPasswordHandler(portal: Portal): RequestHandler {
  return async (req, res) => {
    const { email } = parseBody(forgotPasswordBodySchema, req.body);
    await auth.forgotPassword(portal, email);
    res.json({
      success: true,
      message: "If that address has an account, a reset code is on its way.",
    });
  };
}

export function resetPasswordHandler(portal: Portal): RequestHandler {
  return async (req, res) => {
    const { email, code, newPassword } = parseBody(resetPasswordBodySchema, req.body);
    await auth.resetPassword(portal, email, code, newPassword);
    res.json({ success: true, message: "Password changed. Sign in with the new password." });
  };
}

export function refreshHandler(portal: Portal): RequestHandler {
  return async (req, res) => {
    const presented = req.cookies?.[refreshCookieName(portal)] as string | undefined;
    if (!presented) {
      throw AppError.unauthorized(
        "SESSION_INVALID",
        "Your session has expired. Please sign in again.",
      );
    }
    // The mount's portal decides only WHICH COOKIE NAME to read. The session
    // that comes back is whatever the stored row says (Task 5): a seeker token
    // smuggled under the recruiter cookie name re-issues seeker cookies —
    // never recruiter ones.
    const { csrfToken } = await rotateSession(res, req, presented);
    res.json({ success: true, csrfToken });
  };
}

export function googleStartHandler(portal: Portal): RequestHandler {
  return (_req, res) => {
    res.redirect(startGoogleFlow(portal, res));
  };
}

/**
 * DELIBERATE exception to the "failures throw AppError" convention, and the
 * only one in the phase: this endpoint is a top-level browser navigation from
 * Google, not an XHR. A JSON envelope strands a human on a wall of JSON, so
 * every outcome — including failure — is a redirect back into the web app.
 *
 * Failure carries ONE uniform code — GOOGLE_AUTH_FAILED — so the URL never
 * tells a prober which check tripped, with a single carve-out: the address
 * already holding an account answers EMAIL_TAKEN. That viewer proved mailbox
 * control to Google to get here, and register() already says the same thing
 * to anyone with no proof at all, so the distinction hides nothing — it just
 * stops the address's legitimate owner meeting a dead end. `portal=` rides
 * both URLs so "Back to sign in" returns to the login the person came from.
 */
export function googleCallbackHandler(portal: Portal): RequestHandler {
  return async (req, res) => {
    const outcome = await handleGoogleCallback(portal, req, res);
    const web = env().WEB_BASE_URL;
    if (outcome.kind === "signed-in") {
      await issueSession(res, req, outcome.account._id, portal);
      // The portal in the query is a bootstrap hint for the SPA's /me call,
      // nothing more — the session's real portal is enforced by the cookies.
      res.redirect(`${web}/auth/complete?portal=${portal}`);
      return;
    }
    if (outcome.kind === "address-taken") {
      res.redirect(`${web}/auth/error?code=EMAIL_TAKEN&portal=${portal}`);
      return;
    }
    res.redirect(`${web}/auth/error?code=GOOGLE_AUTH_FAILED&portal=${portal}`);
  };
}

export function confirmGoogleLinkHandler(portal: Portal): RequestHandler {
  return async (req, res) => {
    const { token } = parseBody(confirmGoogleLinkBodySchema, req.body);
    await confirmGoogleLink(portal, token);
    res.json({ success: true, message: "Google sign-in is now linked. Use it to sign in." });
  };
}

export function meHandler(portal: Portal): RequestHandler {
  return async (req, res) => {
    // Mounted behind authenticate(portal) in Task 10, so req.auth is set. The
    // plan reached for `req.auth!.id`; guarded instead, because the assertion
    // is only true as long as every future mount remembers the middleware, and
    // the failure mode of forgetting is a 500 on a TypeError rather than the
    // 401 this obviously means.
    if (!req.auth) throw AppError.unauthorized("SESSION_MISSING", "Sign in to continue.");
    // `withSecret` selects `+passwordHash` so `toSessionUser` can answer
    // `hasPassword` — the projection is a boolean, never the hash itself.
    const account = await findAccountById(portal, req.auth.id, { withSecret: true });
    if (!account) throw AppError.unauthorized("SESSION_INVALID", "Sign in to continue.");

    // Hands back the CSRF token so the client can re-arm after a reload.
    //
    // The client cannot read the cookie itself: cross-site the browser withholds
    // it from `document.cookie` even though it is not httpOnly. A hard reload —
    // and the top-level redirect the Google callback performs — therefore starts
    // with nothing in memory, and without this the first mutation afterwards
    // 403s. The *server* has no such problem, which is the point below.
    //
    // Echoed when the cookie already holds a valid token, minted only when it
    // does not. Minting unconditionally looked simpler and was a bug: `/me` is
    // called on every bootstrap, so a fresh token there invalidates the one any
    // in-flight request is already carrying. `integration.test.ts` caught it —
    // capture a token, call `/me`, and the captured token 403s on the next
    // mutation. Rotation belongs to `/refresh`, which rotates the session.
    //
    // Echoing discloses nothing: this is behind `authenticate(portal)`, and the
    // caller demonstrably already holds the cookie, since they just sent it.
    const presented = req.cookies?.[csrfCookieName(portal)] as string | undefined;
    let csrfToken: string;
    if (presented && verifyCsrfToken(presented)) {
      csrfToken = presented;
    } else {
      csrfToken = mintCsrfToken();
      setCsrfCookie(res, portal, csrfToken);
    }
    res.json({ success: true, user: auth.toSessionUser(portal, account), csrfToken });
  };
}
