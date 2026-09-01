import { beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { CATALOGUE_COMPANIES } from "@jobportal/shared";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Company } from "../src/models/company.model.js";
import { Job } from "../src/models/job.model.js";
import { Recruiter } from "../src/models/recruiter.model.js";
import {
  assignCatalogOwnership,
  designationsFor,
  restoreSnapshot,
} from "../src/scripts/assign-catalog-ownership.js";
import { planAssignment } from "../src/services/catalogOwnership.service.js";

describe("planAssignment", () => {
  const recruiters = [
    { id: "r1", email: "one@x.test" },
    { id: "r2", email: "two@x.test" },
    { id: "r3", email: "three@x.test" },
  ];

  const companies = [
    { id: "c1", name: "A", jobCount: 9 },
    { id: "c2", name: "B", jobCount: 8 },
    { id: "c3", name: "C", jobCount: 8 },
    { id: "c4", name: "D", jobCount: 7 },
    { id: "c5", name: "E", jobCount: 6 },
    { id: "c6", name: "F", jobCount: 6 },
    { id: "c7", name: "G", jobCount: 5 },
  ];

  it("assigns every company exactly once", () => {
    const plan = planAssignment(companies, recruiters, 42);
    const given = plan.recruiters.flatMap((entry) => entry.companies.map((company) => company.id));
    expect(given.sort()).toEqual([...companies.map((company) => company.id)].sort());
  });

  it("balances the workload within one company's worth of listings", () => {
    // Four recruiters-to-be should not discover one of them owns the whole
    // catalogue. Greedy largest-first keeps the spread to a single employer.
    const plan = planAssignment(companies, recruiters, 42);
    const loads = plan.recruiters.map((entry) => entry.jobCount);
    expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(
      Math.max(...companies.map((company) => company.jobCount)),
    );
  });

  it("is deterministic for a given seed and shuffles across seeds", () => {
    const a = planAssignment(companies, recruiters, 7);
    const b = planAssignment(companies, recruiters, 7);
    expect(a).toEqual(b);

    // Different seeds need not always differ, but with 7 companies over 3
    // recruiters the assignment space is far larger than one arrangement.
    const c = planAssignment(companies, recruiters, 8);
    const layout = (plan: ReturnType<typeof planAssignment>) =>
      plan.recruiters.map((entry) => entry.companies.map((company) => company.id).join("|")).join(";");
    expect(layout(c)).not.toEqual(layout(a));
  });

  it("keeps every recruiter in play when there is enough to go around", () => {
    const plan = planAssignment(companies, recruiters, 42);
    for (const entry of plan.recruiters) {
      expect(entry.companies.length).toBeGreaterThan(0);
    }
  });
});

describe("designationsFor", () => {
  it("fills only empty designations, in order, cycling the pool", () => {
    const filled = designationsFor([
      { id: "r1", designation: null },
      { id: "r2", designation: "Already Chosen" },
      { id: "r3", designation: null },
      { id: "r4", designation: null },
      { id: "r5", designation: null },
    ]);
    expect(filled.map((entry) => entry.id)).toEqual(["r1", "r3", "r4", "r5"]);
    expect(new Set(filled.map((entry) => entry.designation)).size).toBe(filled.length);
  });
});

