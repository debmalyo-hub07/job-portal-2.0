import { beforeEach, describe, expect, it } from "vitest";
import { CATALOGUE_COMPANIES, CATALOGUE_COMPANY_NAMES, JOB_DEPARTMENTS, JOB_LOCATIONS, catalogueListings } from "@jobportal/shared";

import { Company } from "../src/models/company.model.js";
import { Job } from "../src/models/job.model.js";
import { Application } from "../src/models/application.model.js";
import { Recruiter } from "../src/models/recruiter.model.js";
import { seedDemoCatalog } from "../src/scripts/seed-demo-catalog.js";

describe("seedDemoCatalog", () => {
  // Derived, not hardcoded: the roster is expected to grow, and a test that has
  // to be edited for every new employer gets edited without being read. The
  // floor guards the other direction — an empty catalogue must not pass.
  const COMPANY_COUNT = CATALOGUE_COMPANIES.length;
  const JOB_COUNT = catalogueListings().length;

  beforeEach(async () => {
    await Promise.all([Recruiter.init(), Company.init()]);
  });

  it("describes a roster worth seeding", () => {
    expect(COMPANY_COUNT).toBeGreaterThanOrEqual(20);
    expect(JOB_COUNT).toBeGreaterThanOrEqual(150);
  });

  it("creates a non-login owner, the whole roster, logos, and every listing", async () => {
    const result = await seedDemoCatalog({});

    expect(result).toMatchObject({
      recruiterCreated: true,
      companiesCreated: COMPANY_COUNT,
      jobsCreated: JOB_COUNT,
      companiesTotal: COMPANY_COUNT,
      jobsTotal: JOB_COUNT,
      jobsUpdated: 0,
      jobsRemoved: 0,
      applicationsRemoved: 0,
    });

    const owner = await Recruiter.findOne({ email: "catalog@demo.invalid" }).select(
      "+passwordHash",
    );
    expect(owner?.passwordHash ?? null).toBeNull();
    expect(owner?.googleId ?? null).toBeNull();
    expect(owner?.status).toBe("active");

    const companies = await Company.find({ userId: owner?._id }).sort({ name: 1 });
    expect(companies).toHaveLength(COMPANY_COUNT);
    expect(companies.map((company) => company.name).sort()).toEqual([...CATALOGUE_COMPANY_NAMES].sort());
    expect(companies.every((company) => company.logo?.startsWith("/images/companies/"))).toBe(true);
    expect(companies.every((company) => /^https:\/\//.test(company.website ?? ""))).toBe(true);
  });

  it("seeds every job somewhere the board's facets can reach", async () => {
    // The quiet failure this exists for: `location` and `department` are matched
    // by exact equality, so a job seeded in "Gurugram" or filed under a
    // department outside the enum is simply unreachable from the rail. Nothing
    // errors, nothing logs, and the board just comes back short.
    await seedDemoCatalog({});
    const jobs = await Job.find({}).select("location department jobType salary title");

    for (const job of jobs) {
      expect(JOB_LOCATIONS).toContain(job.location);
      expect(JOB_DEPARTMENTS).toContain(job.department);
      expect(job.salary).toBeGreaterThan(0);
    }
    // And the roster is genuinely spread, rather than every listing in one city.
    expect(new Set(jobs.map((job) => job.location)).size).toBeGreaterThanOrEqual(5);
  });

  it("gives no two employers the same set of role titles", async () => {
    // Nine companies posting the same ten titles was the tell that the previous
    // catalogue was generated rather than curated.
    await seedDemoCatalog({});
    const owner = await Recruiter.findOne({ email: "catalog@demo.invalid" });
    const companies = await Company.find({ userId: owner?._id }).select("_id");
    const signatures = await Promise.all(
      companies.map(async (company) => {
        const titles = await Job.find({ company: company._id }).select("title");
        return titles.map((job) => job.title).sort().join("|");
      }),
    );
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  it("withdraws a seeded listing the catalogue no longer describes, and its applications", async () => {
    // Creating without reconciling is how a database seeded from an older roster
    // keeps both: the stale row still matches on (company, title), so the
    // idempotency check skips it and it stays on the board forever.
    await seedDemoCatalog({});
    const owner = await Recruiter.findOne({ email: "catalog@demo.invalid" });
    const company = await Company.findOne({ userId: owner?._id });
    const retired = await Job.create({
      title: "Role The Catalogue Dropped",
      description: "A listing from an earlier roster",
      requirements: [],
      salary: 12,
      experienceLevel: 2,
      location: "Bengaluru",
      jobType: "Full-time",
      position: "1 opening",
      remote: false,
      company: company?._id,
      created_by: owner?._id,
    });
    const application = await Application.create({ job: retired._id, applicant: owner?._id });

    const result = await seedDemoCatalog({ allowNonDemoJobs: true });

    expect(result).toMatchObject({ jobsRemoved: 1, applicationsRemoved: 1, jobsTotal: JOB_COUNT });
    expect(await Job.findById(retired._id)).toBeNull();
    // An application whose job is gone renders as a blank row, not an error.
    expect(await Application.findById(application._id)).toBeNull();
  });

  it("brings an existing listing up to the catalogue instead of skipping it", async () => {
    // Title is the identity, so a listing that survives a roster change would
    // otherwise keep whatever band and department it was first seeded with, and
    // the seed would report success over stale figures.
    await seedDemoCatalog({});
    const [first] = catalogueListings();
    if (!first) throw new Error("expected the catalogue to describe at least one listing");
    const target = await Job.findOne({ title: first.title });
    if (!target) throw new Error("expected the first catalogue listing to have been seeded");
    await Job.updateOne({ _id: target._id }, { $set: { salary: 1, description: "stale copy", remote: !target.remote } });

    const result = await seedDemoCatalog({});

    expect(result.jobsUpdated).toBe(1);
    expect(result.jobsCreated).toBe(0);
    const healed = await Job.findById(target._id);
    expect(healed?.salary).toBe(target.salary);
    expect(healed?.description).toBe(target.description);
    expect(healed?.remote).toBe(target.remote);
  });

  it("stamps listings across weeks, newest slots on different employers", async () => {
    // Mongoose sets createdAt itself on insert, so the stagger only lands if the
    // seed writes it back with timestamps disabled. If that ever regresses every
    // listing shares one instant and the landing page fills with one employer.
    await seedDemoCatalog({});
    const newest = await Job.find({}).sort({ createdAt: -1 }).limit(6).populate<{ company: { name: string } }>("company", "name");
    const employers = new Set(newest.map((job) => job.company.name));
    expect(employers.size).toBe(6);

    const [oldest] = await Job.find({}).sort({ createdAt: 1 }).limit(1);
    if (!oldest) throw new Error("expected seeded jobs");
    const spanDays = (Date.now() - new Date(oldest.createdAt).getTime()) / 86_400_000;
    expect(spanDays).toBeGreaterThan(14);
  });

  it("does not re-stamp a listing's posting date on a later run", async () => {
    await seedDemoCatalog({});
    const before = await Job.findOne({}).sort({ createdAt: 1 });
    if (!before) throw new Error("expected seeded jobs");
    await seedDemoCatalog({});
    const after = await Job.findById(before._id);
    expect(after?.createdAt).toBeDefined();
    expect(new Date(after?.createdAt ?? 0).getTime()).toBe(new Date(before.createdAt).getTime());
  });

  it("is idempotent", async () => {
    await seedDemoCatalog({});
    const again = await seedDemoCatalog({});

    expect(again).toMatchObject({
      recruiterCreated: false,
      companiesCreated: 0,
      jobsCreated: 0,
      jobsUpdated: 0,
      jobsRemoved: 0,
      companiesTotal: COMPANY_COUNT,
      jobsTotal: JOB_COUNT,
    });
    expect(await Recruiter.countDocuments({ email: "catalog@demo.invalid" })).toBe(1);
  });

  it("replaces the original (Demo) preview catalog instead of stacking on top of it", async () => {
    const owner = await Recruiter.create({
      email: "catalog@demo.invalid",
      fullName: "Cairn Demo Catalog",
      emailVerifiedAt: new Date(),
      status: "active",
    });
    const legacy = await Company.create({
      name: "Northstar Labs (Demo)",
      userId: owner._id,
      logo: "/images/companies/demo-northstar.svg",
    });
    await Job.create({
      title: "Senior Product Engineer",
      description: "A legacy preview listing",
      requirements: [],
      salary: 34,
      experienceLevel: 5,
      location: "Bengaluru",
      jobType: "Full-time",
      position: "2 openings",
      remote: true,
      company: legacy._id,
      created_by: owner._id,
    });

    const legacyJob = await Job.findOne({ company: legacy._id });
    const orphanCandidate = await Application.create({ job: legacyJob?._id, applicant: owner._id });

    const result = await seedDemoCatalog({});

    expect(result).toMatchObject({ companiesTotal: COMPANY_COUNT, jobsTotal: JOB_COUNT });
    expect(await Company.countDocuments({ name: /\(Demo\)$/ })).toBe(0);
    expect(await Job.countDocuments({ company: legacy._id })).toBe(0);
    // The legacy sweep runs before the reconciliation pass, so it has to cascade
    // its own applications — otherwise this row survives pointing at nothing.
    expect(result.applicationsRemoved).toBe(1);
    expect(await Application.findById(orphanCandidate._id)).toBeNull();
  });

  it("refuses to mix demo jobs into a populated real catalog", async () => {
    const recruiter = await Recruiter.create({
      email: "real@example.com",
      fullName: "Real Recruiter",
      emailVerifiedAt: new Date(),
      status: "active",
    });
    const company = await Company.create({ name: "Real Company", userId: recruiter._id });
    await Job.create({
      title: "Real Role",
      description: "A real listing",
      requirements: [],
      salary: 10,
      experienceLevel: 2,
      location: "Delhi",
      jobType: "Full-time",
      position: "1 opening",
      remote: false,
      company: company._id,
      created_by: recruiter._id,
    });

    await expect(seedDemoCatalog({})).rejects.toThrow(
      /already contains 1 non-demo job/i,
    );
    expect(await Recruiter.countDocuments({ email: "catalog@demo.invalid" })).toBe(0);
  });

  it("will not reuse the reserved owner if it has credentials", async () => {
    await Recruiter.create({
      email: "catalog@demo.invalid",
      fullName: "Not Demo",
      passwordHash: "credential-sentinel",
      emailVerifiedAt: new Date(),
      status: "active",
    });

    await expect(seedDemoCatalog({})).rejects.toThrow(
      /attached to a login identity/i,
    );
  });
});
