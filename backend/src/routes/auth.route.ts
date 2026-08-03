import { Router, type Request } from "express";
import type { Portal } from "@jobportal/shared";
import { rateLimit } from "../middleware/rateLimit.js";
import { csrfProtection } from "../middleware/csrf.js";
import { authenticate } from "../middleware/authenticate.js";
import {
  confirmGoogleLinkHandler,
  forgotPasswordHandler,
  googleCallbackHandler,
  googleStartHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
  registerHandler,
  resendCodeHandler,
  resetPasswordHandler,
  verifyEmailHandler,
} from "../controllers/auth.controller.js";

/**
 * Body email for rate-limit keys: normalised and bounded here, VALIDATED
 * later by the handler's schema — the limiter must run first and cannot
 * assume a well-formed body. Garbage bodies all share the "" bucket, which
 * only ever throttles other garbage.
 */
function emailKey(req: Request): string {
  const raw = (req.body as { email?: unknown } | undefined)?.email;
  return typeof raw === "string" ? raw.trim().toLowerCase().slice(0, 254) : "";
}

/**
 * One router, mounted twice; the mount path is the ONLY place a portal is
 * named, and app.ts passes it as a literal. Limits are the spec's:
 * registration 10/h/IP, login 5/15min per IP+email, OTP request 3/h/email,
 * OTP redemption 10/h/IP, Google start 10/h/IP.
 *
 * The rateLimit key already embeds method+path, so every endpoint gets its
 * own bucket — and because the path EXCLUDES the mount prefix, a bucket is
 * shared across the two portals for the same key. That is the conservative
 * direction: alternating mounts must not double an attacker's allowance.
 */
export function buildAuthRouter(portal: Portal): Router {
  const router = Router();

  const rlRegister = rateLimit({ windowMs: 3_600_000, max: 10 });
  const rlLogin = rateLimit({ windowMs: 900_000, max: 5, keyFn: (req) => `${req.ip ?? "unknown"}:${emailKey(req)}` });
  const rlOtpRequest = rateLimit({ windowMs: 3_600_000, max: 3, keyFn: emailKey });
  const rlRedeem = rateLimit({ windowMs: 3_600_000, max: 10 });
  const rlGoogle = rateLimit({ windowMs: 3_600_000, max: 10 });

  router.post("/register", rlRegister, registerHandler(portal));
  router.post("/verify-email", rlRedeem, verifyEmailHandler(portal));
  router.post("/resend-code", rlOtpRequest, resendCodeHandler(portal));
  router.post("/login", rlLogin, loginHandler(portal));
  router.post("/forgot-password", rlOtpRequest, forgotPasswordHandler(portal));
  router.post("/reset-password", rlRedeem, resetPasswordHandler(portal));

  // Only the session-bearing mutations carry CSRF. Everything above runs
  // before any session exists, where CSRF protects nothing. refresh is the
  // textbook target — it acts on a cookie the browser attaches by itself.
  router.post("/refresh", csrfProtection, refreshHandler(portal));
  router.post("/logout", csrfProtection, logoutHandler(portal));

  router.get("/google", rlGoogle, googleStartHandler(portal));
  // No CSRF on the callback: a top-level GET navigation Google initiates, to
  // which no header can be attached. Its protections are the signed lax
  // transaction cookie, state, and nonce (Task 9).
  router.get("/google/callback", googleCallbackHandler(portal));
  router.post("/google/confirm-link", rlRedeem, confirmGoogleLinkHandler(portal));

  router.get("/me", authenticate(portal), meHandler(portal));

  return router;
}
