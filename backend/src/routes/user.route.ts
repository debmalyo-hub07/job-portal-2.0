import express from "express";
import { completeProfile, getProfile, updateProfile } from "../controllers/user.controller.js";
import {
  confirmEmailChangeHandler,
  startEmailChangeHandler,
} from "../controllers/emailChange.controller.js";
import {
  confirmGuardianConsentHandler,
  startGuardianConsentHandler,
} from "../controllers/guardianConsent.controller.js";
import { authenticateAny } from "../middleware/authenticate.js";
import { resumeUpload } from "../middleware/multer.js";
import { csrfProtection } from "../middleware/csrf.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { requireMailerAvailable } from "../middleware/requireMailerAvailable.js";

const router = express.Router();

// Authentication lives on /api/v1/{seeker,recruiter}/auth/*. What remains here
// is the profile pair, which serves both portals — hence `authenticateAny`,
// which resolves whichever portal session the browser holds.
router.route("/profile").get(authenticateAny(), getProfile);
router
  .route("/profile/update")
  .post(authenticateAny(), csrfProtection(), resumeUpload, updateProfile);
// Deliberately NOT behind `requireProfileComplete`: this is the route that clears
// it. Same exemption `requireVerified` grants the resend-code route, and the same
// trap — a gate mounted here would be an unrecoverable lockout.
//
// No `resumeUpload`: this path is JSON, and there is no file on it.
router.route("/profile/complete").post(authenticateAny(), csrfProtection(), completeProfile);

/**
 * Guardian consent (Project C) — the second half of a 16-17-year-old's
 * completion. Same exemptions as `/profile/complete`: `authenticateAny` and
 * deliberately NOT `requireProfileComplete`, because this is the route that
 * clears the gate for a minor. Same rate shape as the other OTP flows: send
 * 3/hour per subject behind mail readiness, confirm 10/hour per IP.
 */
router
  .route("/guardian-consent")
  .post(
    authenticateAny(),
    csrfProtection(),
    rateLimit({
      windowMs: 3_600_000,
      max: 3,
      keyFn: (req) => `subject:${req.auth?.id ?? req.ip ?? "unknown"}`,
    }),
    requireMailerAvailable,
    startGuardianConsentHandler,
  );
router
  .route("/guardian-consent/confirm")
  .post(
    authenticateAny(),
    csrfProtection(),
    rateLimit({ windowMs: 3_600_000, max: 10 }),
    confirmGuardianConsentHandler,
  );

/**
 * Email change, for seeker and recruiter sessions (admin has its own mount —
 * ADR-0006: an admin cookie must never silently satisfy a route that meant
 * "some signed-in user").
 *
 * No Turnstile: the session is the bot barrier, and CSRF covers this
 * browser-attached write. Start is 3/hour keyed by SUBJECT — the session is
 * the identity here, not the IP — and sits behind mail readiness like every
 * other code-issuing route. Confirm is 10/hour per IP, matching the other
 * redemptions, where the per-account failure budget is the real defence.
 */
router
  .route("/email-change")
  .post(
    authenticateAny(),
    csrfProtection(),
    rateLimit({
      windowMs: 3_600_000,
      max: 3,
      keyFn: (req) => `subject:${req.auth?.id ?? req.ip ?? "unknown"}`,
    }),
    requireMailerAvailable,
    startEmailChangeHandler,
  );
router
  .route("/email-change/confirm")
  .post(authenticateAny(), csrfProtection(), rateLimit({ windowMs: 3_600_000, max: 10 }), confirmEmailChangeHandler);

export default router;
