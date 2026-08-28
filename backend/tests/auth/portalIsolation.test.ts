import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app.js";
import { installCaptureMailer, setCookieNames, signedUpOn } from "./helpers.js";
import { Seeker } from "../../src/models/seeker.model.js";
import { Recruiter } from "../../src/models/recruiter.model.js";

const app = buildApp();
beforeEach(installCaptureMailer);

describe("portal isolation", () => {
  it("refuses the same email on the second portal — one address, one account", async () => {
    // Inverted 2026-08-27: the registry makes email unique ACROSS portals.
    // The old assertion — one seeker row and one recruiter row per address —
    // asserted ADR-0001's original dual-account rule, which the registry
    // reverses. What still holds, and what the remaining tests pin, is that
    // the two portals stay cryptographically separate.
    await signedUpOn("seeker", "both@x.test");
    const res = await request(app).post("/api/v1/recruiter/auth/register").send({
      fullName: "Both Recruiter",
      email: "both@x.test",
      password: "correct horse battery staple",
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("EMAIL_TAKEN");
    expect(await Seeker.countDocuments({ email: "both@x.test" })).toBe(1);
    expect(await Recruiter.countDocuments({ email: "both@x.test" })).toBe(0);
  });

  it("rejects a seeker access token smuggled under the recruiter cookie name", async () => {
    const seeker = await signedUpOn("seeker", "wall@x.test");
    const res = await request(app)
      .get("/api/v1/recruiter/auth/me")
      .set("Cookie", [`jp_recruiter_at=${encodeURIComponent(seeker.access)}`]);
    expect(res.status).toBe(401);   // fails SIGNATURE verification, not a claim check
  });

  it("re-issues SEEKER cookies when a seeker refresh token hits the recruiter mount", async () => {
    const seeker = await signedUpOn("seeker", "mount@x.test");
    const res = await request(app)
      .post("/api/v1/recruiter/auth/refresh")
      .set("X-CSRF-Token", seeker.csrf)
      .set("Cookie", [
        `jp_recruiter_rt=${encodeURIComponent(seeker.refresh)}`,   // smuggled
        `jp_recruiter_csrf=${encodeURIComponent(seeker.csrf)}`,
      ]);
    // The stored row says seeker, so whatever comes back is seeker-scoped.
    // Escalation would look like a jp_recruiter_at Set-Cookie here.
    const names = setCookieNames(res);
    expect(names).not.toContain("jp_recruiter_at");
    expect(names).not.toContain("jp_recruiter_rt");
    if (res.status === 200) expect(names).toContain("jp_seeker_at");
  });

  it("keeps verification state scoped per portal", async () => {
    // The dual-portal email this used to lean on is gone, so the check rides
    // on two addresses now: a verified account on one portal has no bearing
    // on an UNVERIFIED account on the other, whose login must still answer
    // EMAIL_NOT_VERIFIED rather than a generic failure.
    await signedUpOn("seeker", "verified@x.test");         // verified on seeker
    await request(app).post("/api/v1/recruiter/auth/register").send({
      fullName: "Unverified", email: "unverified@x.test", password: "correct horse battery staple",
    });                                                    // unverified on recruiter
    const res = await request(app).post("/api/v1/recruiter/auth/login").send({
      email: "unverified@x.test", password: "correct horse battery staple",
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("EMAIL_NOT_VERIFIED");
  });
});
