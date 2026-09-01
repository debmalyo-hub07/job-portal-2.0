import request from "supertest";
import type { Test as SupertestRequest } from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { Admin } from "../src/models/admin.model.js";
import { FeatureFlag } from "../src/models/featureFlag.model.js";
import { cookieValue, installCaptureMailer, lastCodeFor } from "./auth/helpers.js";

const app = buildApp();
const PASSWORD = "correct horse battery staple";

async function signedInAdmin(email: string): Promise<{ access: string; csrf: string }> {
  await Admin.create({
    email,
    fullName: "Root Admin",
    passwordHash: null,
    emailVerifiedAt: new Date(),
    status: "active",
  });
  await request(app).post("/api/v1/admin/auth/forgot-password").send({ email });
  const code = await lastCodeFor(email);
  await request(app)
    .post("/api/v1/admin/auth/reset-password")
    .send({ email, code, newPassword: PASSWORD });
  const login = await request(app)
    .post("/api/v1/admin/auth/login")
    .send({ email, password: PASSWORD });
  return {
    access: cookieValue(login, "jp_admin_at")!,
    csrf: cookieValue(login, "jp_admin_csrf")!,
  };
}

const asAdmin = (session: { access: string; csrf: string }) => (test: SupertestRequest): void => {
  test.set("Cookie", [`jp_admin_at=${session.access}`, `jp_admin_csrf=${session.csrf}`]);
  test.set("X-CSRF-Token", session.csrf);
};

describe("the admin flag routes", () => {
  beforeEach(() => installCaptureMailer());

  it("lists the registry with resolved values", async () => {
    const admin = await signedInAdmin("reader@admins.test");
    const res = await request(app).get("/api/v1/admin/flags").use(asAdmin(admin)).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.flags).toEqual([
      expect.objectContaining({ key: "autoApproveRecruiterSignups", enabled: false, default: false }),
    ]);
  });

  it("refuses an anonymous caller and a session without CSRF", async () => {
    const admin = await signedInAdmin("gate@admins.test");
    await request(app).get("/api/v1/admin/flags").expect(401);
    await request(app)
      .put("/api/v1/admin/flags/autoApproveRecruiterSignups")
      .set("Cookie", [`jp_admin_at=${admin.access}`])
      .send({ enabled: true })
      .expect(403);
  });

  it("flips a registered flag and records the flipper", async () => {
    const admin = await signedInAdmin("flipper@admins.test");
    await request(app)
      .put("/api/v1/admin/flags/autoApproveRecruiterSignups")
      .use(asAdmin(admin))
      .send({ enabled: true })
      .expect(200);

    const res = await request(app).get("/api/v1/admin/flags").use(asAdmin(admin)).expect(200);
    expect(res.body.flags[0]).toMatchObject({
      key: "autoApproveRecruiterSignups",
      enabled: true,
      lastChangedBy: "flipper@admins.test",
    });
  });

  it("refuses an unregistered key with 400, creating nothing", async () => {
    const admin = await signedInAdmin("strict@admins.test");
    const res = await request(app)
      .put("/api/v1/admin/flags/not-a-flag")
      .use(asAdmin(admin))
      .send({ enabled: true })
      .expect(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(await FeatureFlag.countDocuments({})).toBe(0);
  });
});

describe("the public flag read", () => {
  beforeEach(() => installCaptureMailer());

  it("answers resolved values with no auth", async () => {
    const res = await request(app).get("/api/v1/flags").expect(200);
    expect(res.body).toEqual({
      success: true,
      flags: { autoApproveRecruiterSignups: false },
    });
  });
});
