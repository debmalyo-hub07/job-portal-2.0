import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { Admin } from "../src/models/admin.model.js";
import { hashPassword } from "../src/lib/password.js";
import { asSession, installCaptureMailer, signedUpOn } from "./auth/helpers.js";

const app = buildApp();
const PASSWORD = "correct horse battery staple";

/**
 * Admins are never self-served, so there is no register helper for them. Built
 * directly and then signed in through the real login route, the way
 * `approval.test.ts` builds its admins — the cookies have to come from the
 * portal's own key or the mount below would not be exercised at all.
 */
async function adminCookies(email: string): Promise<string[]> {
  await Admin.create({
    email,
    fullName: "Console Admin",
    passwordHash: await hashPassword(PASSWORD),
    emailVerifiedAt: new Date(),
    status: "active",
  });
  const login = await request(app)
    .post("/api/v1/admin/auth/login")
    .send({ email, password: PASSWORD });
  expect(login.status).toBe(200);
  return login.headers["set-cookie"] as unknown as string[];
}

describe("admin profile", () => {
  beforeEach(() => installCaptureMailer());

  it("answers an admin session", async () => {
    const cookies = await adminCookies("admin-profile@example.com");
    const res = await request(app).get("/api/v1/admin/profile").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.profile.user.portal).toBe("admin");
    // Ungated: an admin with no date of birth still reads complete, because
    // nothing reads an admin's DOB and the account that unblocks every other one
    // must not depend on a new gate being correct.
    expect(res.body.profile.user.profileComplete).toBe(true);
    expect(res.body.profile.admin).not.toBeNull();
    expect(res.body.profile.seeker).toBeNull();
    expect(res.body.profile.recruiter).toBeNull();
  });

  it("never returns a password hash", async () => {
    const cookies = await adminCookies("admin-nohash@example.com");
    const res = await request(app).get("/api/v1/admin/profile").set("Cookie", cookies);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$argon2id\$/);
  });

  it("lets an admin edit its own account", async () => {
    const email = "admin-edit@example.com";
    const cookies = await adminCookies(email);
    const csrf = cookies
      .map((c) => /jp_admin_csrf=([^;]+)/.exec(c)?.[1])
      .find((v): v is string => Boolean(v))!;
    // JSON, not multipart: this mount carries no multer, because there is no file
    // path into an admin row. The shared schema reads either — every field is a
    // string in both shapes.
    const res = await request(app)
      .post("/api/v1/admin/profile/update")
      .set("Cookie", cookies)
      .set("X-CSRF-Token", csrf)
      .send({ fullname: "Renamed Admin" });

    expect(res.status).toBe(200);
    expect(res.body.profile.user.fullName).toBe("Renamed Admin");
  });

  it("refuses a seeker token, at the signature rather than a claim", async () => {
    // ADR-0006: `accessTokenKey` derives a per-portal HKDF key, so a seeker token
    // fails verification at this mount before any claim is read. This is the
    // property that made a separate collection worth its cost.
    const session = await signedUpOn("seeker", "admin-profile-seeker@example.com");
    const res = await request(app)
      .get("/api/v1/admin/profile")
      .use(asSession("seeker", session));
    expect(res.status).toBe(401);
  });

  it("does not reach the admin profile through /user/profile", async () => {
    // `authenticateAny` deliberately excludes admin and must stay that way: an
    // admin cookie must never silently satisfy a route that meant "some
    // signed-in user".
    const cookies = await adminCookies("admin-any@example.com");
    const res = await request(app).get("/api/v1/user/profile").set("Cookie", cookies);
    expect(res.status).toBe(401);
  });
});

describe("the admin profile mount takes JSON, not multipart", () => {
  beforeEach(() => installCaptureMailer());

  it("refuses a multipart body rather than silently ignoring it", async () => {
    // Worth pinning: without multer a multipart body is never parsed, so a
    // client posting one would otherwise get a 200 and no change — a save that
    // looks like it worked.
    const cookies = await adminCookies("admin-multipart@example.com");
    const csrf = cookies
      .map((c) => /jp_admin_csrf=([^;]+)/.exec(c)?.[1])
      .find((v): v is string => Boolean(v))!;
    const res = await request(app)
      .post("/api/v1/admin/profile/update")
      .set("Cookie", cookies)
      .set("X-CSRF-Token", csrf)
      .field("fullname", "Multipart Admin");
    expect(res.status).toBe(400);
  });
});
