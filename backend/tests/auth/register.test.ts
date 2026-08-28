import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { Portal } from "@jobportal/shared";
import {
  registerHandler,
  resendCodeHandler,
  verifyEmailHandler,
} from "../../src/controllers/auth.controller.js";
import { findAccountByEmail } from "../../src/services/account.service.js";
import { Recruiter } from "../../src/models/recruiter.model.js";
import { Seeker } from "../../src/models/seeker.model.js";
import { authTestApp, installCaptureMailer, lastCodeFor, setCookieNames } from "./helpers.js";

const app: Express = authTestApp((portal, r) => {
  r.post("/register", registerHandler(portal));
  r.post("/verify-email", verifyEmailHandler(portal));
  r.post("/resend-code", resendCodeHandler(portal));
});

beforeEach(installCaptureMailer);

const post = (url: string, body: object) => request(app).post(url).send(body);

async function registerAndCaptureCode(portal: Portal, email: string) {
  const res = await post(`/api/v1/${portal}/auth/register`, {
    fullName: "Test Person",
    email,
    password: "correct horse battery staple",
  });
  expect(res.status).toBe(201);
  return { code: await lastCodeFor(email) };
}

describe("register", () => {
  it("creates an unverified account, issues NO session, and leaks nothing", async () => {
    const res = await post("/api/v1/seeker/auth/register", {
      fullName: "Asha Rao",
      email: "asha@x.test",
      password: "correct horse battery staple",
    });
    expect(res.status).toBe(201);
    expect(setCookieNames(res)).toEqual([]); // no session before verification
    expect(JSON.stringify(res.body)).not.toMatch(/\b\d{6}\b/); // and never the code

    const account = await findAccountByEmail("seeker", "asha@x.test", { withSecret: true });
    expect(account?.emailVerifiedAt).toBeNull();
    expect(account?.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it("rejects a duplicate on the same portal AND on the other", async () => {
    await registerAndCaptureCode("seeker", "both@x.test");
    const dupe = await post("/api/v1/seeker/auth/register", {
      fullName: "Dup Person",
      email: "both@x.test",
      password: "correct horse battery staple",
    });
    expect(dupe.status).toBe(409);
    expect(dupe.body.code).toBe("EMAIL_TAKEN");

    // Inverted 2026-08-27: the email registry makes the address unique across
    // portals too — one address, one account. The registry's unique index is
    // the guarantee; the per-collection index and the findOne above are fast
    // paths.
    const other = await post("/api/v1/recruiter/auth/register", {
      fullName: "Dup Person",
      email: "both@x.test",
      password: "correct horse battery staple",
    });
    expect(other.status).toBe(409);
    expect(other.body.code).toBe("EMAIL_TAKEN");
  });

  it("rejects a short password with a 400 envelope, not a 500", async () => {
    const res = await post("/api/v1/seeker/auth/register", {
      fullName: "Shorty",
      email: "short@x.test",
      password: "elevenchars",
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("normalises the email so a capitalised copy cannot register twice", async () => {
    await registerAndCaptureCode("seeker", "case@x.test");
    const res = await post("/api/v1/seeker/auth/register", {
      fullName: "Case Two",
      email: "CASE@X.TEST",
      password: "correct horse battery staple",
    });
    expect(res.status).toBe(409);
  });
});

describe("recruiter registration is gated", () => {
  it("creates a recruiter as pending", async () => {
    await post("/api/v1/recruiter/auth/register", {
      fullName: "New Rec",
      email: "rec@example.com",
      password: "correct horse battery staple",
    }).expect(201);

    const rec = await Recruiter.findOne({ email: "rec@example.com" });
    expect(rec?.status).toBe("pending");
  });

  it("still creates a seeker as active", async () => {
    await post("/api/v1/seeker/auth/register", {
      fullName: "New Seek",
      email: "seek@example.com",
      password: "correct horse battery staple",
    }).expect(201);

    const seek = await Seeker.findOne({ email: "seek@example.com" });
    expect(seek?.status).toBe("active");
  });
});
