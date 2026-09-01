import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";

import { Company } from "../src/models/company.model.js";
import { Job } from "../src/models/job.model.js";
import { Recruiter } from "../src/models/recruiter.model.js";
import { sweepOrphanedCompanies } from "../src/services/catalogOwnership.service.js";
import { approveRecruiter } from "../src/services/approval.service.js";
import { installCaptureMailer } from "./auth/helpers.js";

const deadOwnerId = new mongoose.Types.ObjectId();

async function activeRecruiter(email: string) {
  return Recruiter.create({
    email,
    fullName: email.split("@")[0]!,
    passwordHash: "x",
    emailVerifiedAt: new Date(),
    status: "active",
    designation: "Talent Acquisition Lead",
  });
}

async function company(name: string, userId: unknown) {
  return Company.create({
    name,
    description: "A catalogue employer",
    location: "Bengaluru",
    logo: "/images/companies/demo.svg",
    userId: userId ?? null,
  });
}

async function job(companyId: unknown, createdById: unknown) {
  return Job.create({
    title: `Role at ${String(companyId)}`,
    description: "d",
    requirements: [],
    salary: 10,
    experienceLevel: 1,
    location: "Bengaluru",
    jobType: "Full-time",
    department: "Engineering",
    position: "1",
    company: companyId,
    created_by: createdById ?? null,
  });
}

describe("sweepOrphanedCompanies", () => {
  beforeEach(async () => {
    await Promise.all([Recruiter.init(), Company.init(), Job.init()]);
  });

  it("re-homes orphaned companies onto active recruiters, jobs following", async () => {
    const owner = await activeRecruiter("owner@r.test");
    const orphan = await company("Orphaned Labs", deadOwnerId);
    const orphanJob = await job(orphan._id, deadOwnerId);
    const owned = await company("Kept Industries", owner._id);
    const ownedJob = await job(owned._id, owner._id);

    const result = await sweepOrphanedCompanies();

    expect(result.recruiters).toBe(1);
    expect(result.companiesAssigned).toBe(1);
    expect(result.jobsAssigned).toBe(1);

    // The orphan (and its job) now answer to the only active recruiter.
    const orphanAfter = await Company.findById(orphan._id);
    expect(String(orphanAfter?.userId)).toBe(String(owner._id));
    const orphanJobAfter = await Job.findById(orphanJob._id);
    expect(String(orphanJobAfter?.created_by)).toBe(String(owner._id));

    // The genuinely owned company was never in play.
    const ownedAfter = await Company.findById(owned._id);
    expect(String(ownedAfter?.userId)).toBe(String(owner._id));
    const ownedJobAfter = await Job.findById(ownedJob._id);
    expect(String(ownedJobAfter?.created_by)).toBe(String(owner._id));
  });

  it("assigns nothing when nothing is orphaned", async () => {
    const owner = await activeRecruiter("solo@r.test");
    const mine = await company("Mine Inc", owner._id);
    await job(mine._id, owner._id);

    const result = await sweepOrphanedCompanies();

    expect(result).toMatchObject({ recruiters: 1, orphansFound: 0, companiesAssigned: 0, jobsAssigned: 0 });
    const mineAfter = await Company.findById(mine._id);
    expect(String(mineAfter?.userId)).toBe(String(owner._id));
  });

  it("never rejects when there is nobody to assign to", async () => {
    await company("Nobody's Corp", deadOwnerId);

    // No active recruiters at all. A sweep with no pool resolves quietly and
    // touches nothing — its caller (the approval flow) must never be failed
    // by bookkeeping.
    await expect(sweepOrphanedCompanies()).resolves.toMatchObject({
      recruiters: 0,
      orphansFound: 1,
      companiesAssigned: 0,
    });
    const stillOrphaned = await Company.findOne({ name: "Nobody's Corp" });
    expect(String(stillOrphaned?.userId)).toBe(String(deadOwnerId));
  });
});

describe("approval triggers the sweep", () => {
  beforeEach(async () => {
    await Promise.all([Recruiter.init(), Company.init(), Job.init()]);
    await installCaptureMailer();
  });

  it("re-homes an orphan when a pending recruiter is approved", async () => {
    const orphan = await company("Waiting Corp", deadOwnerId);
    await job(orphan._id, deadOwnerId);

    const newcomer = await Recruiter.create({
      email: "newcomer@r.test",
      fullName: "Newcomer",
      passwordHash: "x",
      emailVerifiedAt: new Date(),
      status: "pending",
      designation: null,
    });

    await approveRecruiter(String(newcomer._id));

    // The sweep is fire-and-forget: the approval answers first, so wait for
    // the write rather than asserting synchronously.
    await vi.waitFor(async () => {
      const orphanAfter = await Company.findById(orphan._id);
      expect(String(orphanAfter?.userId)).toBe(String(newcomer._id));
    });
    const jobAfter = await Job.findOne({ company: orphan._id });
    expect(String(jobAfter?.created_by)).toBe(String(newcomer._id));
  });

  it("approves cleanly when no orphan exists, changing no ownership", async () => {
    const owner = await activeRecruiter("holder@r.test");
    const mine = await company("Held Corp", owner._id);

    const newcomer = await Recruiter.create({
      email: "clean@r.test",
      fullName: "Clean",
      passwordHash: "x",
      emailVerifiedAt: new Date(),
      status: "pending",
      designation: null,
    });

    await approveRecruiter(String(newcomer._id));

    const newcomerAfter = await Recruiter.findById(newcomer._id);
    expect(newcomerAfter?.status).toBe("active");
    const mineAfter = await Company.findById(mine._id);
    expect(String(mineAfter?.userId)).toBe(String(owner._id));
  });
});
