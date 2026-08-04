import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import request from "supertest";
import { describe, expect, it, beforeEach } from "vitest";

import { AppError } from "../../src/lib/AppError.js";
import { accessCookieName } from "../../src/lib/cookies.js";
import { accessTokenKey } from "../../src/lib/keys.js";
import { Recruiter } from "../../src/models/recruiter.model.js";
import { Seeker } from "../../src/models/seeker.model.js";
import { authenticate, requireVerified, authenticateAny, optionalAuthenticate } from "../../src/middleware/authenticate.js";
import { errorHandler } from "../../src/middleware/error.js";
import { signedUpOn, installCaptureMailer } from "./helpers.js";

beforeEach(installCaptureMailer);

/**
 * `authenticate` is the gate every authenticated route sits behind, so its
 * failure modes matter more than its happy path. Each test here corresponds to a
 * way a token can be valid-looking and still must not grant access.
 */
function harness(): Express {
  const app = express();
  app.use(cookieParser());

  for (const portal of ["seeker", "recruiter"] as const) {
    app.get(`/${portal}/me`, authenticate(portal), (req, res) => {
      res.json({ auth: req.auth });
    });
    app.get(`/${portal}/verified`, authenticate(portal), requireVerified, (req, res) => {
      res.json({ auth: req.auth });
    });
  }

  app.use((err: unknown, _q: express.Request, res: express.Response, _n: express.NextFunction) => {
    const status = err instanceof AppError ? err.statusCode : 500;
    const code = err instanceof AppError ? err.code : "INTERNAL";
    res.status(status).json({ code });
  });
  return app;
}

/** A token minted the honest way, for a real account. */
function tokenFor(id: Types.ObjectId, portal: "seeker" | "recruiter", extra: object = {}): string {
  return jwt.sign({ sub: String(id), type: portal, ...extra }, accessTokenKey(portal), {
    expiresIn: "15m",
  });
}

