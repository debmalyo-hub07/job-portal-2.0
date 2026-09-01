import { beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";

import { Company } from "../src/models/company.model.js";
import { Recruiter } from "../src/models/recruiter.model.js";
import { AccountEvent } from "../src/models/accountEvent.model.js";
import { autoApproveRecruiter, approveRecruiter } from "../src/services/approval.service.js";
import { matchingCompanyForEmail } from "../src/services/signupSignals.service.js";
import { installCaptureMailer, outbox } from "./auth/helpers.js";

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
