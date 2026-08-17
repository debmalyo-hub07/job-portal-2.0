import { beforeEach, describe, expect, it } from "vitest";

import { Company } from "../src/models/company.model.js";
import { Job } from "../src/models/job.model.js";
import { Recruiter } from "../src/models/recruiter.model.js";
import { seedDemoCatalog } from "../src/scripts/seed-demo-catalog.js";

describe("seedDemoCatalog", () => {
  beforeEach(async () => {
    await Promise.all([Recruiter.init(), Company.init()]);
  });

  it("creates a non-login owner, labelled companies, logos, and six jobs", async () => {
    const result = await seedDemoCatalog({});

    expect(result).toMatchObject({
      recruiterCreated: true,
      companiesCreated: 3,
      jobsCreated: 6,
      companiesTotal: 3,
      jobsTotal: 6,
    });

    const owner = await Recruiter.findOne({ email: "catalog@demo.invalid" }).select(
      "+passwordHash",
    );
    expect(owner?.passwordHash ?? null).toBeNull();
    expect(owner?.googleId ?? null).toBeNull();
    expect(owner?.status).toBe("active");

    const companies = await Company.find({ userId: owner?._id }).sort({ name: 1 });
    expect(companies).toHaveLength(3);
    expect(companies.every((company) => company.name.endsWith("(Demo)"))).toBe(true);
    // Relative, so the logo resolves against whichever origin serves the page.
    // An absolute URL here would be same-origin in production and cross-origin
    // from localhost, where the CSP's `img-src 'self'` drops it to initials.
    expect(companies.map((company) => company.logo).sort()).toEqual([
      "/images/companies/demo-common-thread.svg",
      "/images/companies/demo-fieldwork.svg",
      "/images/companies/demo-northstar.svg",
    ]);
  });

  it("is idempotent", async () => {
    await seedDemoCatalog({});
    const again = await seedDemoCatalog({});

    expect(again).toMatchObject({
      recruiterCreated: false,
      companiesCreated: 0,
      jobsCreated: 0,
      companiesTotal: 3,
      jobsTotal: 6,
    });
    expect(await Recruiter.countDocuments({ email: "catalog@demo.invalid" })).toBe(1);
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
