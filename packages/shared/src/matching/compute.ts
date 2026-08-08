import {
  experienceFit,
  locationFit,
  remoteFit,
  salaryFit,
  skillCoverage,
  canonicalSkills,
  type FitJobInput,
  type FitSeekerInput,
} from "./factors.js";
import { WEIGHTS, type Factor, type FactorKey, type ScoreBreakdown } from "./weights.js";

/** Round a fit fraction's contribution to one decimal, clamped to the max. */
function earned(frac: number, max: number): number {
  return Math.min(max, Math.max(0, Math.round(frac * max * 10) / 10));
}

/** Which `requirements` the seeker's `skills` failed to cover, canonicalised. */
function missingSkills(seeker: FitSeekerInput, job: FitJobInput): string[] {
  const have = new Set(canonicalSkills(seeker.skills));
  return canonicalSkills(job.requirements).filter((r) => !have.has(r));
}

function buildFactors(
  key: "job" | "seeker",
  seeker: FitSeekerInput,
  job: FitJobInput,
): Factor[] {
  const w = WEIGHTS[key];
  const skillsFrac = skillCoverage(seeker.skills, job.requirements);
  const salaryFrac = salaryFit(job.salary, seeker.salaryMin, seeker.salaryMax);
  const remoteFrac = remoteFit(seeker.openToRemote, job.workMode);
  const expFrac = experienceFit(seeker.experienceYears, job.experienceLevel);
  const locFrac = locationFit(seeker.location, job.location);
  const missing = missingSkills(seeker, job);

  const reasons: Record<FactorKey, string> = {
    skills:
      missing.length === 0
        ? `Has every requirement (${job.requirements.length} skills)`
        : `Missing: ${missing.join(", ")}`,
    salary:
      salaryFrac >= 1
        ? `Salary $${job.salary.toLocaleString()} fits the band`
        : `Salary $${job.salary.toLocaleString()} is outside the band`,
    remote:
      remoteFrac >= 1
        ? job.workMode === "remote"
          ? "Remote works"
          : "On-site / hybrid is fine"
        : "Role is remote but the seeker isn't open to it",
    experience:
      expFrac >= 1
        ? "Meets the experience bar"
        : "Below the experience bar",
    location:
      locFrac >= 1 ? "Location matches" : "Location differs",
  };

  const entries: Array<[FactorKey, number]> = [
    ["skills", skillsFrac],
    ["salary", salaryFrac],
    ["remote", remoteFrac],
    ["experience", expFrac],
    ["location", locFrac],
  ];

  return entries.map(([k, frac]) => ({
    key: k,
    max: w[k],
    earned: earned(frac, w[k]),
    reason: reasons[k],
  }));
}

function score(factors: Factor[]): number {
  // One-decimal roll-up, clamped to [0,100] so float noise never breaches it.
  const s = factors.reduce((acc, f) => acc + f.earned, 0);
  return Math.min(100, Math.max(0, Math.round(s * 10) / 10));
}

/** "Is this job right for the seeker?" — the search / fit-badge direction. */
export function computeJobFit(seeker: FitSeekerInput, job: FitJobInput): ScoreBreakdown {
  const factors = buildFactors("job", seeker, job);
  return { score: score(factors), factors };
}

/** "Is this seeker right for the job?" — the recruiter-workspace direction. */
export function computeSeekerFit(seeker: FitSeekerInput, job: FitJobInput): ScoreBreakdown {
  const factors = buildFactors("seeker", seeker, job);
  return { score: score(factors), factors };
}
