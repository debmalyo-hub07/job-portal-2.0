import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { AppError } from "../../src/lib/AppError.js";
import { accessCookieName, refreshCookieName, csrfCookieName } from "../../src/lib/cookies.js";
import { accessTokenKey, hashRefreshToken } from "../../src/lib/keys.js";
import { RefreshToken } from "../../src/models/refreshToken.model.js";
import {
  endSession,
  issueSession,
  revokeAllForSubject,
  rotateSession,
  verifyAccessToken,
} from "../../src/services/session.service.js";

/**
 * Mirrors REUSE_GRACE_MS in session.service.ts, which is module-private. Kept as
 * a literal rather than exported: the service's window is an implementation
 * detail, and a test that imported it would still pass if the value drifted to
 * something absurd. This way a change to the service has to be a deliberate
 * change here too.
 */
const GRACE_MS = 5_000;

/** First value of a named cookie across the response's Set-Cookie headers. */
function cookieValue(res: request.Response, name: string): string {
  const headers = res.headers["set-cookie"] as unknown as string[] | undefined;
  const match = (headers ?? []).find((h) => h.startsWith(`${name}=`));
  if (!match) throw new Error(`cookie ${name} not set`);
  // `?? match` rather than `!`: noUncheckedIndexedAccess makes `[0]` possibly
  // undefined, and a split on a non-empty string always yields at least one
  // element, so the fallback is unreachable rather than a real branch.
  const pair = match.split(";")[0] ?? match;
  return decodeURIComponent(pair.slice(name.length + 1));
}

function harness(): Express {
  const app = express();
  app.use(cookieParser());

  app.post("/issue/:portal", (req, res, next) => {
    const portal = req.params.portal as "seeker" | "recruiter";
    issueSession(res, req, new Types.ObjectId(String(req.query.sub)), portal)
      .then(() => res.json({ ok: true }))
      .catch(next);
  });

  // Deliberately portal-agnostic: this route never names a portal, so the only
  // way the response can carry one is if rotateSession read it off the row.
  app.post("/rotate", (req, res, next) => {
    rotateSession(res, req, String(req.query.token))
      .then((out) => res.json({ portal: out.portal, subjectId: String(out.subjectId) }))
      .catch(next);
  });

  app.post("/logout/:portal", (req, res, next) => {
    const portal = req.params.portal as "seeker" | "recruiter";
    endSession(res, portal, req.query.token ? String(req.query.token) : undefined)
      .then(() => res.json({ ok: true }))
      .catch(next);
  });

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = err instanceof AppError ? err.statusCode : 500;
    const code = err instanceof AppError ? err.code : "INTERNAL";
    res.status(status).json({ code });
  });

  return app;
}

interface Session {
  refresh: string;
  access: string;
  csrf: string;
  subjectId: Types.ObjectId;
}

async function issue(app: Express, portal: "seeker" | "recruiter"): Promise<Session> {
  const subjectId = new Types.ObjectId();
  const res = await request(app).post(`/issue/${portal}`).query({ sub: String(subjectId) });
  expect(res.status).toBe(200);
  return {
    refresh: cookieValue(res, refreshCookieName(portal)),
    access: cookieValue(res, accessCookieName(portal)),
    csrf: cookieValue(res, csrfCookieName(portal)),
    subjectId,
  };
}

async function rotate(app: Express, token: string): Promise<request.Response> {
  return request(app).post("/rotate").query({ token });
}

describe("session issuance", () => {
  it("stores only a hash of the refresh token", async () => {
    const app = harness();
    const session = await issue(app, "seeker");

    const row = await RefreshToken.findOne({ subjectId: session.subjectId });
    expect(row?.tokenHash).toBe(hashRefreshToken(session.refresh));
    // The raw token must never be at rest: a database dump alone must not be
    // replayable.
    expect(row?.tokenHash).not.toBe(session.refresh);
    expect(await RefreshToken.countDocuments({ tokenHash: session.refresh })).toBe(0);
  });

  it("issues an access token, a refresh token and a readable CSRF token", async () => {
    const app = harness();
    const session = await issue(app, "seeker");

    // The access token verifies under its own portal and carries the subject.
    const claims = verifyAccessToken(session.access, "seeker");
    expect(claims.sub).toBe(String(session.subjectId));
    expect(claims.type).toBe("seeker");
    // CSRF is deliberately readable — the client has to echo it in a header.
    expect(session.csrf).toContain(".");
  });

  it("keeps the two portals in separate cookies", async () => {
    const app = harness();
    const seeker = await issue(app, "seeker");
    const recruiter = await issue(app, "recruiter");

    // Distinct names are what stop the second sign-in from evicting the
    // first. (The comment this replaces cited ADR-0001's "one person may hold
    // both"; that dual-account rule ended 2026-08-27, but the separation it
    // justified is about the portal boundary, not two accounts — a browser
    // still holds one session per portal on separate addresses.)
    expect(refreshCookieName("seeker")).not.toBe(refreshCookieName("recruiter"));
    expect(csrfCookieName("seeker")).not.toBe(csrfCookieName("recruiter"));
    expect(seeker.refresh).not.toBe(recruiter.refresh);
    expect(seeker.csrf).not.toBe(recruiter.csrf);
  });
});

