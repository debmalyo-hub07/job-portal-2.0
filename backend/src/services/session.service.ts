import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import mongoose, { Types } from "mongoose";
import type { Request, Response } from "express";
import type { Portal } from "@jobportal/shared";
import { RefreshToken } from "../models/refreshToken.model.js";
import { accessTokenKey, hashRefreshToken } from "../lib/keys.js";
import { mintCsrfToken } from "../lib/csrfToken.js";
import {
  clearAuthCookies,
  setAccessCookie,
  setCsrfCookie,
  setRefreshCookie,
} from "../lib/cookies.js";
import { AppError } from "../lib/AppError.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

export interface AccessClaims {
  sub: string;
  type: Portal;
  /**
   * Issued-at, in seconds. Not set by `signAccessToken` — `jsonwebtoken` adds it
   * automatically — but declared here because the `authenticate` middlewares
   * compare it against `sessionsInvalidatedAt` to honour
   * a session cull. Optional because it is absent from the object passed to
   * `jwt.sign`, present on every object that comes back from `jwt.verify`.
   */
  iat?: number;
}

/** Grace for a retried refresh on a flaky network. See the design note below. */
const REUSE_GRACE_MS = 5_000;

function signAccessToken(subjectId: string, portal: Portal): string {
  const claims: AccessClaims = { sub: subjectId, type: portal };
  return jwt.sign(claims, accessTokenKey(portal), {
    expiresIn: `${env().ACCESS_TOKEN_TTL_MINUTES}m`,
  });
}

export function verifyAccessToken(token: string, portal: Portal): AccessClaims {
  let decoded: unknown;
  try {
    decoded = jwt.verify(token, accessTokenKey(portal));
  } catch {
    throw AppError.unauthorized("SESSION_INVALID", "Your session has expired. Please sign in again.");
  }
  const claims = decoded as AccessClaims;
  // Redundant given the per-portal key — and kept anyway. Two independent checks
  // mean neither one silently becomes the only thing holding the boundary.
  if (claims.type !== portal) {
    throw AppError.unauthorized("SESSION_INVALID", "Your session has expired. Please sign in again.");
  }
  return claims;
}

interface Issued {
  csrfToken: string;
}

export async function issueSession(
  res: Response,
  req: Request,
  subjectId: Types.ObjectId,
  portal: Portal,
  familyId?: Types.ObjectId | string,
): Promise<Issued> {
  const raw = randomBytes(32).toString("base64url");
  // The model declares familyId as a String, so an ObjectId is normalised on
  // write; the family ID is opaque, never interpreted.
  const family = familyId ?? new Types.ObjectId();

  await RefreshToken.create({
    tokenHash: hashRefreshToken(raw),
    subjectId,
    subjectType: portal,
    familyId: family,
    userAgent: req.get("user-agent")?.slice(0, 256) ?? null,
    ip: req.ip ?? null,
    expiresAt: new Date(Date.now() + env().REFRESH_TOKEN_TTL_DAYS * 86_400_000),
  });

  const csrfToken = mintCsrfToken();
  setAccessCookie(res, portal, signAccessToken(String(subjectId), portal));
  setRefreshCookie(res, portal, raw);
  setCsrfCookie(res, csrfToken);
  return { csrfToken };
}

export interface Rotated extends Issued {
  subjectId: Types.ObjectId;
  portal: Portal;
}

/**
 * Rotation. The portal is read off the stored row, never from the mount path the
 * request arrived on — see the ADR-0005 amendment. A caller that passed its own
 * portal in would reintroduce the escalation: a seeker's refresh cookie presented
 * at the recruiter mount minting a recruiter session.
 */
