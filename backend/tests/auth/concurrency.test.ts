import { describe, expect, it } from "vitest";
import request from "supertest";
import { Types } from "mongoose";
import express, { Express } from "express";
import cookieParser from "cookie-parser";
import { cookieValue, lastCodeFor, installCaptureMailer } from "./helpers.js";
import { RefreshToken } from "../../src/models/refreshToken.model.js";
import { Seeker } from "../../src/models/seeker.model.js";
import { AppError } from "../../src/lib/AppError.js";
import { issueSession, rotateSession } from "../../src/services/session.service.js";
import { verifyEmail, register } from "../../src/services/auth.service.js";

function harness(): Express {
  const app = express();
  app.use(cookieParser());

  app.post("/issue/:portal", (req, res, next) => {
    const portal = req.params.portal as "seeker" | "recruiter";
    issueSession(res, req, new Types.ObjectId(String(req.query.sub)), portal)
      .then(() => res.json({ ok: true }))
      .catch(next);
  });

  app.post("/rotate", (req, res, next) => {
    rotateSession(res, req, String(req.query.token))
      .then((out) => res.json({ portal: out.portal, subjectId: String(out.subjectId) }))
      .catch(next);
  });

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = err instanceof AppError ? err.statusCode : 500;
    const code = err instanceof AppError ? err.code : "INTERNAL";
    res.status(status).json({ code });
  });

  return app;
}

describe("concurrent refresh rotation", () => {
  it("lets exactly one of two simultaneous rotations win", async () => {
    const app = harness();
    const sub = new Types.ObjectId();
    const res = await request(app).post("/issue/seeker").query({ sub: String(sub) });
    const raw = cookieValue(res, "jp_seeker_rt")!;

    const outcomes = await Promise.allSettled([
      request(app).post("/rotate").query({ token: raw }).then((r) => r.status),
      request(app).post("/rotate").query({ token: raw }).then((r) => r.status),
    ]);
    const statuses = outcomes.map((o) => (o.status === "fulfilled" ? o.value : 500)).sort();
    expect(statuses).toEqual([200, 401]);
    // One live replacement, not two, in the family.
    expect(await RefreshToken.countDocuments({ subjectId: sub, revokedAt: null })).toBe(1);
  });

  it("does NOT revoke the family for a retry inside the grace window", async () => {
    const app = harness();
    const sub = new Types.ObjectId();
    const res = await request(app).post("/issue/seeker").query({ sub: String(sub) });
    const raw = cookieValue(res, "jp_seeker_rt")!;

    await request(app).post("/rotate").query({ token: raw });
    
    // rotate once, replay the original immediately: refused, family intact.
    const replay = await request(app).post("/rotate").query({ token: raw });
    expect(replay.status).toBe(401);
    expect(await RefreshToken.countDocuments({ subjectId: sub, revokedAt: null })).toBe(1);
  });

  it("revokes the whole family for a replay AFTER the grace window", async () => {
    const app = harness();
    const sub = new Types.ObjectId();
    const res = await request(app).post("/issue/seeker").query({ sub: String(sub) });
    const raw = cookieValue(res, "jp_seeker_rt")!;

    await request(app).post("/rotate").query({ token: raw });

    // backdate the rotation past REUSE_GRACE_MS:
    await RefreshToken.updateMany({ subjectId: sub }, [{ $set: { revokedAt: { $cond: [{ $ne: ["$revokedAt", null] }, new Date(Date.now() - 10_000), "$revokedAt"] } } }]);
    const replay = await request(app).post("/rotate").query({ token: raw });
    expect(replay.status).toBe(401);
    expect(await RefreshToken.countDocuments({ subjectId: sub, revokedAt: null })).toBe(0);  // theft response
  });
});

describe("concurrent redemption", () => {
  it("honours the same correct code at most once across parallel redeemers", async () => {
    // register via service, capture code via mailer seam, then:
    const email = "redeem-race@x.test";
    installCaptureMailer();
    await register("seeker", { fullName: "Race", email, password: "correct horse battery staple" });
    const code = await lastCodeFor(email);

    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, () => verifyEmail("seeker", email, code)),
    );
    expect(attempts.filter((a) => a.status === "fulfilled").length).toBe(1);
    expect(await Seeker.countDocuments({ email, emailVerifiedAt: { $ne: null } })).toBe(1);
  });

  it("keeps EMAIL_TAKEN race-safe: parallel registrations yield one account", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        register("seeker", { fullName: "Racer", email: "race@x.test", password: "correct horse battery staple" }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(1);
    // Losers got the translated conflict, not a raw duplicate-key 500.
    for (const r of results) {
      if (r.status === "rejected") expect((r.reason as AppError).code).toBe("EMAIL_TAKEN");
    }
    expect(await Seeker.countDocuments({ email: "race@x.test" })).toBe(1);
  });
});
