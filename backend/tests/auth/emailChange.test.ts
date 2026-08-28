import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Types } from "mongoose";

import { buildApp } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { Admin } from "../../src/models/admin.model.js";
import { Seeker } from "../../src/models/seeker.model.js";
import { EmailRegistry } from "../../src/models/emailRegistry.model.js";
import { OtpCode } from "../../src/models/otpCode.model.js";
import { OtpBudget } from "../../src/models/otpBudget.model.js";
import { chargeOtpAttempt, issueOtp } from "../../src/services/otp.service.js";
import { registryDisagreements } from "../../src/services/emailRegistry.service.js";
import { findAccountByEmail } from "../../src/services/account.service.js";
import { sendOtpEmail } from "../../src/lib/mailer.js";
import { seedAdmin } from "../../src/scripts/seed-admin.js";
import { asSession, installCaptureMailer, lastCodeFor, outbox, signedUpOn } from "./helpers.js";

const app = buildApp();
const PASSWORD = "correct horse battery staple";

beforeEach(installCaptureMailer);

type Session = Awaited<ReturnType<typeof signedUpOn>>;

/** Start a seeker/recruiter email change through the real user mount. */
function startChange(session: Session, newEmail: string, password?: string) {
  const body = password === undefined ? { newEmail } : { newEmail, password };
  return request(app)
    .post("/api/v1/user/email-change")
    .use(asSession("seeker", session))
    .send(body);
}

function confirmChange(session: Session, code: string) {
  return request(app)
    .post("/api/v1/user/email-change/confirm")
    .use(asSession("seeker", session))
    .send({ code });
}

/**
 * Admins are never self-served: the real creation path is `seedAdmin` plus the
 * set-password redemption, then the real login. That also means the registry
 * row exists — the swap's delete of the old row has something to delete.
 */
async function adminSessionOn(email: string) {
  await seedAdmin({ email, fullName: "Flow Admin" });
  const setupCode = await lastCodeFor(email);
  const reset = await request(app)
    .post("/api/v1/admin/auth/reset-password")
    .send({ email, code: setupCode, newPassword: PASSWORD });
  expect(reset.status).toBe(200);

  const login = await request(app)
    .post("/api/v1/admin/auth/login")
    .send({ email, password: PASSWORD });
  expect(login.status).toBe(200);
  const cookies = login.headers["set-cookie"] as unknown as string[];
  const pick = (name: string): string =>
    cookies.map((c) => new RegExp(`${name}=([^;]+)`).exec(c)?.[1]).find((v): v is string =>
      Boolean(v),
    )!;
  return { id: login.body.user.id, access: pick("jp_admin_at"), csrf: pick("jp_admin_csrf") };
}

function adminStart(session: { access: string; csrf: string }, newEmail: string, password?: string) {
  const body = password === undefined ? { newEmail } : { newEmail, password };
  return request(app)
    .post("/api/v1/admin/email-change")
    .set("Cookie", [`jp_admin_at=${session.access}`, `jp_admin_csrf=${session.csrf}`])
    .set("X-CSRF-Token", session.csrf)
    .send(body);
}

function adminConfirm(session: { access: string; csrf: string }, code: string) {
  return request(app)
    .post("/api/v1/admin/email-change/confirm")
    .set("Cookie", [`jp_admin_at=${session.access}`, `jp_admin_csrf=${session.csrf}`])
    .set("X-CSRF-Token", session.csrf)
    .send({ code });
}

