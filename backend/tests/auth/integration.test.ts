import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app.js";
import { cookieValue, installCaptureMailer, lastCodeFor } from "./helpers.js";

const app = buildApp();
beforeEach(installCaptureMailer);

describe("the whole journey, through the real app", () => {
  it("register → verify → me → refresh → logout, with CSRF enforced", async () => {
    const agent = request.agent(app);

    const reg = await agent.post("/api/v1/seeker/auth/register").send({
      fullName: "End ToEnd", email: "e2e@x.test", password: "correct horse battery staple",
    });
    expect(reg.status).toBe(201);

    const verify = await agent.post("/api/v1/seeker/auth/verify-email").send({
      email: "e2e@x.test", code: await lastCodeFor("e2e@x.test"),
    });
    expect(verify.status).toBe(200);
    const csrf = cookieValue(verify, "jp_csrf")!;

    expect((await agent.get("/api/v1/seeker/auth/me")).status).toBe(200);

    // Refresh WITHOUT the header is the cookie-only forgery — the exact
    // request a cross-site attacker can make the browser send.
    const forged = await agent.post("/api/v1/seeker/auth/refresh");
    expect(forged.status).toBe(403);
    expect(forged.body.code).toBe("CSRF_INVALID");

    const refreshed = await agent.post("/api/v1/seeker/auth/refresh").set("X-CSRF-Token", csrf);
    expect(refreshed.status).toBe(200);
    const csrf2 = cookieValue(refreshed, "jp_csrf")!;

    expect((await agent.get("/api/v1/seeker/auth/me")).status).toBe(200);

    const out = await agent.post("/api/v1/seeker/auth/logout").set("X-CSRF-Token", csrf2);
    expect(out.status).toBe(200);
    expect((await agent.get("/api/v1/seeker/auth/me")).status).toBe(401);
  });

  it("throttles login at 5 per window per IP+email and answers 429", async () => {
    for (let i = 0; i < 5; i += 1) {
      const res = await request(app).post("/api/v1/seeker/auth/login").send({
        email: "throttle@x.test", password: "wrong wrong wrong",
      });
      expect(res.status).toBe(401);
    }
    const sixth = await request(app).post("/api/v1/seeker/auth/login").send({
      email: "throttle@x.test", password: "wrong wrong wrong",
    });
    expect(sixth.status).toBe(429);
    expect(sixth.body.code).toBe("RATE_LIMITED");
    // A DIFFERENT email from the same IP is its own bucket.
    const other = await request(app).post("/api/v1/seeker/auth/login").send({
      email: "someone-else@x.test", password: "wrong wrong wrong",
    });
    expect(other.status).toBe(401);
  });

  it("throttles OTP requests at 3 per hour per email", async () => {
    await request(app).post("/api/v1/seeker/auth/register").send({
      fullName: "Limited", email: "limited@x.test", password: "correct horse battery staple",
    });
    for (let i = 0; i < 3; i += 1) {
      expect((await request(app).post("/api/v1/seeker/auth/resend-code").send({ email: "limited@x.test" })).status).toBe(200);
    }
    const fourth = await request(app).post("/api/v1/seeker/auth/resend-code").send({ email: "limited@x.test" });
    expect(fourth.status).toBe(429);
  });

  it("keeps the legacy /api/v1/user routes alive alongside the new mounts", async () => {
    // Not a 404: the legacy surface must survive until Task 15 so the
    // untouched frontend keeps working between now and Task 13.
    const res = await request(app).post("/api/v1/user/login").send({});
    expect(res.status).not.toBe(404);
  });
});
