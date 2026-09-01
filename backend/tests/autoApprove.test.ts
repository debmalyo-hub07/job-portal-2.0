import { beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import request from "supertest";

import { buildApp } from "../src/app.js";
import { Admin } from "../src/models/admin.model.js";
import { Company } from "../src/models/company.model.js";
import { Recruiter } from "../src/models/recruiter.model.js";
import { AccountEvent } from "../src/models/accountEvent.model.js";
import { autoApproveRecruiter, approveRecruiter } from "../src/services/approval.service.js";
import { getActivity, listAllRecruiters } from "../src/services/adminConsole.service.js";
import { setFlag } from "../src/services/flags.service.js";
import { matchingCompanyForEmail } from "../src/services/signupSignals.service.js";
import { installCaptureMailer, lastCodeFor, outbox } from "./auth/helpers.js";

const app = buildApp();
const PASSWORD = "correct horse battery staple";

async function registerAndVerifyRecruiter(email: string): Promise<void> {
  await request(app)
    .post("/api/v1/recruiter/auth/register")
    .send({ fullName: "Mira Patel", email, password: PASSWORD });
  const code = await lastCodeFor(email);
  const res = await request(app)
    .post("/api/v1/recruiter/auth/verify-email")
    .send({ email, code });
  expect(res.status).toBe(200);
}

const deadOwnerId = new mongoose.Types.ObjectId();

async function northstarCompany() {
  return Company.create({
    name: "Northstar Labs",
    description: "d",
    location: "Bengaluru",
    website: "https://www.northstarlabs.example",
    userId: deadOwnerId,
  });
}

async function pendingRecruiter(email: string) {
  return Recruiter.create({
    email,
    fullName: "Pending One",
    passwordHash: "x",
    emailVerifiedAt: new Date(),
    status: "pending",
  });
}

describe("autoApproveRecruiter", () => {
  beforeEach(() => installCaptureMailer());

  it("activates, mails the approval, and records its own event kind", async () => {
    const recruiter = await pendingRecruiter("mira@northstarlabs.example");

    const result = await autoApproveRecruiter(String(recruiter._id), "Northstar Labs");

    expect(result).toBe(true);
    expect((await Recruiter.findById(recruiter._id))?.status).toBe("active");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(outbox.some((m) => m.to === "mira@northstarlabs.example")).toBe(true);

    const events = await AccountEvent.find({ subjectId: recruiter._id });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "auto_approved",
      reason: "email domain matches Northstar Labs",
      actorAdminId: null,
    });
  });

  it("returns false for an already-decided account, recording nothing", async () => {
    const recruiter = await pendingRecruiter("raced@r.test");
    await Recruiter.updateOne({ _id: recruiter._id }, { $set: { status: "active" } });

    expect(await autoApproveRecruiter(String(recruiter._id), "Any Co")).toBe(false);
    expect(await AccountEvent.countDocuments({ subjectId: recruiter._id })).toBe(0);
  });

  it("leaves the human path's event kind untouched", async () => {
    const recruiter = await pendingRecruiter("human@r.test");

    await approveRecruiter(String(recruiter._id));

    const events = await AccountEvent.find({ subjectId: recruiter._id });
    expect(events[0]).toMatchObject({ kind: "approved" });
  });
});

describe("matchingCompanyForEmail", () => {
  beforeEach(async () => {
    await Promise.all([Company.init(), Recruiter.init()]);
  });

  it("finds the company whose website domain matches", async () => {
    await northstarCompany();

    expect(await matchingCompanyForEmail("mira@northstarlabs.example")).toBe("Northstar Labs");
    expect(await matchingCompanyForEmail("someone@gmail.com")).toBeNull();
    expect(await matchingCompanyForEmail("stranger@unknown.example")).toBeNull();
  });
});

describe("the auto-approval tier at the verification flip", () => {
  beforeEach(async () => {
    await Promise.all([Company.init(), Recruiter.init(), Admin.init()]);
    installCaptureMailer();
    // The flag is the kill switch; each test sets the world it needs.
    await setFlag("autoApproveRecruiterSignups", false, null);
  });

  it("auto-approves a domain-matching signup when the flag is on", async () => {
    await setFlag("autoApproveRecruiterSignups", true, null);
    await northstarCompany();
    await Admin.create({ email: "boss@admins.test", fullName: "Boss", status: "active" });

    await registerAndVerifyRecruiter("mira@northstarlabs.example");

    const recruiter = await Recruiter.findOne({ email: "mira@northstarlabs.example" });
    expect(recruiter?.status).toBe("active");
    await new Promise((resolve) => setTimeout(resolve, 100));
    // The approval mail went to the recruiter; the admin got nothing.
    expect(
      outbox.some((m) => m.to === "mira@northstarlabs.example" && /approved/i.test(m.subject)),
    ).toBe(true);
    expect(outbox.some((m) => m.to === "boss@admins.test")).toBe(false);

    const activity = await getActivity();
    const item = activity.items.find((i) => i.kind === "recruiter_auto_approved");
    expect(item).toMatchObject({ label: "Mira Patel", detail: "Northstar Labs" });
  });

  it("queues a non-matching signup for the human even with the flag on", async () => {
    await setFlag("autoApproveRecruiterSignups", true, null);
    await Admin.create({ email: "boss@admins.test", fullName: "Boss", status: "active" });

    await registerAndVerifyRecruiter("unknown@fresh-employer.example");

    const recruiter = await Recruiter.findOne({ email: "unknown@fresh-employer.example" });
    expect(recruiter?.status).toBe("pending");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(outbox.some((m) => m.to === "boss@admins.test" && /waiting/i.test(m.subject))).toBe(true);
  });

  it("with the flag off, a domain-matching signup queues exactly as today", async () => {
    await northstarCompany();
    await Admin.create({ email: "boss@admins.test", fullName: "Boss", status: "active" });

    await registerAndVerifyRecruiter("mira@northstarlabs.example");

    const recruiter = await Recruiter.findOne({ email: "mira@northstarlabs.example" });
    expect(recruiter?.status).toBe("pending");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(outbox.some((m) => m.to === "boss@admins.test")).toBe(true);
  });
});
