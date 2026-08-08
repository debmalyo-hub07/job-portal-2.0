export type { FitJobInput, FitSeekerInput } from "./factors.js";
export {
  canonicalSkill,
  canonicalSkills,
  skillCoverage,
  salaryFit,
  experienceFit,
  locationFit,
  remoteFit,
} from "./factors.js";
export type { Factor, FactorKey, ScoreBreakdown } from "./weights.js";
export { FACTOR_KEYS, WEIGHTS } from "./weights.js";
export { computeJobFit, computeSeekerFit } from "./compute.js";
export { explain } from "./explain.js";
