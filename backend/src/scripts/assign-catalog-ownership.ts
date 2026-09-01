import mongoose from "mongoose";
import { CATALOGUE_COMPANIES } from "@jobportal/shared";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import { mongoDatabaseName, env } from "../config/env.js";
import { Company } from "../models/company.model.js";
import { Job } from "../models/job.model.js";
import { Recruiter } from "../models/recruiter.model.js";
import {
  applyAssignment,
  orphanedAmong,
  planAssignment,
} from "../services/catalogOwnership.service.js";

/**
 * One-time ownership migration for the seeded catalogue.
 *
 * `seed:catalog` parks all 27 companies and 198 jobs under one reserved owner
 * (`catalog@demo.invalid`). That owner was deleted by hand in production, which
 * left every `Company.userId` and every `Job.created_by` pointing at a row that
 * no longer exists: no workspace lists them, no job page can name a poster, and
 * an application has no inbox to land in. This script hands the catalogue to
 * the real, active recruiters instead — the company is the unit of assignment,
 * so a recruiter owns an employer and every role under it, which is the shape
 * the workspace, the approval queue and the applicant queue all assume.
 *
 * Company-level details come from the same source the seed reads
 * (`CATALOGUE_COMPANIES`): the website backfill here and the seed's own write
 * can never disagree, because there is one list.
 *
 * Dry-run by default. A real run needs `--confirm-database <name>` (the seed's
 * guard — the databases share one cluster, and the wrong one is one flag away),
 * writes a snapshot of every field it touches before it touches it, and can
 * put everything back with `--restore <snapshot>`. Re-running after success is
 * a no-op: once no company's owner is missing, there is nothing to assign.
 *
 * The planner, the orphan filter and the assignment write live in
 * `catalogOwnership.service.ts` since P2 of the console automation program —
 * the approval flow sweeps orphans through the same code this script runs.
 */

/** Professional bylines for the catalogue's owners, assigned in signup order. */
const DESIGNATIONS = [
  "Talent Acquisition Lead",
  "Senior Technical Recruiter",
  "Head of Talent",
  "Recruiting Partner",
] as const;

/**
 * A designation for every recruiter that never chose one, in signup order.
 * Existing designations are left exactly as their owners set them — this
 * migration fills the byline on job pages, it does not rewrite a person's
 * chosen title behind their back.
 */
export function designationsFor(
  recruiters: { id: string; designation: string | null }[],
): { id: string; designation: string }[] {
  let next = 0;
  return recruiters
    .filter((recruiter) => recruiter.designation === null)
    .map((recruiter) => ({ id: recruiter.id, designation: DESIGNATIONS[next++ % DESIGNATIONS.length]! }));
}

export type AssignResult = {
  database: string;
  dryRun: boolean;
  planned: boolean;
  recruiters: { email: string; designation: string | null; companies: number; jobs: number }[];
  orphansRemaining: number;
  websitesBackfilled: number;
  snapshotPath: string | null;
};

type Snapshot = {
  database: string;
  at: string;
  companies: { _id: string; userId: string | null; website: string | null }[];
  jobs: { _id: string; created_by: string | null }[];
  recruiters: { _id: string; designation: string | null }[];
};

function snapshotPath(database: string): string {
  // From backend/ the repo root's .tmp/ is ../.tmp — gitignored scratch that
  // survives the run. Anywhere else, a local .tmp/.
  const root = basename(process.cwd()) === "backend" ? resolve(process.cwd(), "..") : process.cwd();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return resolve(root, ".tmp", `ownership-snapshot-${database}-${stamp}.json`);
}

