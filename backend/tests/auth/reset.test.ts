import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { Portal } from "@jobportal/shared";
import {
  forgotPasswordHandler,
  loginHandler,
  meHandler,
  refreshHandler,
  registerHandler,
  resetPasswordHandler,
  verifyEmailHandler,
} from "../../src/controllers/auth.controller.js";
import { authenticate } from "../../src/middleware/authenticate.js";
import { findAccountByEmail } from "../../src/services/account.service.js";
import {
  authTestApp,
  cookieValue,
  installCaptureMailer,
  lastCodeFor,
  outbox,
  setCookieNames,
} from "./helpers.js";

const app: Express = authTestApp((portal, r) => {
  r.post("/register", registerHandler(portal));
  r.post("/verify-email", verifyEmailHandler(portal));
  r.post("/login", loginHandler(portal));
  r.post("/forgot-password", forgotPasswordHandler(portal));
  r.post("/reset-password", resetPasswordHandler(portal));
  r.post("/refresh", refreshHandler(portal));
  r.get("/me", authenticate(portal), meHandler(portal));
});

beforeEach(installCaptureMailer);

const post = (url: string, body: object) => request(app).post(url).send(body);

const PASSWORD = "correct horse battery staple";
const NEW_PASSWORD = "an entirely new passphrase";

async function registeredVerified(portal: Portal, email: string, password = PASSWORD) {
  const res = await post(`/api/v1/${portal}/auth/register`, {
    fullName: "Test Person",
    email,
    password,
  });
  expect(res.status).toBe(201);
  const code = await lastCodeFor(email);
  const verified = await post(`/api/v1/${portal}/auth/verify-email`, { email, code });
  expect(verified.status).toBe(200);
}

async function isVerified(portal: Portal, email: string): Promise<boolean> {
  const account = await findAccountByEmail(portal, email);
  return account?.emailVerifiedAt != null;
}

describe("password reset", () => {
  it("answers forgot-password identically for present and absent addresses", async () => {
    await registeredVerified("seeker", "real@x.test");
    const present = await post("/api/v1/seeker/auth/forgot-password", { email: "real@x.test" });
    const absent = await post("/api/v1/seeker/auth/forgot-password", { email: "fake@x.test" });
    expect(present.status).toBe(200);
    expect(absent.status).toBe(200);
    expect(present.body).toEqual(absent.body);
    // The real address got a code; the fake one did not get a mail at all.
    await lastCodeFor("real@x.test");
    expect(outbox.some((m) => m.to === "fake@x.test")).toBe(false);
  });

  it("resets the password, kills every session and access token, and refuses reuse", async () => {
    await registeredVerified("seeker", "r@x.test");
    const login = await post("/api/v1/seeker/auth/login", {
      email: "r@x.test",
      password: PASSWORD,
    });
    const oldAccess = cookieValue(login, "jp_seeker_at");
    const oldRefresh = cookieValue(login, "jp_seeker_rt");
    expect(oldAccess).toBeDefined();
    expect(oldRefresh).toBeDefined();

    // The iat-vs-cutoff comparison is floored to the second (Task 6), so make
    // sure the old token was minted in an earlier second than the reset.
    await new Promise((resolve) => setTimeout(resolve, 1100));

    await post("/api/v1/seeker/auth/forgot-password", { email: "r@x.test" });
    const code = await lastCodeFor("r@x.test");

    // Reusing the current password is refused (code consumed — by design).
    const reuse = await post("/api/v1/seeker/auth/reset-password", {
      email: "r@x.test",
      code,
      newPassword: PASSWORD,
    });
    expect(reuse.status).toBe(400);
    expect(reuse.body.code).toBe("PASSWORD_REUSED");

    // New code, new password.
    await post("/api/v1/seeker/auth/forgot-password", { email: "r@x.test" });
    const code2 = await lastCodeFor("r@x.test");
    const reset = await post("/api/v1/seeker/auth/reset-password", {
      email: "r@x.test",
      code: code2,
      newPassword: NEW_PASSWORD,
    });
    expect(reset.status).toBe(200);
    expect(setCookieNames(reset)).toEqual([]); // no auto-session after reset

    // Old refresh token: family revoked.
    const rotate = await request(app)
      .post("/api/v1/seeker/auth/refresh")
      .set("Cookie", [`jp_seeker_rt=${encodeURIComponent(oldRefresh ?? "")}`]);
    expect(rotate.status).toBe(401);

    // Old ACCESS token: cut off by sessionsInvalidatedAt even though its
    // signature is valid and it has not expired.
    const me = await request(app)
      .get("/api/v1/seeker/auth/me")
      .set("Cookie", [`jp_seeker_at=${encodeURIComponent(oldAccess ?? "")}`]);
    expect(me.status).toBe(401);

    // Old password dead, new password lives.
    expect(
      (await post("/api/v1/seeker/auth/login", { email: "r@x.test", password: PASSWORD })).status,
    ).toBe(401);
    expect(
      (await post("/api/v1/seeker/auth/login", { email: "r@x.test", password: NEW_PASSWORD }))
        .status,
    ).toBe(200);
  });

  it("verifies an unverified account as a side effect of a successful reset", async () => {
    await post("/api/v1/seeker/auth/register", {
      fullName: "Fresh",
      email: "fresh@x.test",
      password: PASSWORD,
    });
    await post("/api/v1/seeker/auth/forgot-password", { email: "fresh@x.test" });
    const code = await lastCodeFor("fresh@x.test");
    const res = await post("/api/v1/seeker/auth/reset-password", {
      email: "fresh@x.test",
      code,
      newPassword: NEW_PASSWORD,
    });
    expect(res.status).toBe(200);
    expect(await isVerified("seeker", "fresh@x.test")).toBe(true); // mailbox proven
  });
});
