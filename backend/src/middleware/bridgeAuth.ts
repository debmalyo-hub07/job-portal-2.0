import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import type { Portal } from "@jobportal/shared";
import { AppError } from "../lib/AppError.js";
import { env } from "../config/env.js";
import { accessCookieName } from "../lib/cookies.js";
import { verifyAccessToken } from "../services/session.service.js";
import { findAccountById } from "../services/account.service.js";
// Layering exception, deliberate: middleware does not normally import a model.
// The alternative is a `legacy.service.ts` created solely so that Task 15 can
// delete it three commits later. This whole module is transitional; keeping the
// exception inside it, marked, is less churn than spreading it across a file
// that has no other reason to exist.
import { User } from "../models/user.model.js";

/** Which portals a route will accept a session from. */
export type BridgeScope = Portal | "any";

const PORTAL_BY_LEGACY_ROLE = { student: "seeker", recruiter: "recruiter" } as const;
const CANDIDATES: readonly Portal[] = ["seeker", "recruiter"];

type BridgeOptions = {
  /** Defaults to `env().LEGACY_AUTH_FALLBACK`. Tests pass it explicitly —
   *  `env()` memoises on first read, so flipping `process.env` mid-suite does
   *  nothing, and a test that thinks it disabled the fallback would silently
   *  assert the opposite of what it means to. */
  legacyFallback?: boolean;
};

/**
 * Transitional authentication for the inherited domain routes.
 *
 * These routes are rebuilt in Phase 1C on `authenticate(portal)` and explicit
 * DTOs. Until then they keep reading `req.id`, and this middleware is what fills
 * it: preferring a real portal session, falling back to the inherited `token`
 * cookie only while `LEGACY_AUTH_FALLBACK` is on.
 *
 * `scope` is not an authorization decision — it answers "which of the two
 * cookies do I read", which is a question the route can answer and the
 * middleware cannot. Ownership is still unchecked; that is Phase 1C.
 */
export function bridgeAuth(scope: BridgeScope, options: BridgeOptions = {}) {
  return async function bridgeAuthMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    const allowed = scope === "any" ? CANDIDATES : [scope];

    // --- Preferred path: a real portal session. -----------------------------
    //
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
        // "any" route — the other portal's cookie may still be good. Keep
        // looking; if nothing validates we fall through to the legacy path.
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
      // The whole point of the bridge. `_id` is preserved by the migration, so
      // this is the same ObjectId the legacy controllers have always seen.
      req.id = String(account._id);
      next();
      return;
    }

    // --- Fallback: the inherited cookie. DELETED IN TASK 15. ----------------
    const fallbackEnabled = options.legacyFallback ?? env().LEGACY_AUTH_FALLBACK;
    if (fallbackEnabled) {
      const legacy = req.cookies?.token as string | undefined;
      if (legacy) {
        const userId = readLegacyToken(legacy);
        if (userId) {
          // One indexed read, only on this path. Without it the legacy token
          // would satisfy `bridgeAuth("recruiter")` for a student account,
          // because the inherited JWT carries no role claim at all. That is the
          // status quo of Phase 1A, and reproducing it here would mean the
          // scope parameter is enforced on one path and decorative on the other
          // — the kind of asymmetry that survives into production.
          const user = await User.findById(userId).select({ role: 1 }).lean();
          const portal = user ? PORTAL_BY_LEGACY_ROLE[user.role as "student" | "recruiter"] : undefined;
          if (portal && (scope === "any" || scope === portal)) {
            req.auth = {
              id: String(userId),
              portal,
              // The inherited system never verified an email address. Reporting
              // `true` here would let a legacy token walk through any future
              // `requireVerified`; reporting `false` is both accurate and the
              // safe direction to be wrong in.
              emailVerified: false,
            };
            req.id = String(userId);
            next();
            return;
          }
        }
      }
    }

    next(AppError.unauthorized("SESSION_MISSING", "Sign in to continue."));
  };
}

/** Returns the subject of an inherited token, or undefined if it is not one. */
function readLegacyToken(token: string): string | undefined {
  try {
    const decoded = jwt.verify(token, env().JWT_ACCESS_SECRET) as JwtPayload;
    const userId: unknown = decoded.userId;
    return typeof userId === "string" ? userId : undefined;
  } catch {
    return undefined;
  }
}