export async function rotateSession(
  res: Response,
  req: Request,
  presented: string,
): Promise<Rotated> {
  const tokenHash = hashRefreshToken(presented);

  // Atomic claim. A read-then-write loses the race between two concurrent
  // refreshes and mints two live tokens from one row.
  const row = await RefreshToken.findOneAndUpdate(
    { tokenHash, revokedAt: null, replacedBy: null, expiresAt: mongoose.trusted({ $gt: new Date() }) },
    { $set: { revokedAt: new Date() } },
    { new: false },
  );

  if (!row) {
    await handleMiss(tokenHash);
    throw AppError.unauthorized("SESSION_INVALID", "Your session has expired. Please sign in again.");
  }

  const portal = row.subjectType as Portal;
  const issued = await issueSession(res, req, row.subjectId, portal, row.familyId);

  // Recorded after the successor exists, because it stores the successor's _id.
  // This write is bookkeeping for the *post*-grace case: it is what lets
  // handleMiss tell "the chain moved on, so this is a genuine replay" from "this
  // token was just rotated". It deliberately does NOT gate the grace window —
  // see handleMiss, which keys on revokedAt precisely because replacedBy is
  // still null during a concurrent double-fire.
  const replacement = await RefreshToken.findOne({
    familyId: row.familyId,
    replacedBy: null,
    revokedAt: null,
  })
    .sort({ createdAt: -1 })
    .select("_id");
  if (replacement) {
    await RefreshToken.updateOne({ _id: row._id }, { $set: { replacedBy: replacement._id } });
  }

  return { ...issued, subjectId: row.subjectId, portal };
}

/**
 * A miss is either a token we have never seen (nothing to do) or a token that was
 * already rotated. The second case means two parties hold the same token, so the
 * family is compromised and every session in it dies.
 *
 * The grace window exists because dropped responses and double-fired requests are
 * ordinary on mobile networks. A design that signs a user out of every device
 * because a refresh was retried will be worked around rather than kept — and the
 * window is narrow enough that a thief cannot rely on landing inside it.
 */
async function handleMiss(tokenHash: string): Promise<void> {
  const used = await RefreshToken.findOne({ tokenHash });
  if (!used) return;

  // The window is keyed on `revokedAt`, which `rotateSession` sets ATOMICALLY at
  // the moment it claims the row — so it is always present here. It is
  // deliberately NOT keyed on `replacedBy`.
  //
  // `replacedBy` cannot be the gate. It can only be written after the successor
  // row exists, which is after the claim; a genuinely concurrent double-fire
  // therefore reaches this function while it is still null, no matter what order
  // rotateSession writes in. Gating on it meant the loser of the race read a
  // just-rotated row as theft and revoked the family — signing the user out
  // *because* their client retried, which is exactly the case the grace window
  // exists to absorb. Verified: the concurrent-refresh test fails on the
  // `replacedBy` version and passes on this one.
  const age = Date.now() - (used.revokedAt?.getTime() ?? 0);
  if (used.revokedAt !== null && age <= REUSE_GRACE_MS) {
    // If a successor was recorded, it must still be live. A successor that has
    // itself been spent means the chain moved on and this really is a replay of
    // an old token, not a retry of the current one.
    if (used.replacedBy) {
      const replacement = await RefreshToken.findById(used.replacedBy).select("replacedBy revokedAt");
      if (replacement && (replacement.replacedBy || replacement.revokedAt)) {
        logger.warn({ familyId: String(used.familyId) }, "refresh token reuse — revoking family");
        await revokeFamily(used.familyId);
        return;
      }
    }
    logger.warn({ familyId: String(used.familyId) }, "refresh retried inside grace window");
    return;
  }

  logger.warn({ familyId: String(used.familyId) }, "refresh token reuse — revoking family");
  await revokeFamily(used.familyId);
}

export async function revokeFamily(familyId: Types.ObjectId | string): Promise<void> {
  await RefreshToken.updateMany(
    { familyId: String(familyId), revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

export async function revokeAllForSubject(subjectId: Types.ObjectId, portal: Portal): Promise<void> {
  await RefreshToken.updateMany(
    { subjectId, subjectType: portal, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

export async function endSession(
  res: Response,
  portal: Portal,
  presented: string | undefined,
): Promise<void> {
  if (presented) {
    const row = await RefreshToken.findOne({ tokenHash: hashRefreshToken(presented) }).select(
      "familyId",
    );
    if (row) await revokeFamily(row.familyId);
  }
  clearAuthCookies(res, portal);
}
