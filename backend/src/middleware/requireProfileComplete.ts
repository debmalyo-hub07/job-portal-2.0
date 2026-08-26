import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/AppError.js";

/**
 * Refuses an account that has not supplied a date of birth.
 *
 * Mounted after `authenticate`, and deliberately NOT on the completion
 * endpoint, the profile pair, `/me`, refresh, logout or any public route — the
 * gate must never block the route that clears it. That is the same rule
 * `requireVerified` documents, and the same trap.
 *
 * Reads `req.auth.profileComplete` rather than re-reading the account:
 * `authenticate` already fetched it. The check is truthiness rather than
 * `=== false` so an authenticator that forgot to set the field fails closed
 * instead of silently disabling the gate everywhere it is mounted.
 */
export function requireProfileComplete(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.auth) {
    next(AppError.unauthorized("SESSION_MISSING", "Sign in to continue."));
    return;
  }
  if (!req.auth.profileComplete) {
    next(AppError.forbidden("PROFILE_INCOMPLETE", "Add your date of birth to continue."));
    return;
  }
  next();
}
