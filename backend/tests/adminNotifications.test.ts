import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import { buildApp } from "../src/app.js";
import { Admin } from "../src/models/admin.model.js";
import { Recruiter } from "../src/models/recruiter.model.js";
import { renderAdminPendingEmail } from "../src/lib/emailTemplates.js";
import { setMailer } from "../src/lib/mailer.js";
import { notifyAdminsOfPendingRecruiter } from "../src/services/notification.service.js";
import { installCaptureMailer, lastCodeFor, outbox } from "./auth/helpers.js";

const URL = "https://job-portal-debmalyo.vercel.app/admin/recruiters";

describe("renderAdminPendingEmail", () => {
  it("names the recruiter, the queue size, and the console link", () => {
    const r = renderAdminPendingEmail("Mira Patel", "mira@northstar.test", 3, URL);

    expect(r.subject).toBe("New recruiter waiting for review");
    expect(r.text).toContain("Mira Patel");
    expect(r.text).toContain("mira@northstar.test");
    expect(r.text).toContain("3 recruiters");
    expect(r.text).toContain(URL);
  });

  it("uses the singular for a queue of one", () => {
    const r = renderAdminPendingEmail("Mira Patel", "mira@northstar.test", 1, URL);

    expect(r.text).toContain("is 1 recruiter");
  });

  it("escapes a hostile name at the point of interpolation", () => {
    // The denial-reason rule: free text a human typed is escaped where it
    // lands, not trusted because "a user wrote it".
    const r = renderAdminPendingEmail('<script>alert("x")</script>', "x@y.test", 1, URL);

    expect(r.html).not.toContain("<script>");
    expect(r.html).toContain("&lt;script&gt;");
  });
});

// authFields require only email and fullName; passwordHash and status default
// (null / "active"), so these are complete documents, not partial ones.
async function activeAdmin(email: string): Promise<void> {
  await Admin.create({ email, fullName: "Admin", status: "active" });
}

describe("notifyAdminsOfPendingRecruiter", () => {
  beforeEach(() => installCaptureMailer());

  it("mails every active admin and nobody else", async () => {
    await activeAdmin("a1@admins.test");
    await activeAdmin("a2@admins.test");
    await Admin.create({ email: "gone@admins.test", fullName: "Gone", status: "suspended" });

    await notifyAdminsOfPendingRecruiter({ fullName: "Mira Patel", email: "mira@northstar.test" });

    await vi.waitFor(() => expect(outbox.length).toBe(2));
    expect(outbox.map((m) => m.to).sort()).toEqual(["a1@admins.test", "a2@admins.test"]);
    expect(outbox[0]?.subject).toBe("New recruiter waiting for review");
    expect(outbox[0]?.text).toContain("Mira Patel");
  });

  it("counts the queue with the queue's own filter", async () => {
    await activeAdmin("a@admins.test");
    await Recruiter.create({ email: "p1@r.test", fullName: "P One", status: "pending" });
    await Recruiter.create({ email: "p2@r.test", fullName: "P Two", status: "pending" });
    await Recruiter.create({ email: "p3@r.test", fullName: "P Three", status: "active" });

    await notifyAdminsOfPendingRecruiter({ fullName: "Mira Patel", email: "mira@northstar.test" });

    await vi.waitFor(() => expect(outbox.length).toBe(1));
    expect(outbox[0]?.text).toContain("2 recruiters");
  });

  it("never rejects when the mailer does", async () => {
    await activeAdmin("a@admins.test");
    setMailer({
      async send() {
        throw new Error("brevo down");
      },
    });

    await expect(
      notifyAdminsOfPendingRecruiter({ fullName: "Mira Patel", email: "mira@northstar.test" }),
    ).resolves.toBeUndefined();
  });
});

const app = buildApp();
const PASSWORD = "correct horse battery staple";

// Each test registers fresh addresses: the register route is rate-limited
// 10/hour per ip+email, and shared addresses would bleed across tests.
async function registerRecruiter(email: string): Promise<void> {
  const res = await request(app)
    .post("/api/v1/recruiter/auth/register")
    .send({ fullName: "Mira Patel", email, password: PASSWORD });
  expect(res.status).toBe(201);
}

