/**
 * The single source of truth for fit weights. Every factor's contribution lives
 * here and nowhere else; a weight change is a one-file edit, and the
 * per-direction totals are asserted in `matching.test.ts` so they can't drift.
 *
 * The two directions share the same five factors but weight them differently,
 * because the question differs:
 *  - `job`: is this job right for the seeker? — skills and salary dominate what
 *    a candidate screens on.
 *  - `seeker`: is this seeker right for the job? — skills and experience
 *    dominate what a recruiter screens on; the candidate's salary band matters
 *    less to the employer than their capability.
 */

export type FactorKey = "skills" | "salary" | "remote" | "experience" | "location";

export const FACTOR_KEYS: readonly FactorKey[] = [
  "skills",
  "salary",
  "remote",
  "experience",
  "location",
];

/** Per-direction weight tables; each must total 100. */
export const WEIGHTS: Record<"job" | "seeker", Record<FactorKey, number>> = {
  // Job for a seeker.
  job: {
    skills: 40,
    salary: 25,
    remote: 12,
    experience: 13,
    location: 10,
  },
  // Seeker for a job (recruiter workspace).
  seeker: {
    skills: 45,
    experience: 25,
    salary: 10,
    remote: 10,
    location: 10,
  },
};

/** One factor's contribution after scoring. */
export interface Factor {
  key: FactorKey;
  /** The weight this factor could contribute — its ceiling, from the table. */
  max: number;
  /** What it actually contributed after the fit fraction, ≤ max. */
  earned: number;
  /** Human-readable note for the explain step. */
  reason: string;
}

/** A scored result: the rolled-up score plus the contributing breakdown. */
export interface ScoreBreakdown {
  /** 0–100, the sum of factor earnings. */
  score: number;
  factors: Factor[];
}
