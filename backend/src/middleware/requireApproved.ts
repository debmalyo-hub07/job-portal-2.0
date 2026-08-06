import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/AppError.js";
import { findAccountById } from "../services/account.service.js";

/**
 * Refuses a recruiter whose account an admin has not yet approved.
 *
 * Mounted AFTER `authenticate("recruiter")`, which is what establishes identity.
 * The split is deliberate: `authenticate` admits a pending recruiter so they can
 * reach /me and be told why they are blocked; this decides what they may do.
 *
 * 403 rather than the 404 used for ownership failures. That rule exists so a
 * foreign recruiter cannot prove a resource EXISTS; this refusal is about the
 * caller's own account state and discloses nothing about any resource. A 404
 * here would also be a lie — the resource frequently does not exist yet, because
 * the call being refused is the one that would have created it.
 *
 * Re-reads the account rather than trusting a claim in the token: approval
 * happens while the recruiter is signed in, and a status baked into a 15-minute
 * access token would leave them locked out for the rest of its life, or —
 * worse, in the other direction — leave a revoked recruiter working until it
 * expired.
 */
export async function requireApproved(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.auth) {
    next(AppError.unauthorized("SESSION_MISSING", "Sign in to continue."));
    return;
  }

  const account = await findAccountById(req.auth.portal, req.auth.id);
  if (!account) {
    next(AppError.unauthorized("SESSION_INVALID", "Sign in to continue."));
    return;
  }

  if (account.status === "pending") {
    next(
      AppError.forbidden(
        "RECRUITER_PENDING_APPROVAL",
        "Your recruiter account is awaiting approval.",
      ),
    );
    return;
  }

  next();
}
