import { beforeEach, describe, expect, it } from "vitest";

import { Company } from "../src/models/company.model.js";
import { Job } from "../src/models/job.model.js";
import { Recruiter } from "../src/models/recruiter.model.js";
import { seedDemoCatalog } from "../src/scripts/seed-demo-catalog.js";

describe("seedDemoCatalog", () => {
  beforeEach(async () => {
    await Promise.all([Recruiter.init(), Company.init()]);
  });

  it("creates a non-login owner, realistic companies, logos, and ninety jobs", async () => {
    const result = await seedDemoCatalog({});

    expect(result).toMatchObject({
      recruiterCreated: true,
      companiesCreated: 9,
      jobsCreated: 90,
      companiesTotal: 9,
      jobsTotal: 90,
    });

    const owner = await Recruiter.findOne({ email: "catalog@demo.invalid" }).select(
      "+passwordHash",
    );
    expect(owner?.passwordHash ?? null).toBeNull();
    expect(owner?.googleId ?? null).toBeNull();
    expect(owner?.status).toBe("active");

    const companies = await Company.find({ userId: owner?._id }).sort({ name: 1 });
    expect(companies).toHaveLength(9);
    expect(companies.map((company) => company.name).sort()).toEqual([
      "Accenture", "Amazon", "Cognizant", "Flipkart", "IBM", "Infosys", "Meta", "Microsoft", "Tata Consultancy Services",
    ]);
    expect(companies.every((company) => company.logo?.startsWith("/images/companies/"))).toBe(true);
  });

  it("is idempotent", async () => {
    await seedDemoCatalog({});
    const again = await seedDemoCatalog({});

    expect(again).toMatchObject({
      recruiterCreated: false,
      companiesCreated: 0,
      jobsCreated: 0,
      companiesTotal: 9,
      jobsTotal: 90,
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

    const result = await seedDemoCatalog({});

    expect(result).toMatchObject({ companiesTotal: 9, jobsTotal: 90 });
    expect(await Company.countDocuments({ name: /\(Demo\)$/ })).toBe(0);
    expect(await Job.countDocuments({ company: legacy._id })).toBe(0);
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