describe("the verification flip notifies the admins", () => {
  beforeEach(() => installCaptureMailer());

  it("mails the admin when a pending recruiter verifies their email", async () => {
    await activeAdmin("boss@admins.test");
    await registerRecruiter("verify@r.test");
    const code = await lastCodeFor("verify@r.test");

    const res = await request(app)
      .post("/api/v1/recruiter/auth/verify-email")
      .send({ email: "verify@r.test", code });

    expect(res.status).toBe(200);
    await vi.waitFor(() => {
      expect(
        outbox.some((m) => m.to === "boss@admins.test" && m.subject === "New recruiter waiting for review"),
      ).toBe(true);
    });
  });

  it("does not mail for a seeker's verification", async () => {
    await activeAdmin("boss@admins.test");
    await request(app)
      .post("/api/v1/seeker/auth/register")
      .send({ fullName: "Seeker", email: "s@seekers.test", password: PASSWORD });
    const code = await lastCodeFor("s@seekers.test");

    const res = await request(app)
      .post("/api/v1/seeker/auth/verify-email")
      .send({ email: "s@seekers.test", code });

    expect(res.status).toBe(200);
    // Settle the seeker's own mail first (the register code), then a short
    // grace window for any wrongly-dispatched admin notification, then the
    // absence assertion — the same pattern reset.test.ts uses for negatives.
    await vi.waitFor(() => expect(outbox.some((m) => m.to === "s@seekers.test")).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(outbox.some((m) => m.to === "boss@admins.test")).toBe(false);
  });

  it("still verifies when the notification mail fails", async () => {
    await activeAdmin("boss@admins.test");
    await registerRecruiter("maildown@r.test");
    const code = await lastCodeFor("maildown@r.test");

    // Swap to a throwing mailer AFTER the code is captured — the
    // notification's dispatch must swallow this without hurting the request.
    setMailer({
      async send() {
        throw new Error("brevo down");
      },
    });

    const res = await request(app)
      .post("/api/v1/recruiter/auth/verify-email")
      .send({ email: "maildown@r.test", code });

    expect(res.status).toBe(200);
  });

  it("mails when an unverified recruiter resets their password (the other flip)", async () => {
    await activeAdmin("boss@admins.test");
    await registerRecruiter("late@r.test");
    // Deliberately NO verify-email step: the account is unverified.

    await request(app).post("/api/v1/recruiter/auth/forgot-password").send({ email: "late@r.test" });
    const code = await lastCodeFor("late@r.test"); // the reset code is now the latest
    const res = await request(app)
      .post("/api/v1/recruiter/auth/reset-password")
      .send({ email: "late@r.test", code, newPassword: "an entirely new passphrase" });

    expect(res.status).toBe(200);
    await vi.waitFor(() => {
      expect(
        outbox.some((m) => m.to === "boss@admins.test" && m.subject === "New recruiter waiting for review"),
      ).toBe(true);
    });
  });

  it("does not mail again when the same recruiter later resets their password", async () => {
    await activeAdmin("boss@admins.test");
    await registerRecruiter("refire@r.test");
    const code = await lastCodeFor("refire@r.test");
    await request(app)
      .post("/api/v1/recruiter/auth/verify-email")
      .send({ email: "refire@r.test", code });
    await vi.waitFor(() =>
      expect(outbox.filter((m) => m.to === "boss@admins.test").length).toBe(1),
    );

    // Already verified: the reset's conditional spread does not flip anything,
    // so the admin must hear nothing the second time.
    await request(app).post("/api/v1/recruiter/auth/forgot-password").send({ email: "refire@r.test" });
    const resetCode = await lastCodeFor("refire@r.test");
    const res = await request(app)
      .post("/api/v1/recruiter/auth/reset-password")
      .send({ email: "refire@r.test", code: resetCode, newPassword: "an entirely new passphrase" });

    expect(res.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(outbox.filter((m) => m.to === "boss@admins.test").length).toBe(1);
  });

  it("does not mail for a recruiter the queue already denied", async () => {
    await activeAdmin("boss@admins.test");
    await registerRecruiter("denied@r.test"); // pending, unverified
    // Denied without ever verifying: suspended AND still unverified. The
    // reset would flip the bit, but the account is no longer the queue's
    // work — status guards it out.
    await Recruiter.updateOne({ email: "denied@r.test" }, { $set: { status: "suspended" } });

    await request(app).post("/api/v1/recruiter/auth/forgot-password").send({ email: "denied@r.test" });
    const code = await lastCodeFor("denied@r.test");
    const res = await request(app)
      .post("/api/v1/recruiter/auth/reset-password")
      .send({ email: "denied@r.test", code, newPassword: "an entirely new passphrase" });

    expect(res.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(outbox.some((m) => m.to === "boss@admins.test")).toBe(false);
  });
});