describe("assignCatalogOwnership", () => {
  // A mini catalogue: real roster names so the website backfill exercises its
  // source of truth, and job counts small enough to read at a glance.
  const ROSTER = CATALOGUE_COMPANIES.slice(0, 4);
  const JOBS_PER_COMPANY = [3, 2, 2, 1] as const;

  const deadOwnerId = new mongoose.Types.ObjectId();
  let snapshotPath: string;
  let scratchDir: string;

  beforeEach(async () => {
    await Promise.all([Recruiter.init(), Company.init(), Job.init()]);
    scratchDir = mkdtempSync(join(tmpdir(), "ownership-"));
    snapshotPath = join(scratchDir, "snapshot.json");
  });

  it("moves an orphaned catalogue onto the active recruiters, company first", async () => {
    const keepDesignation = await Recruiter.create({
      email: "keeps@x.test", fullName: "Keeps Title", passwordHash: "x", emailVerifiedAt: new Date(),
      status: "active", designation: "Owner Chosen Title",
    });
    const suspended = await Recruiter.create({
      email: "suspended@x.test", fullName: "Suspended One", passwordHash: "x", emailVerifiedAt: new Date(),
      status: "suspended", designation: null,
    });
    const actives = await Recruiter.create([
      { email: "a@x.test", fullName: "Ana", passwordHash: "x", emailVerifiedAt: new Date(), status: "active", designation: null },
      { email: "b@x.test", fullName: "Ben", passwordHash: "x", emailVerifiedAt: new Date(), status: "active", designation: null },
    ]);

    const companies = await Company.create(
      ROSTER.map((definition, index) => ({
        name: definition.name, description: definition.description, location: definition.location,
        logo: definition.logo, userId: deadOwnerId,
      })),
    );
    for (const [index, company] of companies.entries()) {
      for (let j = 0; j < JOBS_PER_COMPANY[index]!; j += 1) {
        await Job.create({
          title: `Role ${index}-${j}`, description: "d", requirements: [], salary: 10,
          experienceLevel: 1, location: "Bengaluru", jobType: "Full-time", department: "Engineering",
          position: "1", company: company._id, created_by: deadOwnerId,
        });
      }
    }

    const result = await assignCatalogOwnership({ write: true, snapshotPath });

    // Every company and every job now answers to an active recruiter.
    expect(result.orphansRemaining).toBe(0);
    const after = await Company.find({});
    // Every ACTIVE recruiter is a legitimate recipient — including the one that
    // arrived with its own designation. Only the suspended one is out of play.
    const activeIds = new Set([keepDesignation, ...actives].map((recruiter) => String(recruiter._id)));
    for (const company of after) expect(activeIds.has(String(company.userId))).toBe(true);
    for (const company of after) {
      expect(company.website).toBe(ROSTER.find((definition) => definition.name === company.name)?.website);
      const jobs = await Job.find({ company: company._id });
      for (const job of jobs) expect(String(job.created_by)).toBe(String(company.userId));
    }

    // Suspended recruiters receive nothing; the owner-chosen designation is
    // still exactly what its owner set.
    const suspendedAfter = await Recruiter.findById(suspended._id);
    expect(suspendedAfter?.designation).toBeNull();
    const kept = await Recruiter.findById(keepDesignation._id);
    expect(kept?.designation).toBe("Owner Chosen Title");
    for (const recruiter of actives) {
      const afterRecruiter = await Recruiter.findById(recruiter._id);
      expect(afterRecruiter?.designation).toBeTruthy();
    }

    // The snapshot recorded the world before the migration, which is what
    // makes the run reversible rather than merely apologised for.
    expect(result.snapshotPath).toBe(snapshotPath);
    const snapshot = JSON.parse((await import("node:fs")).readFileSync(snapshotPath, "utf8"));
    expect(snapshot.companies).toHaveLength(ROSTER.length);
    expect(snapshot.companies.every((company: { userId: string }) => company.userId === String(deadOwnerId))).toBe(true);
    expect(snapshot.jobs.every((job: { created_by: string }) => job.created_by === String(deadOwnerId))).toBe(true);
  });

  it("is a no-op the second time", async () => {
    await Recruiter.create({
      email: "a@x.test", fullName: "Ana", passwordHash: "x", emailVerifiedAt: new Date(),
      status: "active", designation: "Talent Acquisition Lead",
    });
    const [definition] = ROSTER;
    const company = await Company.create({
      name: definition!.name, description: "d", location: definition!.location, logo: definition!.logo,
      website: definition!.website, userId: new mongoose.Types.ObjectId(),
    });
    await Job.create({
      title: "Role", description: "d", requirements: [], salary: 10, experienceLevel: 1,
      location: "Bengaluru", jobType: "Full-time", department: "Engineering", position: "1",
      company: company._id, created_by: company.userId,
    });

    const first = await assignCatalogOwnership({ write: true, snapshotPath });
    expect(first.planned).toBe(true);
    const second = await assignCatalogOwnership({ write: true, snapshotPath: join(scratchDir, "second.json") });
    expect(second.planned).toBe(false);
    expect(second.orphansRemaining).toBe(0);
  });

  it("restores every field a snapshot recorded", async () => {
    const recruiter = await Recruiter.create({
      email: "a@x.test", fullName: "Ana", passwordHash: "x", emailVerifiedAt: new Date(),
      status: "active", designation: null,
    });
    const [definition] = ROSTER;
    const company = await Company.create({
      name: definition!.name, description: "d", location: definition!.location, logo: definition!.logo,
      userId: deadOwnerId,
    });
    await Job.create({
      title: "Role", description: "d", requirements: [], salary: 10, experienceLevel: 1,
      location: "Bengaluru", jobType: "Full-time", department: "Engineering", position: "1",
      company: company._id, created_by: deadOwnerId,
    });

    await assignCatalogOwnership({ write: true, snapshotPath });
    await restoreSnapshot(snapshotPath);

    const companyAfter = await Company.findById(company._id);
    expect(String(companyAfter?.userId)).toBe(String(deadOwnerId));
    expect(companyAfter?.website ?? null).toBeNull();
    const jobAfter = await Job.findOne({ company: company._id });
    expect(String(jobAfter?.created_by)).toBe(String(deadOwnerId));
    const recruiterAfter = await Recruiter.findById(recruiter._id);
    expect(recruiterAfter?.designation ?? null).toBeNull();

    rmSync(scratchDir, { recursive: true, force: true });
  });
});