describe("email change — start", () => {
  it("mails the code to the NEW address and a warning to the OLD one", async () => {
    const session = await signedUpOn("seeker", "mover@x.test");
    // The signup's own verification code is in the outbox; only mails after
    // this point belong to the change.
    const setupMails = outbox.length;

    const res = await startChange(session, "mover-new@x.test", PASSWORD);
    expect(res.status).toBe(200);
    expect(res.body.message).toBeTruthy();

    // The code went to the new address — not the old one, which only hears
    // that a change was requested. Both sends are dispatched, not awaited, so
    // each is polled for; the warning is dispatched after the code and can
    // still be in flight when the code's poll returns.
    await lastCodeFor("mover-new@x.test");
    await vi.waitFor(() => {
      if (!outbox.some((m) => m.to === "mover@x.test" && /change was requested/i.test(m.subject))) {
        throw new Error("warning mail to the old address has not landed yet");
      }
    });
    const changeMails = outbox.slice(setupMails);
    expect(changeMails.some((m) => m.to === "mover-new@x.test" && /\b\d{6}\b/.test(m.text))).toBe(
      true,
    );
    expect(changeMails.some((m) => m.to === "mover@x.test" && /\b\d{6}\b/.test(m.text))).toBe(false);

    // The pending change is visible to the session that started it.
    const me = await request(app)
      .get("/api/v1/seeker/auth/me")
      .set("Cookie", [`jp_seeker_at=${session.access}`]);
    expect(me.body.user.pendingEmailChange).toMatchObject({
      newEmail: "mover-new@x.test",
      confirmedCurrentAt: null,
    });
  });

  it("refuses the same address with EMAIL_UNCHANGED, and mails nothing", async () => {
    const session = await signedUpOn("seeker", "same@x.test");
    const mailsBefore = outbox.length;
    const res = await startChange(session, "same@x.test", PASSWORD);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("EMAIL_UNCHANGED");
    expect(outbox.length).toBe(mailsBefore);
  });

  it("answers a missing and a wrong password identically, storing and mailing nothing", async () => {
    const session = await signedUpOn("seeker", "locked@x.test");

    for (const password of [undefined, "not the password at all"] as const) {
      const mailsBefore = outbox.length;
      const res = await startChange(session, "locked-new@x.test", password);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("PASSWORD_INVALID");
      expect(outbox.length).toBe(mailsBefore);
    }

    const account = await findAccountByEmail("seeker", "locked@x.test", { withSecret: true });
    expect(account?.pendingEmailChange?.newEmail ?? null).toBeNull();
  });

  it("demands no password from a Google-only account", async () => {
    const session = await signedUpOn("seeker", "googleonly@x.test");
    // The Google-only shape: no hash, a Google id, already verified.
    await Seeker.updateOne(
      { email: "googleonly@x.test" },
      { $set: { passwordHash: null, googleId: "g-sub-change-1" } },
    );

    const me = await request(app)
      .get("/api/v1/seeker/auth/me")
      .set("Cookie", [`jp_seeker_at=${session.access}`]);
    expect(me.body.user.hasPassword).toBe(false);

    const res = await startChange(session, "googleonly-new@x.test");
    expect(res.status).toBe(200);
  });

  it("reserves nothing: a stranger registering the target address wins", async () => {
    const session = await signedUpOn("seeker", "resident@x.test");
    await startChange(session, "contested@x.test", PASSWORD);
    // Captured BEFORE the stranger registers: their verification code would
    // otherwise be the more recent 6-digit mail to this address.
    const code = await lastCodeFor("contested@x.test");

    // Nothing was reserved — the address is registerable by anyone.
    const stranger = await request(app).post("/api/v1/recruiter/auth/register").send({
      fullName: "Faster Stranger",
      email: "contested@x.test",
      password: PASSWORD,
    });
    expect(stranger.status).toBe(201);

    // The confirmant's redemption answers EMAIL_TAKEN, not OTP_INVALID — the
    // one distinct rejection confirm ever makes.
    const res = await confirmChange(session, code);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("EMAIL_TAKEN");

    // And the account never moved.
    expect(await findAccountByEmail("seeker", "resident@x.test")).not.toBeNull();
    expect(await Seeker.countDocuments({ email: "contested@x.test" })).toBe(0);
  });

  it("401s unauthenticated and 403s without CSRF", async () => {
    const anonymous = await request(app)
      .post("/api/v1/user/email-change")
      .send({ newEmail: "anon@x.test" });
    expect(anonymous.status).toBe(401);

    const session = await signedUpOn("seeker", "csrfless@x.test");
    const noCsrf = await request(app)
      .post("/api/v1/user/email-change")
      .set("Cookie", [`jp_seeker_at=${session.access}`])
      .send({ newEmail: "csrfless-new@x.test", password: PASSWORD });
    expect(noCsrf.status).toBe(403);
    expect(noCsrf.body.code).toBe("CSRF_INVALID");
  });
});

