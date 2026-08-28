import type { Request, Response } from "express";
import { emailChangeConfirmBodySchema, emailChangeStartBodySchema } from "@jobportal/shared";
import { parseBody } from "../lib/validate.js";
import { AppError } from "../lib/AppError.js";
import { findAccountById } from "../services/account.service.js";
import { confirmEmailChange, startEmailChange } from "../services/emailChange.service.js";

/**
 * Both email-change steps, mounted twice per ADR-0006's rule: once under
 * `authenticateAny()` at `/user/email-change*` (seeker or recruiter — never
 * admin) and once under `authenticate("admin")` at `/admin/email-change*`.
 *
 * The portal decides which flow runs — the admin mount gets the two-stage
 * state machine — and it arrives only from the server-owned route literal,
 * never from the request. The account always comes from the session; the body
 * contributes a new address, a password, and nothing else.
 */
export const startEmailChangeHandler = async (req: Request, res: Response): Promise<void> => {
  const body = parseBody(emailChangeStartBodySchema, req.body);
  if (!req.auth) throw AppError.unauthorized("SESSION_MISSING", "Sign in to continue.");
  const { portal, id } = req.auth;
  // `withSecret` because the password step-up compares against the stored
  // hash; the hash itself never leaves this process.
  const account = await findAccountById(portal, id, { withSecret: true });
  if (!account) throw AppError.unauthorized("SESSION_INVALID", "Sign in to continue.");

  const message = await startEmailChange(portal, account, body);
  res.status(200).json({ success: true, message });
};

export const confirmEmailChangeHandler = async (req: Request, res: Response): Promise<void> => {
  const { code } = parseBody(emailChangeConfirmBodySchema, req.body);
  if (!req.auth) throw AppError.unauthorized("SESSION_MISSING", "Sign in to continue.");
  const { portal, id } = req.auth;
  const account = await findAccountById(portal, id);
  if (!account) throw AppError.unauthorized("SESSION_INVALID", "Sign in to continue.");

  const message = await confirmEmailChange(portal, account, code);
  res.status(200).json({ success: true, message });
};
