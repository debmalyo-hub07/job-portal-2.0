import { beforeEach, describe, expect, it } from "vitest";

import { Company } from "../src/models/company.model.js";
import { Job } from "../src/models/job.model.js";
import { Recruiter } from "../src/models/recruiter.model.js";
import { seedDemoCatalog } from "../src/scripts/seed-demo-catalog.js";

const WEB_BASE_URL = "https://cairn.example";

describe("seedDemoCatalog", () => {
  beforeEach(async () => {
    await Promise.all([Recruiter.init(), Company.init()]);
  });

  it("creates a non-login owner, labelled companies, logos, and six jobs", async () => {
    const result = await seedDemoCatalog({ webBaseUrl: WEB_BASE_URL });

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
    expect(companies.every((company) => company.logo?.startsWith(`${WEB_BASE_URL}/images/companies/`))).toBe(true);
  });

  it("is idempotent", async () => {
    await seedDemoCatalog({ webBaseUrl: WEB_BASE_URL });
    const again = await seedDemoCatalog({ webBaseUrl: WEB_BASE_URL });

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

    await expect(seedDemoCatalog({ webBaseUrl: WEB_BASE_URL })).rejects.toThrow(
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

    await expect(seedDemoCatalog({ webBaseUrl: WEB_BASE_URL })).rejects.toThrow(
      /attached to a login identity/i,
    );
  });
});
