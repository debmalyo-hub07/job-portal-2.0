import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { Portal } from "@jobportal/shared";
import { OtpCode } from "../../src/models/otpCode.model.js";
import {
  registerHandler,
  resendCodeHandler,
  verifyEmailHandler,
} from "../../src/controllers/auth.controller.js";
import { findAccountByEmail } from "../../src/services/account.service.js";
import {
  authTestApp,
  installCaptureMailer,
  lastCodeFor,
  outbox,
  setCookieNames,
} from "./helpers.js";

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

async function isVerified(portal: Portal, email: string): Promise<boolean> {
  const account = await findAccountByEmail(portal, email);
  return account?.emailVerifiedAt != null;
}

/** n distinct 6-digit strings, none equal to `code`. Deterministic. */
function wrongCodesExcluding(code: string, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; out.length < n; i += 1) {
    const candidate = String(i).padStart(6, "0");
    if (candidate !== code) out.push(candidate);
  }
  return out;
}

describe("otp redemption", () => {
  it("does not let a code issued to A verify account B (same portal)", async () => {
    const { code: aCode } = await registerAndCaptureCode("seeker", "a@x.test");
    await registerAndCaptureCode("seeker", "b@x.test");
    // The attacker's own valid code, aimed at the victim's address.
    const res = await post("/api/v1/seeker/auth/verify-email", { email: "b@x.test", code: aCode });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("OTP_INVALID");
    expect(await isVerified("seeker", "b@x.test")).toBe(false);
  });

  it("does not let a seeker code redeem on the recruiter mount", async () => {
    const { code } = await registerAndCaptureCode("seeker", "dual@x.test");
    await registerAndCaptureCode("recruiter", "dual@x.test"); // same address, both portals
    const res = await post("/api/v1/recruiter/auth/verify-email", {
      email: "dual@x.test",
      code,
    });
    expect(res.status).toBe(400);
    expect(await isVerified("recruiter", "dual@x.test")).toBe(false);
  });

  it("redeems the happy path exactly once and issues a session", async () => {
    const { code } = await registerAndCaptureCode("seeker", "happy@x.test");
    const first = await post("/api/v1/seeker/auth/verify-email", {
      email: "happy@x.test",
      code,
    });
    expect(first.status).toBe(200);
    expect(first.body.user).toEqual({
      id: expect.any(String),
      portal: "seeker",
      fullName: "Test Person",
      email: "happy@x.test",
      emailVerified: true,
      avatarUrl: null,
    }); // exact shape — an extra key here is a leak
    expect(setCookieNames(first)).toEqual(
      expect.arrayContaining(["jp_seeker_at", "jp_seeker_rt", "jp_csrf"]),
    );
    // Replaying the consumed code fails.
    const replay = await post("/api/v1/seeker/auth/verify-email", {
      email: "happy@x.test",
      code,
    });
    expect(replay.status).toBe(400);
  });

  it("answers an unknown email exactly like a wrong code", async () => {
    const res = await post("/api/v1/seeker/auth/verify-email", {
      email: "ghost@x.test",
      code: "123456",
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("OTP_INVALID");
  });

  it("bounds honoured guesses by the atomic budget under 50-way concurrency", async () => {
    const { code } = await registerAndCaptureCode("seeker", "d@x.test");
    const wrong = wrongCodesExcluding(code, 50);
    const results = await Promise.all(
      wrong.map((c) => post("/api/v1/seeker/auth/verify-email", { email: "d@x.test", code: c })),
    );
    // A read-then-decide budget lets all 50 through; the atomic charge caps it.
    const honoured = results.filter((r) => r.status === 400).length;
    const refused = results.filter((r) => r.status === 429).length;
    expect(honoured).toBeLessThanOrEqual(20); // OTP_BUDGET_MAX_FAILURES
    expect(honoured + refused).toBe(50);
    // Wrong guesses can never touch the per-code counter — the digest matches no row.
    const row = await OtpCode.findOne({ subjectType: "seeker", consumedAt: null });
    expect(row?.attempts).toBe(0);
    // The budget is spent, so even the CORRECT code is refused now.
    const res = await post("/api/v1/seeker/auth/verify-email", { email: "d@x.test", code });
    expect(res.status).toBe(429);
    expect(res.body.code).toBe("OTP_BUDGET_EXHAUSTED");
  });

  it("keeps counting failures across a resend, then emails the owner once", async () => {
    const { code } = await registerAndCaptureCode("seeker", "e@x.test");
    const wrong = wrongCodesExcluding(code, 20);
    for (let i = 0; i < 10; i += 1) {
      await post("/api/v1/seeker/auth/verify-email", { email: "e@x.test", code: wrong[i] });
    }
    await post("/api/v1/seeker/auth/resend-code", { email: "e@x.test" }); // fresh code, attempts:0
    for (let i = 10; i < 20; i += 1) {
      await post("/api/v1/seeker/auth/verify-email", { email: "e@x.test", code: wrong[i] });
    }
    // 20 charges spent; the resend did NOT reset the meter.
    const over = await post("/api/v1/seeker/auth/verify-email", {
      email: "e@x.test",
      code: "000001",
    });
    expect(over.status).toBe(429);
    expect(over.body.code).toBe("OTP_BUDGET_EXHAUSTED");
    // The owner was told, exactly once. Matched on the budget email's real
    // subject line ("Too many incorrect codes") — the plan asserted /paused/i,
    // which only ever appears in the BODY of renderOtpBudgetEmail, never the
    // subject, so that assertion could not have passed.
    expect(
      outbox.filter((m) => m.to === "e@x.test" && /too many incorrect codes/i.test(m.subject))
        .length,
    ).toBe(1);
  });

  it("only issues one live code per subject+purpose", async () => {
    const { code: first } = await registerAndCaptureCode("seeker", "s@x.test");
    await post("/api/v1/seeker/auth/resend-code", { email: "s@x.test" });
    const res = await post("/api/v1/seeker/auth/verify-email", {
      email: "s@x.test",
      code: first,
    });
    expect(res.status).toBe(400); // superseded by the resend
  });

  it("answers resend uniformly for unknown and already-verified addresses", async () => {
    const unknown = await post("/api/v1/seeker/auth/resend-code", { email: "nobody@x.test" });
    expect(unknown.status).toBe(200);
    const { code } = await registerAndCaptureCode("seeker", "v@x.test");
    await post("/api/v1/seeker/auth/verify-email", { email: "v@x.test", code });
    const verified = await post("/api/v1/seeker/auth/resend-code", { email: "v@x.test" });
    expect(verified.status).toBe(200);
    expect(verified.body).toEqual(unknown.body); // byte-identical envelopes
  });

  it("stores no plaintext code and no email on the otp document", async () => {
    const { code } = await registerAndCaptureCode("seeker", "f@x.test");
    const raw = await OtpCode.findOne().lean();
    expect(JSON.stringify(raw)).not.toContain(code);
    expect(JSON.stringify(raw)).not.toContain("f@x.test");
  });
});