describe("authenticate", () => {
  it("populates req.auth for a live, verified account", async () => {
    const seeker = await Seeker.create({
      email: "auth@x.test",
      fullName: "Auth Person",
      emailVerifiedAt: new Date(),
    });

    const res = await request(harness())
      .get("/seeker/me")
      .set("Cookie", [`${accessCookieName("seeker")}=${tokenFor(seeker._id, "seeker")}`]);

    expect(res.status).toBe(200);
    expect(res.body.auth).toEqual({
      id: String(seeker._id),
      portal: "seeker",
      emailVerified: true,
    });
  });

  it("401s with SESSION_MISSING when no cookie is present", async () => {
    const res = await request(harness()).get("/seeker/me");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("SESSION_MISSING");
  });

  it("401s a seeker token presented at the recruiter mount", async () => {
    // The portal boundary. The token is honestly minted and unexpired — it is
    // simply signed with the wrong portal's derived key, so it fails signature
    // verification rather than a claim comparison.
    const seeker = await Seeker.create({
      email: "cross@x.test",
      fullName: "Cross Person",
      emailVerifiedAt: new Date(),
    });

    const res = await request(harness())
      .get("/recruiter/me")
      // Deliberately under the RECRUITER cookie name, so the cookie is found and
      // the failure is genuinely cryptographic rather than a missing cookie.
      .set("Cookie", [`${accessCookieName("recruiter")}=${tokenFor(seeker._id, "seeker")}`]);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("SESSION_INVALID");
  });

  it("401s a token whose subject no longer exists", async () => {
    // Account deleted between minting and use — e.g. swept by the Task 12
    // unverified-account sweeper while the tab was open.
    const res = await request(harness())
      .get("/seeker/me")
      .set("Cookie", [
        `${accessCookieName("seeker")}=${tokenFor(new Types.ObjectId(), "seeker")}`,
      ]);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("SESSION_INVALID");
  });

  it("401s a suspended account with the same code as a bad token", async () => {
    // Uniform code on purpose: a suspended user learning they are suspended from
    // a distinct 403 on every route is worse than "sign in again".
    const seeker = await Seeker.create({
      email: "suspended@x.test",
      fullName: "Suspended Person",
      emailVerifiedAt: new Date(),
      status: "suspended",
    });

    const res = await request(harness())
      .get("/seeker/me")
      .set("Cookie", [`${accessCookieName("seeker")}=${tokenFor(seeker._id, "seeker")}`]);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("SESSION_INVALID");
  });

  it("401s a token minted before sessionsInvalidatedAt", async () => {
    // Access-token revocation. Revoking refresh families ends a session's ability
    // to CONTINUE, but does nothing about the access token already in an
    // attacker's hands — this is what closes that window on a password reset.
    const seeker = await Seeker.create({
      email: "culled@x.test",
      fullName: "Culled Person",
      emailVerifiedAt: new Date(),
    });
    const stale = tokenFor(seeker._id, "seeker");

    // Invalidate everything issued up to 10 seconds from now, so the token above
    // is unambiguously older than the cutoff.
    await Seeker.updateOne(
      { _id: seeker._id },
      { $set: { sessionsInvalidatedAt: new Date(Date.now() + 10_000) } },
    );

    const res = await request(harness())
      .get("/seeker/me")
      .set("Cookie", [`${accessCookieName("seeker")}=${stale}`]);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("SESSION_INVALID");
  });

  it("does NOT reject a token minted in the same second as the cull", async () => {
    // The deliberate 1-second overlap. Without the floor-and-strict-< comparison,
    // a password reset at 10:00:00.500 that issues its replacement session at
    // 10:00:00.700 would instantly invalidate the session it just handed out —
    // and signing in again would reproduce it.
    const seeker = await Seeker.create({
      email: "sameSecond@x.test",
      fullName: "Same Second",
      emailVerifiedAt: new Date(),
    });
    const token = tokenFor(seeker._id, "seeker");
    const iat = (jwt.decode(token) as { iat: number }).iat;

    // Cull timestamp inside the very second the token was issued.
    await Seeker.updateOne(
      { _id: seeker._id },
      { $set: { sessionsInvalidatedAt: new Date(iat * 1000 + 500) } },
    );

    const res = await request(harness())
      .get("/seeker/me")
      .set("Cookie", [`${accessCookieName("seeker")}=${token}`]);

    expect(res.status).toBe(200);
  });

  it("keeps the two portals independent for one shared subject id", async () => {
    // The migration gives a person the SAME _id on both collections, so a token
    // for one must not authenticate against the other even with a valid subject.
    const id = new Types.ObjectId();
    await Seeker.create({
      _id: id,
      email: "dual@x.test",
      fullName: "Dual Seeker",
      emailVerifiedAt: new Date(),
    });
    await Recruiter.create({
      _id: id,
      email: "dual@x.test",
      fullName: "Dual Recruiter",
      emailVerifiedAt: new Date(),
    });

    const app = harness();
    const asSeeker = await request(app)
      .get("/seeker/me")
      .set("Cookie", [`${accessCookieName("seeker")}=${tokenFor(id, "seeker")}`]);
    const asRecruiter = await request(app)
      .get("/recruiter/me")
      .set("Cookie", [`${accessCookieName("recruiter")}=${tokenFor(id, "recruiter")}`]);

    expect(asSeeker.body.auth.portal).toBe("seeker");
    expect(asRecruiter.body.auth.portal).toBe("recruiter");
  });
});

describe("requireVerified", () => {
  it("lets a verified account through", async () => {
    const seeker = await Seeker.create({
      email: "ok@x.test",
      fullName: "Verified Person",
      emailVerifiedAt: new Date(),
    });
    const res = await request(harness())
      .get("/seeker/verified")
      .set("Cookie", [`${accessCookieName("seeker")}=${tokenFor(seeker._id, "seeker")}`]);
    expect(res.status).toBe(200);
  });

  it("403s an unverified account with EMAIL_NOT_VERIFIED", async () => {
    // Distinct from the 401s above on purpose: this one IS actionable by the
    // user, and the client routes them to the verify page on this code.
    const seeker = await Seeker.create({
      email: "unverified@x.test",
      fullName: "Unverified Person",
    });
    const res = await request(harness())
      .get("/seeker/verified")
      .set("Cookie", [`${accessCookieName("seeker")}=${tokenFor(seeker._id, "seeker")}`]);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("EMAIL_NOT_VERIFIED");
  });

  it("still authenticates an unverified account on routes that do not require verification", async () => {
    // An unverified user has to be able to reach the endpoint that lets them
    // become verified, so authenticate() alone must not block them.
    const seeker = await Seeker.create({
      email: "pending@x.test",
      fullName: "Pending Person",
    });
    const res = await request(harness())
      .get("/seeker/me")
      .set("Cookie", [`${accessCookieName("seeker")}=${tokenFor(seeker._id, "seeker")}`]);

    expect(res.status).toBe(200);
    expect(res.body.auth.emailVerified).toBe(false);
  });
});

