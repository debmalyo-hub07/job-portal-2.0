import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { describe, it, expect } from "vitest";
import { bridgeAuth, type BridgeScope } from "../../src/middleware/bridgeAuth.js";
import { User } from "../../src/models/user.model.js";
import { signedUpOn, installCaptureMailer } from "./helpers.js";
import cookieParser from "cookie-parser";
import { beforeEach } from "vitest";

beforeEach(installCaptureMailer);

async function probe(scope: BridgeScope, opts: { cookies?: string[]; legacyFallback?: boolean } = {}) {
  const app = express();
  app.use(cookieParser());
  app.get("/probe", bridgeAuth(scope, { legacyFallback: opts.legacyFallback }), (req, res) => {
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

  it("accepts the inherited token when the fallback is on", async () => {
    const user = await User.create({ fullname: "Old", email: "old@x.test", phoneNumber: 900,
      password: "x", role: "recruiter" });
    const token = jwt.sign({ userId: user._id }, process.env.JWT_ACCESS_SECRET!);
    const res = await probe("recruiter", { cookies: [`token=${token}`], legacyFallback: true });
    expect(res.status).toBe(200);
    expect(res.body.auth).toMatchObject({ portal: "recruiter", emailVerified: false });
  });

  it("rejects the inherited token when the fallback is off", async () => {
    const user = await User.create({ fullname: "Old2", email: "old2@x.test", phoneNumber: 900,
      password: "x", role: "recruiter" });
    const token = jwt.sign({ userId: user._id }, process.env.JWT_ACCESS_SECRET!);
    const res = await probe("recruiter", { cookies: [`token=${token}`], legacyFallback: false });
    expect(res.status).toBe(401);
  });

  it("derives the portal from the legacy role, not from the scope", async () => {
    const student = await User.create({ fullname: "Student", email: "student@x.test", phoneNumber: 123,
      password: "x", role: "student" });
    const studentToken = jwt.sign({ userId: student._id }, process.env.JWT_ACCESS_SECRET!);
    const res = await probe("recruiter", { cookies: [`token=${studentToken}`], legacyFallback: true });
    expect(res.status).toBe(401);
  });

  it("prefers a new session over a legacy cookie present at the same time", async () => {
    const seeker = await signedUpOn("seeker", "both@x.test");
    const user = await User.create({ fullname: "Old3", email: "old3@x.test", phoneNumber: 900,
      password: "x", role: "student" });
    const otherUsersLegacyToken = jwt.sign({ userId: user._id }, process.env.JWT_ACCESS_SECRET!);
    const res = await probe("any", {
      cookies: [`jp_seeker_at=${seeker.access}`, `token=${otherUsersLegacyToken}`],
      legacyFallback: true,
    });
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
