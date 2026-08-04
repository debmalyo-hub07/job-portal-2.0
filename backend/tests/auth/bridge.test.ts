import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { describe, it, expect } from "vitest";
import { bridgeAuth, type BridgeScope } from "../../src/middleware/bridgeAuth.js";
import { signedUpOn, installCaptureMailer } from "./helpers.js";
import cookieParser from "cookie-parser";
import { beforeEach } from "vitest";

beforeEach(installCaptureMailer);

async function probe(scope: BridgeScope, opts: { cookies?: string[] } = {}) {
  const app = express();
  app.use(cookieParser());
  app.get("/probe", bridgeAuth(scope), (req, res) => {
    res.json({ id: req.id, auth: req.auth });
  });

  const req = request(app).get("/probe");
  if (opts.cookies) {
    req.set("Cookie", opts.cookies);
  }
  return req;
}

describe("bridgeAuth", () => {
  it("populates req.id from a new portal session", async () => {
    const seeker = await signedUpOn("seeker", "bridge@x.test");
    const res = await probe("any", { cookies: [`jp_seeker_at=${seeker.access}`] });
    expect(res.status).toBe(200);
    expect(res.body.auth).toMatchObject({ portal: "seeker", emailVerified: true });
    expect(res.body.id).toBe(res.body.auth.id);
  });

  it("401s a seeker session on a recruiter-scoped route", async () => {
    const seeker = await signedUpOn("seeker", "scope@x.test");
    const res = await probe("recruiter", { cookies: [`jp_seeker_at=${seeker.access}`] });
    expect(res.status).toBe(401);
  });

  it("rejects the inherited token cookie outright", async () => {
    // The point of the legacy teardown. This token is signed with the real
    // access secret and would have been accepted while LEGACY_AUTH_FALLBACK
    // existed; there is no longer any code path that reads it, so a browser
    // still holding one is signed out rather than half-authenticated.
    const token = jwt.sign({ userId: "68b0f0000000000000000001" }, process.env.JWT_ACCESS_SECRET!);
    const res = await probe("any", { cookies: [`token=${token}`] });
    expect(res.status).toBe(401);
  });

  it("ignores a legacy cookie sitting alongside a valid session", async () => {
    const seeker = await signedUpOn("seeker", "both@x.test");
    const otherUsersLegacyToken = jwt.sign(
      { userId: "68b0f0000000000000000002" },
      process.env.JWT_ACCESS_SECRET!,
    );
    const res = await probe("any", {
      cookies: [`jp_seeker_at=${seeker.access}`, `token=${otherUsersLegacyToken}`],
    });
    expect(res.status).toBe(200);
    expect(res.body.auth.id).toBe(seeker.id);
  });

  it("falls through a stale cookie for one portal to the valid other one", async () => {
    const recruiter = await signedUpOn("recruiter", "mixed@x.test");
    const res = await probe("any", {
      cookies: [`jp_seeker_at=not-a-token`, `jp_recruiter_at=${recruiter.access}`],
    });
    expect(res.status).toBe(200);
    expect(res.body.auth.portal).toBe("recruiter");
  });
});