describe("rotation", () => {
  it("derives the portal from the stored row, not the caller", async () => {
    const app = harness();
    const session = await issue(app, "seeker");

    const rotated = await rotate(app, session.refresh);

    // The /rotate route knows nothing about portals. It must still come back
    // seeker — this is the regression test for the escalation where a seeker's
    // refresh cookie presented at the recruiter mount minted a recruiter session.
    expect(rotated.status).toBe(200);
    expect(rotated.body.portal).toBe("seeker");
    expect(rotated.body.subjectId).toBe(String(session.subjectId));
  });

  it("invalidates the presented token and issues a new one", async () => {
    const app = harness();
    const session = await issue(app, "seeker");

    const rotated = await rotate(app, session.refresh);
    const next = cookieValue(rotated, refreshCookieName("seeker"));
    expect(next).not.toBe(session.refresh);

    // The old token is spent.
    const old = await RefreshToken.findOne({ tokenHash: hashRefreshToken(session.refresh) });
    expect(old?.revokedAt).not.toBeNull();
    // And the new one is live, in the same family.
    const fresh = await RefreshToken.findOne({ tokenHash: hashRefreshToken(next) });
    expect(fresh?.revokedAt).toBeNull();
    expect(String(fresh?.familyId)).toBe(String(old?.familyId));
  });

  it("forgives a replay inside the grace window without killing the family", async () => {
    // A dropped response or a double-fired request on a mobile network. The
    // user must stay signed in.
    const app = harness();
    const session = await issue(app, "seeker");
    const rotated = await rotate(app, session.refresh);
    const live = cookieValue(rotated, refreshCookieName("seeker"));

    const replay = await rotate(app, session.refresh);
    expect(replay.status).toBe(401);

    // The family survives, and the legitimate token still works.
    const stillGood = await rotate(app, live);
    expect(stillGood.status).toBe(200);
  });

  it("survives two CONCURRENT refreshes of the same token", async () => {
    // The sequential double-fire can never exercise the ordering race in
    // rotateSession: by the time the replay's handleMiss runs, the first call
    // has finished and replacedBy is set. Only a genuinely concurrent pair can.
    // The family must survive — a retried request on a flaky network is not
    // theft, and the grace window exists precisely so it stays signed in.
    const app = harness();
    const session = await issue(app, "seeker");

    const [a, b] = await Promise.all([
      rotate(app, session.refresh),
      rotate(app, session.refresh),
    ]);

    // Both were attempts to refresh the SAME token. The design allows exactly
    // one to succeed; the other fails inside the grace window without revoking.
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 401]);

    // The family is alive: whichever token won is still usable.
    const winner = [a, b].find((r) => r.status === 200);
    const winnerRefresh = cookieValue(winner!, refreshCookieName("seeker"));
    const rotated = await rotate(app, winnerRefresh);
    expect(rotated.status).toBe(200);

    // And the LOSING request did not burn the family — if it had, the win above
    // would 401 too, since revocation kills every row in the family.
  });

  it("revokes the whole family when a rotated token is replayed after the grace window", async () => {
    const app = harness();
    const session = await issue(app, "seeker");
    const rotated = await rotate(app, session.refresh);
    const live = cookieValue(rotated, refreshCookieName("seeker"));

    // Push the replaced row's revokedAt outside the grace window so the replay
    // reads as theft rather than as a retried request.
    const original = await RefreshToken.findOne({ tokenHash: hashRefreshToken(session.refresh) });
    await RefreshToken.updateOne(
      { _id: original?._id },
      { $set: { revokedAt: new Date(Date.now() - GRACE_MS - 1_000) } },
    );

    const replay = await rotate(app, session.refresh);
    expect(replay.status).toBe(401);

    // Not just the replayed row — every row in the family, including the
    // legitimate token the real user is still holding.
    const family = await RefreshToken.find({ familyId: String(original?.familyId) });
    expect(family.length).toBeGreaterThanOrEqual(2);
    expect(family.every((row) => row.revokedAt !== null)).toBe(true);

    // And the good token is genuinely dead, not merely marked.
    const afterKill = await rotate(app, live);
    expect(afterKill.status).toBe(401);
  });

  it("rejects an unknown token without touching anything", async () => {
    const app = harness();
    const session = await issue(app, "seeker");

    const res = await rotate(app, "a-token-that-was-never-issued");
    expect(res.status).toBe(401);

    // A stranger's garbage must not revoke a real user's session.
    const row = await RefreshToken.findOne({ tokenHash: hashRefreshToken(session.refresh) });
    expect(row?.revokedAt).toBeNull();
  });

  it("rejects an expired token", async () => {
    const app = harness();
    const session = await issue(app, "seeker");
    await RefreshToken.updateOne(
      { tokenHash: hashRefreshToken(session.refresh) },
      { $set: { expiresAt: new Date(Date.now() - 1_000) } },
    );

    expect((await rotate(app, session.refresh)).status).toBe(401);
  });
});

