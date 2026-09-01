import { logger } from "../lib/logger.js";
import { Company } from "../models/company.model.js";
import { Job } from "../models/job.model.js";
import { Recruiter } from "../models/recruiter.model.js";

/**
 * The catalogue's ownership semantics — P2 of the console automation program.
 *
 * `planAssignment`, the orphan filter and the write loop lived first in the
 * one-time `assign-catalog-ownership` script; they moved here when the
 * approval flow needed them, so there is exactly one implementation of what
 * "orphaned" means and of the company-first write (jobs follow their
 * company: the queue, the workspace and the applicant routing all resolve an
 * application's owner through `job.created_by`). The script still owns its
 * own concerns — dry-run, snapshots, website backfill, designations — and
 * composes these pieces.
 */

export type PlannedCompany = { id: string; name: string; jobCount: number };
export type PlannedRecruiter = { id: string; email: string };

export type OwnershipPlan = {
  seed: number;
  recruiters: {
    recruiterId: string;
    email: string;
    companies: PlannedCompany[];
    jobCount: number;
  }[];
};

/** mulberry32 — small, deterministic, no dependencies. */
function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(items: T[], seed: number): T[] {
  const next = [...items];
  const random = prng(seed);
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [next[i], next[j]] = [next[j]!, next[i]!];
  }
  return next;
}

/**
 * Greedy balance with a seeded shuffle. The shuffle randomises which recruiter
 * meets which employer (the point of the original migration — four people, not
 * one), and the greedy pass keeps the workload comparable: companies are
 * placed largest first, each onto the recruiter carrying the fewest jobs, so
 * the final spread differs by at most one company's worth of listings.
 */
export function planAssignment(
  companies: PlannedCompany[],
  recruiters: PlannedRecruiter[],
  seed: number,
): OwnershipPlan {
  if (recruiters.length === 0) throw new Error("planAssignment needs at least one recruiter");

  const ordered = [...seededShuffle(companies, seed)].sort((a, b) => b.jobCount - a.jobCount);
  const jobs = new Map(recruiters.map((recruiter) => [recruiter.id, 0]));
  const assigned = new Map(recruiters.map((recruiter) => [recruiter.id, [] as PlannedCompany[]]));

  for (const company of ordered) {
    let target = recruiters[0]!;
    for (const recruiter of recruiters) {
      const ahead =
        (jobs.get(recruiter.id) ?? 0) < (jobs.get(target.id) ?? 0) ||
        ((jobs.get(recruiter.id) ?? 0) === (jobs.get(target.id) ?? 0) &&
          (assigned.get(recruiter.id)?.length ?? 0) < (assigned.get(target.id)?.length ?? 0));
      if (ahead) target = recruiter;
    }
    jobs.set(target.id, (jobs.get(target.id) ?? 0) + company.jobCount);
    assigned.get(target.id)?.push(company);
  }

  return {
    seed,
    recruiters: recruiters.map((recruiter) => ({
      recruiterId: recruiter.id,
      email: recruiter.email,
      companies: assigned.get(recruiter.id) ?? [],
      jobCount: jobs.get(recruiter.id) ?? 0,
    })),
  };
}

/**
 * Orphaned means no recruiter row answers — not "owned by someone else",
 * which is a real recruiter's company and none of this sweep's business.
 * Suspended owners still count as owners: their companies are watched, not
 * re-homed.
 */
export function orphanedAmong<T extends { _id: unknown; userId: unknown }>(
  companies: T[],
  recruiterIds: Set<string>,
): T[] {
  return companies.filter((company) => !recruiterIds.has(String(company.userId)));
}

/** The write: a company changes hands and every job under it follows. */
export async function applyAssignment(plan: OwnershipPlan): Promise<{ companies: number; jobs: number }> {
  let companies = 0;
  let jobs = 0;
  for (const entry of plan.recruiters) {
    for (const company of entry.companies) {
      await Company.updateOne({ _id: company.id }, { $set: { userId: entry.recruiterId } });
      const moved = await Job.updateMany({ company: company.id }, { $set: { created_by: entry.recruiterId } });
      companies += 1;
      jobs += moved.modifiedCount;
    }
  }
  return { companies, jobs };
}

export type SweepResult = {
  recruiters: number;
  orphansFound: number;
  companiesAssigned: number;
  jobsAssigned: number;
};

/**
 * Re-home every orphaned company across the active recruiters.
 *
 * The convenience the approval flow calls: composes the pieces above and —
 * like the admin mail — never rejects into its caller. The approval is the
 * product; the sweep is bookkeeping. A failure logs and leaves the remaining
 * orphans for the next approval or the manual script, and re-sweeping is
 * always safe: an assigned company is no longer orphaned, so a partial
 * failure's leftovers are exactly what the next run picks up.
 */
export async function sweepOrphanedCompanies(): Promise<SweepResult> {
  try {
    // Active recruiters, oldest account first — the plan's tie-breaks key off
    // this order, so a re-run reads the same way.
    const recruiters = await Recruiter.find({ status: "active" }).sort({ createdAt: 1 });
    const recruiterIds = new Set(recruiters.map((recruiter) => String(recruiter._id)));
    const orphaned = orphanedAmong(await Company.find({}), recruiterIds);

    const result: SweepResult = {
      recruiters: recruiters.length,
      orphansFound: orphaned.length,
      companiesAssigned: 0,
      jobsAssigned: 0,
    };
    if (recruiters.length === 0 || orphaned.length === 0) return result;

    const jobCounts = new Map<string, number>();
    for (const company of orphaned) {
      jobCounts.set(String(company._id), await Job.countDocuments({ company: company._id }));
    }
    const plan = planAssignment(
      orphaned.map((company) => ({
        id: String(company._id),
        name: company.name,
        jobCount: jobCounts.get(String(company._id)) ?? 0,
      })),
      recruiters.map((recruiter) => ({ id: String(recruiter._id), email: recruiter.email })),
      Date.now(),
    );
    const written = await applyAssignment(plan);
    result.companiesAssigned = written.companies;
    result.jobsAssigned = written.jobs;
    logger.info(
      { recruiters: result.recruiters, companies: written.companies, jobs: written.jobs },
      "orphan sweep re-homed companies",
    );
    return result;
  } catch (error) {
    // Zeroes on failure are honest about the contract, not the books: the log
    // line is the failure's record, and the leftovers stay orphaned.
    logger.error({ err: error }, "orphan sweep failed");
    return { recruiters: 0, orphansFound: 0, companiesAssigned: 0, jobsAssigned: 0 };
  }
}
