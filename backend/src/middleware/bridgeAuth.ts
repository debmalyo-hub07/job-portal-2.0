import type { NextFunction, Request, Response } from "express";
import type { Portal } from "@jobportal/shared";
import { AppError } from "../lib/AppError.js";
import { accessCookieName } from "../lib/cookies.js";
import { verifyAccessToken } from "../services/session.service.js";
import { findAccountById } from "../services/account.service.js";

/** Which portals a route will accept a session from. */
export type BridgeScope = Portal | "any";

const CANDIDATES: readonly Portal[] = ["seeker", "recruiter"];

/**
 * Transitional authentication for the inherited domain routes.
 *
 * These routes are rebuilt in Phase 1C on `authenticate(portal)` and explicit
 * DTOs. Until then they keep reading `req.id`, and this middleware is what fills
 * it from a real portal session.
 *
 * `scope` is not an authorization decision — it answers "which of the two
 * cookies do I read", which is a question the route can answer and the
 * middleware cannot. Ownership is still unchecked; that is Phase 1C.
 */
export function bridgeAuth(scope: BridgeScope) {
  return async function bridgeAuthMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    const allowed = scope === "any" ? CANDIDATES : [scope];

    // Ordered, not first-cookie-wins: a person may legitimately hold both a
    // seeker and a recruiter session in one browser (ADR-0001 exists precisely
    // so the same email can do that). On an "any" route the order below decides,
    // and it is fixed rather than incidental so that a dual-session user gets
    // the same identity on every request instead of one that depends on cookie
    // ordering in the header.
    for (const portal of allowed) {
      const token = req.cookies?.[accessCookieName(portal)] as string | undefined;
      if (!token) continue;

      let claims;
      try {
        claims = verifyAccessToken(token, portal);
      } catch {
        // A stale cookie for a portal this route accepts is not fatal on an
        // "any" route — the other portal's cookie may still be good.
        continue;
      }

      const account = await findAccountById(portal, claims.sub);
      if (!account || account.status !== "active") continue;

      const cutoff = account.sessionsInvalidatedAt;
      if (cutoff && claims.iat !== undefined) {
        if (claims.iat < Math.floor(cutoff.getTime() / 1000)) continue;
      }

      req.auth = {
        id: String(account._id),
        portal,
        emailVerified: account.emailVerifiedAt !== null,
      };
      // `_id` is preserved by the 1B migration, so this is the same ObjectId the
      // inherited controllers have always seen.
      req.id = String(account._id);
      next();
      return;
    }

    next(AppError.unauthorized("SESSION_MISSING", "Sign in to continue."));
  };
}
