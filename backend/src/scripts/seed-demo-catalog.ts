import mongoose, { type HydratedDocument } from "mongoose";
import { CATALOGUE_COMPANIES, catalogueListings } from "@jobportal/shared";

import { mongoDatabaseName, env } from "../config/env.js";
import { Application } from "../models/application.model.js";
import { Company, type CompanyDocument } from "../models/company.model.js";
import { Job } from "../models/job.model.js";
import { Recruiter } from "../models/recruiter.model.js";

const CATALOG_OWNER_EMAIL = "catalog@demo.invalid";

export type SeedDemoCatalogInput = { allowNonDemoJobs?: boolean };
export type SeedDemoCatalogResult = {
  recruiterCreated: boolean;
  companiesCreated: number;
  jobsCreated: number;
  jobsUpdated: number;
  jobsRemoved: number;
  applicationsRemoved: number;
  companiesTotal: number;
  jobsTotal: number;
};

/** Creates a realistic, clearly labelled catalogue for an empty marketplace. */
export async function seedDemoCatalog(input: SeedDemoCatalogInput): Promise<SeedDemoCatalogResult> {
  const existingOwner = await Recruiter.findOne({ email: CATALOG_OWNER_EMAIL }).select("+passwordHash");
  if (existingOwner && (existingOwner.passwordHash || existingOwner.googleId)) throw new Error("The reserved demo catalog owner is attached to a login identity; refusing to use it.");

  const nonDemoJobs = await Job.countDocuments(existingOwner ? { created_by: mongoose.trusted({ $ne: existingOwner._id }) } : {});
  if (nonDemoJobs > 0 && !input.allowNonDemoJobs) throw new Error(`Refusing to seed demo jobs into a database that already contains ${nonDemoJobs} non-demo job(s).`);

  let owner = existingOwner;
  let recruiterCreated = false;
  if (!owner) {
    owner = await Recruiter.create({ email: CATALOG_OWNER_EMAIL, fullName: "Cairn Marketplace Catalogue", passwordHash: null, googleId: null, emailVerifiedAt: new Date(), status: "active", designation: "Seeded catalogue owner" });
    recruiterCreated = true;
  }

  let legacyApplicationsRemoved = 0;

  // Replace the original preview catalogue when upgrading an existing local
  // database. The reserved owner is non-login and uniquely identifies seeded
  // content, so this cannot touch recruiter-owned listings.
  const legacyCompanies = await Company.find({ userId: owner._id, name: /\(Demo\)$/i }).select("_id");
  if (legacyCompanies.length > 0) {
    // `mongoose.trusted` is required on both: sanitizeFilter is global, so a
    // bare { $in } is compared as a literal and fails to cast against an
    // ObjectId path — the upgrade threw instead of cleaning up.
    const legacyIds = mongoose.trusted({ $in: legacyCompanies.map((company) => company._id) });
    // Applications first, and by job id rather than company: this cleanup runs
    // before the reconciliation pass below, so a preview listing someone had
    // applied to would leave its application behind pointing at a job that no
    // longer exists — a blank row in that seeker's list, with nothing to
    // explain it.
    const legacyJobs = await Job.find({ created_by: owner._id, company: legacyIds }).select("_id");
    if (legacyJobs.length > 0) {
      const legacyJobIds = mongoose.trusted({ $in: legacyJobs.map((job) => job._id) });
      legacyApplicationsRemoved = (await Application.deleteMany({ job: legacyJobIds })).deletedCount ?? 0;
      await Job.deleteMany({ _id: legacyJobIds, created_by: owner._id });
    }
    await Company.deleteMany({ _id: legacyIds, userId: owner._id });
  }

  const companyByKey = new Map<string, HydratedDocument<CompanyDocument>>();
  let companiesCreated = 0;
  for (const definition of CATALOGUE_COMPANIES) {
    let company = await Company.findOne({ userId: owner._id, name: definition.name });
    if (!company) {
      company = await Company.create({ name: definition.name, description: definition.description, location: definition.location, logo: definition.logo, userId: owner._id });
      companiesCreated += 1;
    } else {
      company.description = definition.description;
      company.location = definition.location;
      company.logo = definition.logo;
      await company.save();
    }
    companyByKey.set(definition.key, company);
  }

  const listings = catalogueListings();
  const seededAt = new Date();

  let jobsCreated = 0;
  let jobsUpdated = 0;
  for (const listing of listings) {
    const company = companyByKey.get(listing.companyKey);
    if (!company) throw new Error(`Missing seeded company ${listing.companyKey}`);
    const fields = {
      description: listing.description,
      requirements: [...listing.requirements],
      salary: listing.salary,
      experienceLevel: listing.experienceLevel,
      location: listing.location,
      jobType: listing.jobType,
      department: listing.department,
      position: listing.position,
      remote: listing.remote,
    };

    const existing = await Job.findOne({ created_by: owner._id, company: company._id, title: listing.title });
    if (!existing) {
      // The posting date is written at creation, with `timestamps: false` so
      // Mongoose does not stamp over it. It cannot be applied afterwards:
      // `timestamps: true` makes `createdAt` immutable, and an update to an
      // immutable path is dropped silently — the stagger appeared to work and
      // every listing still shared one instant.
      //
      // Set on create only. The board sorts by it, so re-stamping on each run
      // would reshuffle the board and make every row look permanently drifted.
      const postedAt = new Date(seededAt.getTime() - listing.postedHoursAgo * 3_600_000);
      const job = new Job({ title: listing.title, ...fields, company: company._id, created_by: owner._id, createdAt: postedAt, updatedAt: postedAt });
      await job.save({ timestamps: false });
      jobsCreated += 1;
      continue;
    }

    // Existing rows are brought up to the catalogue rather than skipped. Title is
    // the identity here, so a listing that survives a roster change but has a new
    // band or department would otherwise keep the old one indefinitely — the seed
    // would report success while the board showed stale figures. Only saved when
    // something actually differs, so a second run still reports zero work.
    const drifted = Object.entries(fields).filter(([key, value]) => {
      const current = existing.get(key);
      return Array.isArray(value) ? JSON.stringify(current) !== JSON.stringify(value) : current !== value;
    });
    if (drifted.length > 0) {
      existing.set(fields);
      await existing.save();
      jobsUpdated += 1;
    }
  }

  // Withdraw seeded listings the catalogue no longer describes.
  //
  // Creation alone is not enough to upgrade a database that was seeded from an
  // earlier roster: the old rows keep their (company, title) pair, so the check
  // above skips them and they sit on the board forever. Scoped to this owner's
  // jobs, so a recruiter's listing can never be caught by it — and applications
  // pointing at a removed job go with it, because an application whose job is
  // gone renders as a blank row in the seeker's list rather than an error.
  const wanted = new Map<string, Set<string>>();
  for (const listing of listings) {
    const company = companyByKey.get(listing.companyKey);
    if (!company) continue;
    const id = String(company._id);
    if (!wanted.has(id)) wanted.set(id, new Set());
    wanted.get(id)?.add(listing.title);
  }
  const seeded = await Job.find({ created_by: owner._id }).select("_id company title");
  const stale = seeded.filter((job) => !wanted.get(String(job.company))?.has(job.title)).map((job) => job._id);
  let jobsRemoved = 0;
  let applicationsRemoved = legacyApplicationsRemoved;
  if (stale.length > 0) {
    const staleIds = mongoose.trusted({ $in: stale });
    applicationsRemoved += (await Application.deleteMany({ job: staleIds })).deletedCount ?? 0;
    jobsRemoved = (await Job.deleteMany({ _id: staleIds, created_by: owner._id })).deletedCount ?? 0;
  }

  return {
    recruiterCreated,
    companiesCreated,
    jobsCreated,
    jobsUpdated,
    jobsRemoved,
    applicationsRemoved,
    companiesTotal: await Company.countDocuments({ userId: owner._id }),
    jobsTotal: await Job.countDocuments({ created_by: owner._id }),
  };
}

const invokedDirectly = /seed-demo-catalog\.(ts|js)$/.test(process.argv[1] ?? "");
if (invokedDirectly) {
  await import("dotenv/config");
  const config = env();
  const database = mongoDatabaseName(config.MONGO_URI) ?? "test";
  const confirmationIndex = process.argv.indexOf("--confirm-database");
  const confirmedDatabase = confirmationIndex === -1 ? undefined : process.argv[confirmationIndex + 1];
  if (confirmedDatabase !== database) { console.error(`Refusing to seed. Re-run with --confirm-database ${database} after verifying that database is the intended target.`); process.exit(1); }
  await mongoose.connect(config.MONGO_URI);
  try {
    const result = await seedDemoCatalog({ allowNonDemoJobs: process.argv.includes("--allow-nonempty") });
    console.log(`catalog ready: ${result.companiesTotal} companies, ${result.jobsTotal} jobs (created ${result.companiesCreated} companies and ${result.jobsCreated} jobs; updated ${result.jobsUpdated} jobs; removed ${result.jobsRemoved} stale jobs and ${result.applicationsRemoved} application(s))`);
  } finally { await mongoose.disconnect(); }
}
