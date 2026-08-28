import type { Request, Response } from "express";
import {
  guardianConsentConfirmBodySchema,
  guardianConsentStartBodySchema,
} from "@jobportal/shared";
import { parseBody } from "../lib/validate.js";
import { AppError } from "../lib/AppError.js";
import { findAccountById } from "../services/account.service.js";
import {
  confirmGuardianConsent,
  startGuardianConsent,
} from "../services/guardianConsent.service.js";

/**
 * The guardian-consent pair, mounted on the user router under
 * `authenticateAny()` — the same gate the completion endpoint sits behind, for
 * the same reason: this IS part of the completion for a 16-17-year-old, and a
 * gate mounted here would be an unrecoverable lockout.
 *
 * The account always comes from the session; the body contributes an email
 * address or a code and nothing else.
 */
export const startGuardianConsentHandler = async (req: Request, res: Response): Promise<void> => {
  const body = parseBody(guardianConsentStartBodySchema, req.body);
  if (!req.auth) throw AppError.unauthorized("SESSION_MISSING", "Sign in to continue.");
  const { portal, id } = req.auth;
  const account = await findAccountById(portal, id);
  if (!account) throw AppError.unauthorized("SESSION_INVALID", "Sign in to continue.");

  const message = await startGuardianConsent(portal, account, body.email);
  res.status(200).json({ success: true, message });
};

export const confirmGuardianConsentHandler = async (req: Request, res: Response): Promise<void> => {
  const { code } = parseBody(guardianConsentConfirmBodySchema, req.body);
  if (!req.auth) throw AppError.unauthorized("SESSION_MISSING", "Sign in to continue.");
  const { portal, id } = req.auth;
  const account = await findAccountById(portal, id);
  if (!account) throw AppError.unauthorized("SESSION_INVALID", "Sign in to continue.");

  const message = await confirmGuardianConsent(portal, account, code);
  res.status(200).json({ success: true, message });
};
