import express from "express";
import { z } from "zod";

import { authenticateAny } from "../middleware/authenticate.js";
import { csrfProtection } from "../middleware/csrf.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { parseBody } from "../lib/validate.js";
import { AppError } from "../lib/AppError.js";
import { findAccountById } from "../services/account.service.js";
import { startPhoneVerification, verifyPhoneCode } from "../services/phoneVerification.service.js";
import type { AccountDoc } from "../services/otp.service.js";

/**
 * Phone verification routes — P3, DORMANT. Mounted by `buildApp` only when
 * `SMS_PROVIDER_KEY` is configured, so an absent key is a route that does not
 * exist (a 404), not a 500 waiting to happen — the same optionality
 * `TURNSTILE_SECRET_KEY` gives bot protection.
 *
 * Rates mirror the email-change flow: sends are 3/hour keyed by SUBJECT (the
 * session is the identity; each send spends an external service's money),
 * confirmations 10/hour per IP like every other redemption, where the
 * per-account failure budget is the real defence.
 */
const router = express.Router();

const sendLimit = rateLimit({
  windowMs: 3_600_000,
  max: 3,
  keyFn: (req) => `subject:${req.auth?.id ?? req.ip ?? "unknown"}`,
});
const confirmLimit = rateLimit({ windowMs: 3_600_000, max: 10 });

const confirmBodySchema = z.object({ code: z.string().trim().regex(/^\d{6}$/) });

async function requireAccount(req: express.Request): Promise<AccountDoc> {
  if (!req.auth) throw AppError.unauthorized("SESSION_MISSING", "Sign in to continue.");
  const account = await findAccountById(req.auth.portal, req.auth.id);
  if (!account) throw AppError.unauthorized("SESSION_INVALID", "Sign in to continue.");
  return account;
}

router.post("/send", authenticateAny(), csrfProtection(), sendLimit, async (req, res) => {
  const account = await requireAccount(req);
  const message = await startPhoneVerification(req.auth!.portal, account);
  res.status(200).json({ success: true, message });
});

router.post("/confirm", authenticateAny(), csrfProtection(), confirmLimit, async (req, res) => {
  const { code } = parseBody(confirmBodySchema, req.body);
  const account = await requireAccount(req);
  const message = await verifyPhoneCode(req.auth!.portal, account, code);
  res.status(200).json({ success: true, message });
});

export default router;
