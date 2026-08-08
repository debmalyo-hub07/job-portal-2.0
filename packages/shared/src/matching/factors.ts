import type { WorkMode } from "../enums.js";

/**
 * The shapes the fit pipeline reads. These are *matching inputs*, not the
 * persistence DTOs: they're the minimal field set the scoring needs, kept
 * deliberately narrow so the backend and the UI read the same contract without
 * the pipeline importing the whole domain model.
 *
 * The fields with no persistence column yet are the spec-fit deltas —
 * `profile.salaryMin/Max`, `profile.openToRemote`, `profile.experienceYears`,
 * `job.experienceLevel`, `job.workMode`. 4A.3 (faceted filters) and 4A.4
 * (backend aggregation) extend the models to carry them; until then, consumers
 * project whatever subset exists and the optional marks below keep the
 * pipeline honest about what's missing rather than inventing defaults.
 */
export interface FitSeekerInput {
  skills: string[];
  /** Lower bound of the seeker's salary band, in `job.salary`'s unit. */
  salaryMin?: number;
  /** Upper bound of the seeker's salary band. */
  salaryMax?: number;
  experienceYears?: number;
  location?: string;
  openToRemote?: boolean;
}

export interface FitJobInput {
  requirements: string[];
  salary: number;
  experienceLevel?: number;
  location?: string;
  workMode?: WorkMode;
}

/** Canonical skill aliases → the token the pipeline matches on. */
const SKILL_ALIASES: Record<string, string> = {
  "react.js": "react",
  reactjs: "react",
  "node.js": "node",
  nodejs: "node",
  ts: "typescript",
  "typescript.js": "typescript",
  js: "javascript",
  "c#": "csharp",
  "c++": "cpp",
  "golang": "go",
};

/** Lowercase, trim, collapse whitespace, resolve an alias. Empty input → "". */
export function canonicalSkill(raw: string): string {
  const t = raw.trim().toLowerCase().replace(/\s+/g, " ");
  return SKILL_ALIASES[t] ?? t;
}

/** Normalise a list into a unique set of canonical tokens, dropping empties. */
export function canonicalSkills(raw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of raw) {
    const c = canonicalSkill(s);
    if (c && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}

/** Fraction [0,1] of `required` tokens present in the canonical given set. */
export function skillCoverage(given: string[], required: string[]): number {
  const req = canonicalSkills(required);
  if (req.length === 0) return 1; // nothing asked for → fully covered
  const have = new Set(canonicalSkills(given));
  let hit = 0;
  for (const r of req) if (have.has(r)) hit++;
  return hit / req.length;
}

/**
 * Salary fit [0,1]: how well the job's single salary point meets the seeker's
 * band. Full (1) when the point falls inside the band; degrades smoothly to 0
 * at ±30% outside it. No band on the seeker → can't fault the job, returns 1.
 */
export function salaryFit(salary: number, min?: number, max?: number): number {
  if (min === undefined && max === undefined) return 1;
  const lo = min ?? 0;
  const hi = max ?? Number.POSITIVE_INFINITY;
  if (salary >= lo && salary <= hi) return 1;
  const below = lo - salary;
  const above = salary - (hi === Number.POSITIVE_INFINITY ? lo : hi);
  const gap = Math.max(below, above, 0);
  const scale = Math.max(lo, 1) * 0.3; // tolerance band: 30% of the floor
  return Math.max(0, 1 - gap / scale);
}

/**
 * Experience fit [0,1]: full when the seeker meets the job's level, else
 * degrades per missing year (each year short costs 25%). Unknowns → 1.
 */
export function experienceFit(seekerYears?: number, jobLevel?: number): number {
  if (seekerYears === undefined || jobLevel === undefined) return 1;
  if (seekerYears >= jobLevel) return 1;
  return Math.max(0, 1 - (jobLevel - seekerYears) * 0.25);
}

/** Location fit [0,1]: token match after trim/lowercase. Unknowns → 1. */
export function locationFit(seekerLoc?: string, jobLoc?: string): number {
  if (!seekerLoc || !jobLoc) return 1;
  const a = seekerLoc.trim().toLowerCase();
  const b = jobLoc.trim().toLowerCase();
  return a === b || a.includes(b) || b.includes(a) ? 1 : 0;
}

/** Remote fit [0,1]: an on-site/hybrid job never penalises; a remote job needs `openToRemote`. */
export function remoteFit(openToRemote?: boolean, workMode?: WorkMode): number {
  if (workMode !== "remote") return 1;
  if (openToRemote === undefined) return 1; // seeker never said → don't fault
  return openToRemote ? 1 : 0;
}
