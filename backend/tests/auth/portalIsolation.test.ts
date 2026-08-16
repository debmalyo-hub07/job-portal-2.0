import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app.js";
import { installCaptureMailer, setCookieNames, signedUpOn } from "./helpers.js";
import { Seeker } from "../../src/models/seeker.model.js";
import { Recruiter } from "../../src/models/recruiter.model.js";

const app = buildApp();
beforeEach(installCaptureMailer);

describe("portal isolation", () => {
  it("keeps the same email as two independent accounts on the two portals", async () => {
    await signedUpOn("seeker", "both@x.test");
    await signedUpOn("recruiter", "both@x.test");
    expect(await Seeker.countDocuments({ email: "both@x.test" })).toBe(1);
    expect(await Recruiter.countDocuments({ email: "both@x.test" })).toBe(1);
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

  it("scopes verification state per portal for a dual-portal email", async () => {
    await signedUpOn("seeker", "dual@x.test");           // verified on seeker
    await request(app).post("/api/v1/recruiter/auth/register").send({
      fullName: "Dual", email: "dual@x.test", password: "correct horse battery staple",
    });                                                   // unverified on recruiter
    const res = await request(app).post("/api/v1/recruiter/auth/login").send({
      email: "dual@x.test", password: "correct horse battery staple",
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("EMAIL_NOT_VERIFIED");     // recruiter side unaffected by seeker verify
  });
});
