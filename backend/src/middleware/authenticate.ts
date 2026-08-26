import type { NextFunction, Request, Response } from "express";
import type { Portal } from "@jobportal/shared";
import { AppError } from "../lib/AppError.js";
import { accessCookieName } from "../lib/cookies.js";
import { verifyAccessToken } from "../services/session.service.js";
import { findAccountById, isProfileComplete } from "../services/account.service.js";

/**
 * Verifies the access token for exactly one portal.
 *
 * `portal` is supplied by the route mount as a literal, never read from the
 * request. The token is verified with that portal's derived key, so a seeker
 * token presented here fails the signature check before any claim is inspected.
 */
export function authenticate(portal: Portal) {
  return async function authenticateMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    const token = req.cookies?.[accessCookieName(portal)] as string | undefined;
    if (!token) {
      next(AppError.unauthorized("SESSION_MISSING", "Sign in to continue."));
      return;
    }

    // Throws AppError SESSION_INVALID on a bad signature, wrong portal key,
    // expired token, or a `type` claim that disagrees with `portal`. Express 5
    // forwards the rejection from this async function to the error middleware,
    // so there is deliberately no try/catch here.
    const claims = verifyAccessToken(token, portal);

    const account = await findAccountById(portal, claims.sub);
    if (!account || account.status === "suspended") {
      // Deleted or suspended between minting and use. Same code as a bad token:
      // a suspended user learning that they are suspended from a 403 on every
      // route is worse than a uniform "sign in again".
      //
      // Pending is deliberately NOT refused here: identity and authorization
      // are separate layers, and a pending recruiter must be able to reach /me
      // to learn why they are blocked. `requireApproved` is what refuses them.
      next(AppError.unauthorized("SESSION_INVALID", "Sign in to continue."));
      return;
    }

    // Access-token revocation. `iat` is seconds; the cutoff is milliseconds.
    // Both are floored to the second before comparing, and the comparison is
    // strict — a token minted in the *same second* as the invalidation survives.
    //
    // That 1-second window is deliberate. Without the floor, resetting a
    // password at 10:00:00.500 and issuing the replacement session at
    // 10:00:00.700 produces a token whose iat floors to 10:00:00.000, which is
    // < the cutoff — so the user is instantly logged out of the session the
    // reset just gave them, and logging in again reproduces it. A one-second
    // overlap is a far better trade than an unusable reset flow.
    const cutoff = account.sessionsInvalidatedAt;
    if (cutoff && claims.iat !== undefined) {
      const cutoffSecond = Math.floor(cutoff.getTime() / 1000);
      if (claims.iat < cutoffSecond) {
        next(AppError.unauthorized("SESSION_INVALID", "Sign in to continue."));
        return;
      }
    }

    req.auth = {
      id: String(account._id),
      portal,
      emailVerified: account.emailVerifiedAt !== null,
      profileComplete: isProfileComplete(portal, account),
    };
    next();
  };
}

/**
 * Rejects accounts that have not confirmed their email.
 *
 * Mounted after `authenticate`, and deliberately *not* on the resend-code or
 * profile-read routes — an unverified user has to be able to reach the thing
 * that lets them become verified.
 */
export function requireVerified(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) {
    next(AppError.unauthorized("SESSION_MISSING", "Sign in to continue."));
    return;
  }
  if (!req.auth.emailVerified) {
    next(AppError.forbidden("EMAIL_NOT_VERIFIED", "Confirm your email address to continue."));
    return;
  }
  next();
}

/**
 * Ambient-identity portals for `authenticateAny` / `optionalAuthenticate`.
 *
 * Deliberately excludes "admin", and is a literal list rather than the shared
 * `PORTALS` for that reason. These two resolve whoever the browser happens to
 * be on domain routes (jobs, applications). An admin is an authority over the
 * domain, not a participant in it, so an admin cookie must never silently
 * satisfy a route that meant "some signed-in user". Admin-only routes name
 * their portal with `authenticate("admin")`.
 */
const CANDIDATES: readonly Portal[] = ["seeker", "recruiter"];

async function resolveSession(req: Request, portal: Portal): Promise<boolean> {
  const token = req.cookies?.[accessCookieName(portal)] as string | undefined;
  if (!token) return false;
  let claims;
  try {
    claims = verifyAccessToken(token, portal);
  } catch {
    // Stale cookie for one portal must not kill a route the other portal's
    // cookie would satisfy.
    return false;
  }
  const account = await findAccountById(portal, claims.sub);
  // Suspended only, matching `authenticate` above — pending is an authorization
  // question, and this function answers an identity one.
  if (!account || account.status === "suspended") return false;
  const cutoff = account.sessionsInvalidatedAt;
  if (cutoff && claims.iat !== undefined && claims.iat < Math.floor(cutoff.getTime() / 1000)) {
    return false;
  }
  req.auth = {
    id: String(account._id),
    portal,
    emailVerified: account.emailVerifiedAt !== null,
    profileComplete: isProfileComplete(portal, account),
  };
  return true;
}

/**
 * Accepts a session from either portal, seeker first. The fixed order means a
 * dual-session browser gets the same identity on every request. Routes that can
 * name their portal must use `authenticate(portal)` instead.
 */
export function authenticateAny() {
  return async function authenticateAnyMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    for (const portal of CANDIDATES) {
      if (await resolveSession(req, portal)) {
        next();
        return;
      }
    }
    next(AppError.unauthorized("SESSION_MISSING", "Sign in to continue."));
  };
}

/**
 * Resolves a session if one exists; never 401s. Handlers behind this MUST
 * treat `req.auth` as absent-by-default.
 */
export function optionalAuthenticate() {
  return async function optionalAuthenticateMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    for (const portal of CANDIDATES) {
      if (await resolveSession(req, portal)) break;
    }
    next();
  };
}
