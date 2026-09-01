import { beforeEach, describe, expect, it, vi } from "vitest";

import { Admin } from "../src/models/admin.model.js";
import { Recruiter } from "../src/models/recruiter.model.js";
import { renderAdminPendingEmail } from "../src/lib/emailTemplates.js";
import { setMailer } from "../src/lib/mailer.js";
import { notifyAdminsOfPendingRecruiter } from "../src/services/notification.service.js";
import { installCaptureMailer, outbox } from "./auth/helpers.js";

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