describe("revocation", () => {
  it("endSession kills the family and clears cookies with matching attributes", async () => {
    const app = harness();
    const session = await issue(app, "seeker");

    const res = await request(app).post("/logout/seeker").query({ token: session.refresh });
    expect(res.status).toBe(200);

    const row = await RefreshToken.findOne({ tokenHash: hashRefreshToken(session.refresh) });
    expect(row?.revokedAt).not.toBeNull();

    // The inherited logout cleared without path/secure/sameSite, so a cookie
    // whose attributes did not match was never overwritten and the session
    // survived logout in production.
    const cleared = (res.headers["set-cookie"] as unknown as string[]).find((h) =>
      h.startsWith(`${refreshCookieName("seeker")}=`),
    );
    expect(cleared).toContain("Path=/");

    // The token is dead for rotation too, not merely uncookied.
    expect((await rotate(app, session.refresh)).status).toBe(401);
  });

  it("revokeAllForSubject ends every session for one portal only", async () => {
    const app = harness();
    const subjectId = new Types.ObjectId();

    // Same subject id on both portals — the shared-_id case the migration
    // creates, so scoping by subjectType is what keeps them independent.
    const a = await request(app).post("/issue/seeker").query({ sub: String(subjectId) });
    const b = await request(app).post("/issue/recruiter").query({ sub: String(subjectId) });
    const seekerToken = cookieValue(a, refreshCookieName("seeker"));
    const recruiterToken = cookieValue(b, refreshCookieName("recruiter"));

    await revokeAllForSubject(subjectId, "seeker");

    expect((await rotate(app, seekerToken)).status).toBe(401);
    expect((await rotate(app, recruiterToken)).status).toBe(200);
  });
});

describe("access token verification", () => {
  it("rejects a seeker token against the recruiter portal on signature, not on a claim", () => {
    // Signed with the real seeker key and a DELIBERATELY LYING claim: the token
    // says type=recruiter, so if verification used a shared key and only the
    // claim check, this would pass. Only the per-portal signature can reject it.
    const forged = jwt.sign(
      { sub: String(new Types.ObjectId()), type: "recruiter" },
      accessTokenKey("seeker"),
      { expiresIn: "5m" },
    );

    let thrown: unknown;
    try {
      verifyAccessToken(forged, "recruiter");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).code).toBe("SESSION_INVALID");

    // Sanity: an honestly-minted seeker token does verify on its own portal.
    const honest = jwt.sign(
      { sub: String(new Types.ObjectId()), type: "seeker" },
      accessTokenKey("seeker"),
      { expiresIn: "5m" },
    );
    expect(verifyAccessToken(honest, "seeker").type).toBe("seeker");
  });

  it("rejects an expired access token", () => {
    const expired = jwt.sign(
      { sub: String(new Types.ObjectId()), type: "seeker" },
      accessTokenKey("seeker"),
      { expiresIn: "-1s" },
    );
    expect(() => verifyAccessToken(expired, "seeker")).toThrow(AppError);
  });
});