describe("email change — confirm (seeker)", () => {
  it("completes the happy path: mail moves, registry swaps, sessions die", async () => {
    const session = await signedUpOn("seeker", "happy@x.test");
    // The access-token cutoff floors to the second, and a token minted in the
    // SAME second as the invalidation deliberately survives (see the comment
    // in authenticate.ts). Sleeping past that boundary makes the kill
    // assertable rather than a coin flip on test speed.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await startChange(session, "happy-new@x.test", PASSWORD);
    const code = await lastCodeFor("happy-new@x.test");

    const res = await confirmChange(session, code);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/sign in with your new address/i);

    const account = await findAccountByEmail("seeker", "happy-new@x.test", { withSecret: true });
    expect(account).not.toBeNull();
    expect(account?.emailVerifiedAt).not.toBeNull();
    expect(account?.pendingEmailChange?.newEmail ?? null).toBeNull();

    // The registry swapped exactly: new row present, old row gone, and the
    // registry agrees with the collections afterwards.
    expect(await EmailRegistry.countDocuments({ email: "happy-new@x.test" })).toBe(1);
    expect(await EmailRegistry.countDocuments({ email: "happy@x.test" })).toBe(0);
    expect(await registryDisagreements()).toEqual([]);

    // Every session is dead by design, including the caller's: the access
    // token predates the cutoff, and the refresh family is revoked.
    const me = await request(app)
      .get("/api/v1/seeker/auth/me")
      .set("Cookie", [`jp_seeker_at=${session.access}`]);
    expect(me.status).toBe(401);
    const refresh = await request(app)
      .post("/api/v1/seeker/auth/refresh")
      .set("Cookie", [`jp_seeker_rt=${session.refresh}`, `jp_seeker_csrf=${session.csrf}`])
      .set("X-CSRF-Token", session.csrf);
    expect(refresh.status).toBe(401);

    // The old address is free from this instant.
    const reReg = await request(app).post("/api/v1/recruiter/auth/register").send({
      fullName: "New Owner",
      email: "happy@x.test",
      password: PASSWORD,
    });
    expect(reReg.status).toBe(201);
  });

  it("answers no-pending, wrong code, expired code and stale pending uniformly", async () => {
    // No pending at all.
    const fresh = await signedUpOn("seeker", "nopending@x.test");
    const none = await confirmChange(fresh, "123456");
    expect(none.status).toBe(400);
    expect(none.body.code).toBe("OTP_INVALID");

    // Wrong code.
    const session = await signedUpOn("seeker", "wrongcode@x.test");
    await startChange(session, "wrongcode-new@x.test", PASSWORD);
    const code = await lastCodeFor("wrongcode-new@x.test");
    const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, "0");
    const res = await confirmChange(session, wrong);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("OTP_INVALID");

    // Expired code: same start, code aged past the TTL.
    await OtpCode.updateMany(
      { subjectId: new Types.ObjectId(session.id), purpose: "change_email" },
      { $set: { expiresAt: new Date(Date.now() - 60_000) } },
    );
    const expired = await confirmChange(session, code);
    expect(expired.status).toBe(400);
    expect(expired.body.code).toBe("OTP_INVALID");

    // Stale pending: older than 24 hours, with a perfectly correct code.
    const stale = await signedUpOn("seeker", "stale@x.test");
    await startChange(stale, "stale-new@x.test", PASSWORD);
    const staleCode = await lastCodeFor("stale-new@x.test");
    await Seeker.updateOne(
      { _id: new Types.ObjectId(stale.id) },
      { $set: { "pendingEmailChange.requestedAt": new Date(Date.now() - 25 * 3_600_000) } },
    );
    const res2 = await confirmChange(stale, staleCode);
    expect(res2.status).toBe(400);
    expect(res2.body.code).toBe("OTP_INVALID");
  });

  it("cannot confirm with another purpose's code", async () => {
    const session = await signedUpOn("seeker", "crosspurpose@x.test");
    await startChange(session, "crosspurpose-new@x.test", PASSWORD);

    // A live verify_email code for the same subject — a purpose the change
    // confirm must not honour.
    const account = await findAccountByEmail("seeker", "crosspurpose@x.test", {
      withSecret: true,
    });
    await issueOtp("seeker", account!, "verify_email");
    const verifyCode = await lastCodeFor("crosspurpose@x.test");

    const res = await confirmChange(session, verifyCode);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("OTP_INVALID");
  });

  it("isolates the change_email budget from the other purposes", async () => {
    const session = await signedUpOn("seeker", "budget@x.test");
    const subjectId = new Types.ObjectId(session.id);

    // One verify_email failure on the books, then burn the whole change_email
    // budget. Charged through the service directly: the HTTP route is
    // rate-limited, and the budget is the thing under test, not the route.
    await chargeOtpAttempt("seeker", subjectId, "verify_email");
    let exhausted = false;
    for (let i = 0; i < env().OTP_BUDGET_MAX_FAILURES + 1; i += 1) {
      try {
        await chargeOtpAttempt("seeker", subjectId, "change_email");
      } catch {
        exhausted = true;
      }
    }
    expect(exhausted).toBe(true);

    const verify = await OtpBudget.findOne({ subjectId, purpose: "verify_email" });
    expect(verify?.failures).toBe(1); // untouched by the change_email burn
    expect(await OtpBudget.countDocuments({ subjectId, purpose: "reset_password" })).toBe(0);
  });
});

