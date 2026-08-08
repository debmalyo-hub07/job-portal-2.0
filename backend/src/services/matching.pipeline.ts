import {
  computeJobFit,
  computeSeekerFit,
  type FitJobInput,
  type FitSeekerInput,
  type ScoreBreakdown,
} from "@jobportal/shared";
import type { JobDocument } from "../models/job.model.js";
import type { SeekerDocument } from "../models/seeker.model.js";
import type { WorkMode } from "@jobportal/shared";

/**
 * Projections from persistence documents to the fit pipeline's narrow inputs.
 *
 * The pipeline reads a minimal, deliberately-typed shape (FitSeekerInput /
 * FitJobInput) so it never depends on the schema. Converting here — once — is
 * what keeps a profile field rename or a job schema change from silently
 * corrupting every score; the projection is the single place the two models
 * meet the matching contract.
 */
export function toFitSeekerInput(seeker: SeekerDocument): FitSeekerInput {
  const p = seeker.profile;
  return {
    skills: p?.skills ?? [],
    // undefined, not 0 — an unset band is "no constraint", and 0 would clamp
    // every salary to the bottom of the tolerance window and score it low.
    salaryMin: p?.salaryMin ?? undefined,
    salaryMax: p?.salaryMax ?? undefined,
    experienceYears: p?.experienceYears ?? undefined,
    location: p?.location ?? undefined,
    // undefined when null — the pipeline's remote factor no-penalties unknowns.
    openToRemote: p?.openToRemote ?? undefined,
  };
}

export function toFitJobInput(job: JobDocument): FitJobInput {
  return {
    requirements: job.requirements ?? [],
    salary: job.salary,
    experienceLevel: job.experienceLevel,
    location: job.location ?? undefined,
    // The schema stores a flat `remote` boolean (4A.3); the pipeline reads the
    // WorkMode enum. Hybrid isn't persisted yet — a non-remote role is "onsite".
    workMode: (job.remote ? "remote" : "onsite") as WorkMode,
  };
}

/** Is this job right for the seeker? — search / fit-badge direction. */
export function scoreJobForSeeker(seeker: SeekerDocument, job: JobDocument): ScoreBreakdown {
  return computeJobFit(toFitSeekerInput(seeker), toFitJobInput(job));
}

/** Is this seeker right for the job? — recruiter / matching direction. */
export function scoreSeekerForJob(seeker: SeekerDocument, job: JobDocument): ScoreBreakdown {
  return computeSeekerFit(toFitSeekerInput(seeker), toFitJobInput(job));
}
