import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";

const app = buildApp();

describe("admin auth router", () => {
  it("has no registration route", async () => {
    await request(app)
      .post("/api/v1/admin/auth/register")
      .send({ fullName: "X", email: "x@example.com", password: "correct horse battery staple" })
      .expect(404);
  });

  it("has no google routes", async () => {
    await request(app).get("/api/v1/admin/auth/google").expect(404);
    await request(app).get("/api/v1/admin/auth/google/callback").expect(404);
    await request(app).post("/api/v1/admin/auth/google/start").expect(404);
    await request(app).post("/api/v1/admin/auth/google/confirm-link").send({ token: "x" }).expect(404);
    // The handoff exchange is a session-issuing endpoint with no CSRF token and
    // no password, so it is the one Google route whose accidental mounting on
    // the admin portal would matter most.
    await request(app).post("/api/v1/admin/auth/google/exchange").send({ code: "x" }).expect(404);
  });

  it("does expose login", async () => {
    // 401 not 404: the route exists and rejects the credentials.
    await request(app)
      .post("/api/v1/admin/auth/login")
      .send({ email: "nobody@example.com", password: "correct horse battery staple" })
      .expect(401);
  });

  it("does expose /me, unauthenticated", async () => {
    await request(app).get("/api/v1/admin/auth/me").expect(401);
  });
});