function anyApp(): Express {
  const app = express();
  app.use(cookieParser());
  app.get("/any", authenticateAny(), (req, res) =>
    // `id` is returned so the assertions below can prove the legacy field is
    // gone, not merely unused.
    res.json({ auth: req.auth, id: (req as { id?: string }).id ?? null }),
  );
  app.get("/opt", optionalAuthenticate(), (req, res) => res.json({ auth: req.auth ?? null }));
  app.use(errorHandler);
  return app;
}

describe("authenticateAny / optionalAuthenticate", () => {
  it("resolves a seeker session and sets no req.id", async () => {
    const { access, id } = await signedUpOn("seeker", "any-seeker@example.com");
    const res = await request(anyApp())
      .get("/any")
      .set("Cookie", [`${accessCookieName("seeker")}=${access}`]);
    expect(res.status).toBe(200);
    expect(res.body.auth).toMatchObject({ id, portal: "seeker", emailVerified: true });
    expect(res.body.id).toBeNull();
  });

  it("401s with no cookie on authenticateAny", async () => {
    const res = await request(anyApp()).get("/any");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("SESSION_MISSING");
  });

  it("optionalAuthenticate passes anonymous through as null", async () => {
    const res = await request(anyApp()).get("/opt");
    expect(res.status).toBe(200);
    expect(res.body.auth).toBeNull();
  });

  it("optionalAuthenticate resolves a real session when one is present", async () => {
    const { access, id } = await signedUpOn("recruiter", "opt-real@example.com");
    const res = await request(anyApp())
      .get("/opt")
      .set("Cookie", [`${accessCookieName("recruiter")}=${access}`]);
    expect(res.body.auth).toMatchObject({ id, portal: "recruiter" });
  });

  it("prefers seeker when both cookies are present (fixed order)", async () => {
    const s = await signedUpOn("seeker", "both-s@example.com");
    const r = await signedUpOn("recruiter", "both-r@example.com");
    const res = await request(anyApp())
      .get("/any")
      .set("Cookie", [
        `${accessCookieName("seeker")}=${s.access}`,
        `${accessCookieName("recruiter")}=${r.access}`,
      ]);
    expect(res.status).toBe(200);
    expect(res.body.auth.id).toBe(s.id);
    expect(res.body.auth.portal).toBe("seeker");
  });

  // Carried over from bridge.test.ts, which tested the deleted bridgeAuth. The
  // behaviours themselves still matter; only the middleware under them changed.
  it("falls through a stale cookie for one portal to the valid other one", async () => {
    const recruiter = await signedUpOn("recruiter", "mixed@example.com");
    const res = await request(anyApp())
      .get("/any")
      .set("Cookie", [
        `${accessCookieName("seeker")}=not-a-token`,
        `${accessCookieName("recruiter")}=${recruiter.access}`,
      ]);
    expect(res.status).toBe(200);
    expect(res.body.auth.portal).toBe("recruiter");
  });

  it("rejects the inherited token cookie outright", async () => {
    // Signed with the real access secret, so it would have been accepted while
    // the legacy fallback existed. No code path reads it now: a browser still
    // holding one is signed out rather than half-authenticated.
    const token = jwt.sign({ userId: "68b0f0000000000000000001" }, process.env.JWT_ACCESS_SECRET!);
    const res = await request(anyApp()).get("/any").set("Cookie", [`token=${token}`]);
    expect(res.status).toBe(401);
  });

  it("ignores a legacy cookie sitting alongside a valid session", async () => {
    const seeker = await signedUpOn("seeker", "both-legacy@example.com");
    const othersLegacyToken = jwt.sign(
      { userId: "68b0f0000000000000000002" },
      process.env.JWT_ACCESS_SECRET!,
    );
    const res = await request(anyApp())
      .get("/any")
      .set("Cookie", [
        `${accessCookieName("seeker")}=${seeker.access}`,
        `token=${othersLegacyToken}`,
      ]);
    expect(res.status).toBe(200);
    expect(res.body.auth.id).toBe(seeker.id);
  });
});