/** Everything the migration changes, read back before anything is written. */
export async function readSnapshot(
  database: string,
  companyIds: mongoose.Types.ObjectId[],
  recruiterIds: string[],
): Promise<Snapshot> {
  // `mongoose.trusted` wraps each `$in` clause whole: sanitizeFilter is global,
  // and a bare `{ $in }` is compared as a literal and fails to cast.
  const companyClause = mongoose.trusted({ $in: companyIds });
  const companies = await Company.find({ _id: companyClause }).select("userId website");
  const jobs = await Job.find({ company: companyClause }).select("created_by");
  const recruiters = await Recruiter.find({ _id: mongoose.trusted({ $in: recruiterIds }) }).select("designation");
  return {
    database,
    at: new Date().toISOString(),
    companies: companies.map((company) => ({
      _id: String(company._id),
      userId: company.userId ? String(company.userId) : null,
      website: company.website ?? null,
    })),
    jobs: jobs.map((job) => ({ _id: String(job._id), created_by: job.created_by ? String(job.created_by) : null })),
    recruiters: recruiters.map((recruiter) => ({
      _id: String(recruiter._id),
      designation: recruiter.designation ?? null,
    })),
  };
}

export async function restoreSnapshot(path: string): Promise<void> {
  const snapshot = JSON.parse(readFileSync(path, "utf8")) as Snapshot;
  for (const company of snapshot.companies) {
    await Company.updateOne({ _id: company._id }, { $set: { userId: company.userId, website: company.website } });
  }
  for (const job of snapshot.jobs) {
    await Job.updateOne({ _id: job._id }, { $set: { created_by: job.created_by } });
  }
  for (const recruiter of snapshot.recruiters) {
    await Recruiter.updateOne({ _id: recruiter._id }, { $set: { designation: recruiter.designation } });
  }
  console.log(
    `restored ${snapshot.companies.length} companies, ${snapshot.jobs.length} jobs and ${snapshot.recruiters.length} recruiters from ${path}`,
  );
}

export async function assignCatalogOwnership(options: {
  write: boolean;
  seed?: number;
  snapshotPath?: string;
}): Promise<AssignResult> {
  const seed = options.seed ?? 20260831;

  // Active recruiters, oldest account first — the order designations and the
  // plan's tie-breaks both key off, so a re-run reads the same way.
  const recruiters = await Recruiter.find({ status: "active" }).sort({ createdAt: 1 });
  if (recruiters.length === 0) throw new Error("No active recruiters to assign the catalogue to.");

  const recruiterIds = new Set(recruiters.map((recruiter) => String(recruiter._id)));
  const allCompanies = await Company.find({});
  // Orphaned means no recruiter row answers — not "owned by someone else",
  // which is a real recruiter's company and none of this migration's business.
  const orphaned = orphanedAmong(allCompanies, recruiterIds);

  const websiteByCatalogueName = new Map(CATALOGUE_COMPANIES.map((definition) => [definition.name, definition.website]));
  const websitesToBackfill = allCompanies
    .filter((company) => !company.website && websiteByCatalogueName.has(company.name))
    .map((company) => ({ id: String(company._id), name: company.name, website: websiteByCatalogueName.get(company.name)! }));

  const jobCounts = new Map<string, number>();
  for (const company of orphaned) {
    jobCounts.set(String(company._id), await Job.countDocuments({ company: company._id }));
  }

  const plan = planAssignment(
    orphaned.map((company) => ({ id: String(company._id), name: company.name, jobCount: jobCounts.get(String(company._id)) ?? 0 })),
    recruiters.map((recruiter) => ({ id: String(recruiter._id), email: recruiter.email })),
    seed,
  );
  const designations = designationsFor(recruiters.map((recruiter) => ({ id: String(recruiter._id), designation: recruiter.designation ?? null })));

  if (!options.write) {
    const remaining = orphaned.length;
    return {
      database: mongoose.connection.name,
      dryRun: true,
      planned: remaining > 0 || websitesToBackfill.length > 0 || designations.length > 0,
      recruiters: plan.recruiters.map((entry) => ({
        email: entry.email,
        designation: designations.find((d) => d.id === entry.recruiterId)?.designation ?? null,
        companies: entry.companies.length,
        jobs: entry.jobCount,
      })),
      orphansRemaining: remaining,
      websitesBackfilled: 0,
      snapshotPath: null,
    };
  }

  // Snapshot every field about to change, then write. The snapshot is the whole
  // reversibility story: restore puts each field back exactly as it was.
  const snapshot = await readSnapshot(
    mongoose.connection.name,
    orphaned.map((company) => company._id as mongoose.Types.ObjectId),
    recruiters.map((recruiter) => String(recruiter._id)),
  );
  const path = options.snapshotPath ?? snapshotPath(mongoose.connection.name);
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(snapshot, null, 2));

  // One implementation of the write semantics: the company changes hands and
  // every job under it follows (the queue, the workspace and the applicant
  // routing all resolve an application's owner through job.created_by).
  await applyAssignment(plan);
  for (const company of websitesToBackfill) {
    await Company.updateOne({ _id: company.id }, { $set: { website: company.website } });
  }
  for (const designation of designations) {
    // Guarded on null so a re-run after an owner edits their profile never
    // reverts their choice.
    await Recruiter.updateOne({ _id: designation.id, designation: null }, { $set: { designation: designation.designation } });
  }

  // Post-write verification, not a returned promise: the counts below are what
  // the operator reads to trust the run.
  const after = await Company.find({});
  const orphansRemaining = after.filter((company) => !recruiterIds.has(String(company.userId))).length;

  return {
    database: mongoose.connection.name,
    dryRun: false,
    planned: orphaned.length > 0 || websitesToBackfill.length > 0 || designations.length > 0,
    recruiters: plan.recruiters.map((entry) => ({
      email: entry.email,
      designation: designations.find((d) => d.id === entry.recruiterId)?.designation ?? null,
      companies: entry.companies.length,
      jobs: entry.jobCount,
    })),
    orphansRemaining,
    websitesBackfilled: websitesToBackfill.length,
    snapshotPath: path,
  };
}