describe("email change — admin two-stage", () => {
  it("requires the password, then the current mailbox, then the new one", async () => {
    const admin = await adminSessionOn("admin-flow@x.test");

    // Missing password and wrong password answer identically.
    const noPass = await adminStart(admin, "admin-flow-new@x.test");
    expect(noPass.status).toBe(401);
    expect(noPass.body.code).toBe("PASSWORD_INVALID");
    const wrongPass = await adminStart(admin, "admin-flow-new@x.test", "wrong password entirely");
    expect(wrongPass.status).toBe(401);
    expect(wrongPass.body.code).toBe("PASSWORD_INVALID");

    const start = await adminStart(admin, "admin-flow-new@x.test", PASSWORD);
    expect(start.status).toBe(200);

    // Stage 1: the code went to the CURRENT address, and nothing went to the
    // new one yet.
    const code1 = await lastCodeFor("admin-flow@x.test");
    expect(outbox.some((m) => m.to === "admin-flow-new@x.test" && /\b\d{6}\b/.test(m.text))).toBe(
      false,
    );

    const stage1 = await adminConfirm(admin, code1);
    expect(stage1.status).toBe(200);
    expect(stage1.body.message).toMatch(/second code/i);

    // The pending now records the stage, so a resumed dialog knows where it
    // is.
    const midAccount = await Admin.findOne({ email: "admin-flow@x.test" });
    expect(midAccount?.pendingEmailChange?.confirmedCurrentAt ?? null).not.toBeNull();

    // Stage 2: the code went to the NEW address.
    const code2 = await lastCodeFor("admin-flow-new@x.test");
    const stage2 = await adminConfirm(admin, code2);
    expect(stage2.status).toBe(200);

    expect(await Admin.countDocuments({ email: "admin-flow-new@x.test" })).toBe(1);
    expect(await Admin.countDocuments({ email: "admin-flow@x.test" })).toBe(0);
    expect(await EmailRegistry.countDocuments({ email: "admin-flow-new@x.test" })).toBe(1);
    expect(await EmailRegistry.countDocuments({ email: "admin-flow@x.test" })).toBe(0);
    expect(await registryDisagreements()).toEqual([]);
  });

  it("a re-start resets the stage machine", async () => {
    const admin = await adminSessionOn("admin-restart@x.test");
    await adminStart(admin, "admin-restart-new@x.test", PASSWORD);
    const code1 = await lastCodeFor("admin-restart@x.test");
    expect(await adminConfirm(admin, code1)).toMatchObject({ status: 200 });

    // A fresh start overwrites the whole pending, stage included.
    await adminStart(admin, "admin-restart-other@x.test", PASSWORD);
    const account = await Admin.findOne({ email: "admin-restart@x.test" });
    expect(account?.pendingEmailChange?.newEmail).toBe("admin-restart-other@x.test");
    expect(account?.pendingEmailChange?.confirmedCurrentAt ?? null).toBeNull();
  });

  it("enforces the stage twice: a stage-1 code cannot redeem as stage 2", async () => {
    const admin = await adminSessionOn("admin-stage@x.test");
    await adminStart(admin, "admin-stage-new@x.test", PASSWORD);
    const stage1Code = await lastCodeFor("admin-stage@x.test");

    // The pending says stage 2 is expected (as though stage 1 completed), but
    // the live code is still the stage-1 one. Both enforcements must refuse:
    // the query asks for `confirm-new`, the row says `confirm-current`.
    await Admin.updateOne(
      { email: "admin-stage@x.test" },
      { $set: { "pendingEmailChange.confirmedCurrentAt": new Date() } },
    );
    const res = await adminConfirm(admin, stage1Code);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("OTP_INVALID");
  });

  it("enforces the stage order: a stage-2 code cannot redeem before stage 1", async () => {
    const admin = await adminSessionOn("admin-order@x.test");
    await adminStart(admin, "admin-order-new@x.test", PASSWORD);

    // Issue a stage-2 code directly for the same pending change, exactly as
    // the service itself does after stage 1 — then present it while
    // `confirmedCurrentAt` is still null.
    const account = await Admin.findOne({ email: "admin-order@x.test" });
    const pending = account?.pendingEmailChange;
    expect(pending?.newEmail).toBe("admin-order-new@x.test");
    await issueOtp(
      "admin",
      account!,
      "change_email",
      "confirm-new",
      (code) => sendOtpEmail(pending!.newEmail!, code, "change_email", "confirm-new"),
    );
    const stage2Code = await lastCodeFor("admin-order-new@x.test");

    const res = await adminConfirm(admin, stage2Code);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("OTP_INVALID");
  });

  it("401s unauthenticated and 403s without CSRF on the admin mount", async () => {
    const anonymous = await request(app)
      .post("/api/v1/admin/email-change")
      .send({ newEmail: "anon-admin@x.test", password: PASSWORD });
    expect(anonymous.status).toBe(401);

    const admin = await adminSessionOn("admin-csrf@x.test");
    const noCsrf = await request(app)
      .post("/api/v1/admin/email-change")
      .set("Cookie", [`jp_admin_at=${admin.access}`])
      .send({ newEmail: "admin-csrf-new@x.test", password: PASSWORD });
    expect(noCsrf.status).toBe(403);
    expect(noCsrf.body.code).toBe("CSRF_INVALID");
  });
});

describe("email change — the user mount never serves an admin session", () => {
  it("refuses an admin cookie at /user/email-change (ADR-0006)", async () => {
    const admin = await adminSessionOn("admin-any@x.test");
    const res = await request(app)
      .post("/api/v1/user/email-change")
      .set("Cookie", [`jp_admin_at=${admin.access}`, `jp_admin_csrf=${admin.csrf}`])
      .set("X-CSRF-Token", admin.csrf)
      .send({ newEmail: "admin-any-new@x.test", password: PASSWORD });
    expect(res.status).toBe(401);
  });
});
