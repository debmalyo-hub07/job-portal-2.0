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

/**
 * Reason lines, written in the voice of whoever reads them.
 *
 * The `job` direction answers "is this job right for the seeker?" and is what a
 * seeker sees on a job card, so it addresses them directly. The `seeker`
 * direction answers "is this seeker right for the job?" and is read by a
 * recruiter, about somebody else. A single shared set of strings had to pick one
 * voice and picked the recruiter's, so a seeker's own job card would have read
 * "the seeker isn't open to it".
 *
 * The salary line also used to invent a `$` and repeat the figure, while the app
 * renders `job.salary` as LPA and prints it on the card already. It names the
 * verdict now, and leaves the number and its unit to the surface that owns them.
 */
interface Voice {
  skillsOk: (count: number) => string;
  skillsMissing: (missing: string[]) => string;
  salaryOk: string;
  salaryOff: string;
  remoteOk: (roleIsRemote: boolean) => string;
  remoteOff: string;
  experienceOk: string;
  experienceOff: string;
  locationOk: string;
  locationOff: string;
}

const VOICES: Record<"job" | "seeker", Voice> = {
  job: {
    skillsOk: (count) => `You have all ${count} of the skills asked for`,
    skillsMissing: (missing) => `You are missing ${missing.join(", ")}`,
    salaryOk: "Pay is inside the range you set",
    salaryOff: "Pay is outside the range you set",
    remoteOk: (roleIsRemote) =>
      roleIsRemote ? "Remote, which is what you asked for" : "On-site or hybrid, which is fine",
    remoteOff: "Remote-only, and you said you would rather not",
    experienceOk: "You meet the experience asked for",
    experienceOff: "Short of the experience asked for",
    locationOk: "In the location you set",
    locationOff: "Outside the location you set",
  },
  seeker: {
    skillsOk: (count) => `Has every requirement (${count} skills)`,
    skillsMissing: (missing) => `Missing: ${missing.join(", ")}`,
    salaryOk: "Pay is inside their range",
    salaryOff: "Pay is outside their range",
    remoteOk: (roleIsRemote) => (roleIsRemote ? "Remote works for them" : "On-site or hybrid is fine"),
    remoteOff: "Role is remote and they are not open to it",
    experienceOk: "Meets the experience bar",
    experienceOff: "Below the experience bar",
    locationOk: "Location matches",
    locationOff: "Location differs",
  },
};

function buildFactors(
  key: "job" | "seeker",
  seeker: FitSeekerInput,
  job: FitJobInput,
): Factor[] {
  const w = WEIGHTS[key];
  const v = VOICES[key];
  const skillsFrac = skillCoverage(seeker.skills, job.requirements);
  const salaryFrac = salaryFit(job.salary, seeker.salaryMin, seeker.salaryMax);
  const remoteFrac = remoteFit(seeker.openToRemote, job.workMode);
  const expFrac = experienceFit(seeker.experienceYears, job.experienceLevel);
  const locFrac = locationFit(seeker.location, job.location);
  const missing = missingSkills(seeker, job);

  const reasons: Record<FactorKey, string> = {
    skills:
      missing.length === 0 ? v.skillsOk(job.requirements.length) : v.skillsMissing(missing),
    salary: salaryFrac >= 1 ? v.salaryOk : v.salaryOff,
    remote: remoteFrac >= 1 ? v.remoteOk(job.workMode === "remote") : v.remoteOff,
    experience: expFrac >= 1 ? v.experienceOk : v.experienceOff,
    location: locFrac >= 1 ? v.locationOk : v.locationOff,
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
