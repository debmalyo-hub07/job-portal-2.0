import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { dispatch } from "../src/lib/mailer.js";
import { Admin } from "../src/models/admin.model.js";
import {
  cookieValue,
  installCaptureMailer,
  lastCodeFor,
  signedUpOn,
} from "./auth/helpers.js";

const app = buildApp();
const PASSWORD = "correct horse battery staple";

async function signedInAdmin(email = "root@example.com") {
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
    csrf: cookieValue(login, "jp_csrf")!,
  };
}

const body = {
  fullName: "Second Admin",
  email: "second@example.com",
  provisioningKey: process.env.ADMIN_PROVISIONING_SECRET!,
};

describe("admin provisioning", () => {
  beforeEach(() => installCaptureMailer());

  it("creates an active admin without accepting a password and emails setup", async () => {
    const root = await signedInAdmin();
    await request(app)
      .post("/api/v1/admin/admins")
      .set("Cookie", [`jp_admin_at=${root.access}`, `jp_csrf=${root.csrf}`])
      .set("X-CSRF-Token", root.csrf)
      .send(body)
      .expect(201);

    const created = await Admin.findOne({ email: body.email }).select("+passwordHash");
    expect(created?.status).toBe("active");
    expect(created?.emailVerifiedAt).toBeInstanceOf(Date);
    expect(created?.passwordHash).toBeNull();
    expect(await lastCodeFor(body.email)).toMatch(/^\d{6}$/);
  });

  it("requires an admin session", async () => {
    await request(app).post("/api/v1/admin/admins").send(body).expect(401);
  });

  it("refuses a recruiter session", async () => {
    const recruiter = await signedUpOn("recruiter", "recruiter@example.com");
    await request(app)
      .post("/api/v1/admin/admins")
      .set("Cookie", [`jp_recruiter_at=${recruiter.access}`, `jp_csrf=${recruiter.csrf}`])
      .set("X-CSRF-Token", recruiter.csrf)
      .send(body)
      .expect(401);
  });

  it("requires CSRF even for a valid admin session", async () => {
    const root = await signedInAdmin();
    await request(app)
      .post("/api/v1/admin/admins")
      .set("Cookie", [`jp_admin_at=${root.access}`])
      .send(body)
      .expect(403);
  });

  it("refuses the wrong provisioning key without creating an account", async () => {
    const root = await signedInAdmin();
    await request(app)
      .post("/api/v1/admin/admins")
      .set("Cookie", [`jp_admin_at=${root.access}`, `jp_csrf=${root.csrf}`])
      .set("X-CSRF-Token", root.csrf)
      .send({ ...body, provisioningKey: "wrong-key" })
      .expect(403);

    expect(await Admin.findOne({ email: body.email })).toBeNull();
  });

  it("refuses a duplicate admin email", async () => {
    const root = await signedInAdmin();
    await Admin.create({
      email: body.email,
      fullName: "Existing Admin",
      passwordHash: null,
      emailVerifiedAt: new Date(),
      status: "active",
    });

    await request(app)
      .post("/api/v1/admin/admins")
      .set("Cookie", [`jp_admin_at=${root.access}`, `jp_csrf=${root.csrf}`])
      .set("X-CSRF-Token", root.csrf)
      .send(body)
      .expect(409);
  });

  it("does not create an admin while transactional email is unavailable", async () => {
    const root = await signedInAdmin();
    dispatch(Promise.reject(new Error("provider unavailable")));
    await new Promise((resolve) => setImmediate(resolve));

    const response = await request(app)
      .post("/api/v1/admin/admins")
      .set("Cookie", [`jp_admin_at=${root.access}`, `jp_csrf=${root.csrf}`])
      .set("X-CSRF-Token", root.csrf)
      .send(body);

    expect(response.status).toBe(503);
    expect(response.body.code).toBe("EMAIL_UNAVAILABLE");
    expect(await Admin.findOne({ email: body.email })).toBeNull();
  });
});