const invokedDirectly = /assign-catalog-ownership\.(ts|js)$/.test(process.argv[1] ?? "");
if (invokedDirectly) {
  await import("dotenv/config");
  const config = env();
  const database = mongoDatabaseName(config.MONGO_URI) ?? "test";

  const restoreIndex = process.argv.indexOf("--restore");
  if (restoreIndex !== -1) {
    const path = process.argv[restoreIndex + 1];
    if (!path) {
      console.error("--restore needs a snapshot path");
      process.exit(1);
    }
    await mongoose.connect(config.MONGO_URI);
    try {
      await restoreSnapshot(path);
    } finally {
      await mongoose.disconnect();
    }
  } else {
    const confirmationIndex = process.argv.indexOf("--confirm-database");
    const confirmedDatabase = confirmationIndex === -1 ? undefined : process.argv[confirmationIndex + 1];
    const write = confirmedDatabase === database;
    if (confirmationIndex !== -1 && !write) {
      console.error(`Refusing to write. Re-run with --confirm-database ${database} after verifying that database is the intended target.`);
      process.exit(1);
    }

    const seedIndex = process.argv.indexOf("--seed");
    const seed = seedIndex === -1 ? undefined : Number(process.argv[seedIndex + 1]);

    await mongoose.connect(config.MONGO_URI);
    try {
      const result = await assignCatalogOwnership({ write, seed });
      const mode = result.dryRun ? "DRY RUN" : "WROTE";
      console.log(`\n[${mode}] database=${result.database}`);
      for (const recruiter of result.recruiters) {
        console.log(
          `  ${recruiter.email}: ${recruiter.companies} companies, ${recruiter.jobs} jobs, designation=${recruiter.designation ?? "(unchanged)"}`,
        );
      }
      console.log(`  orphaned companies remaining: ${result.orphansRemaining}`);
      if (!result.dryRun) {
        console.log(`  websites backfilled: ${result.websitesBackfilled}`);
        console.log(`  snapshot: ${result.snapshotPath}`);
      }
      if (result.dryRun && result.planned) {
        console.log(`\nDry run only. To apply: add --confirm-database ${result.database}`);
      }
      if (!result.planned) console.log("\nNothing to do: no orphaned companies, no missing websites, no empty designations.");
    } finally {
      await mongoose.disconnect();
    }
  }
}
