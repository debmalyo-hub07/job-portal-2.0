import type { HydratedDocument } from "mongoose";
import type {
  ApplicantDto,
  AppliedJobDto,
  PaginatedResponse,
  PaginationQuery,
} from "@jobportal/shared";
import { Application, type ApplicationDocument } from "../models/application.model.js";
import type { SeekerDocument } from "../models/seeker.model.js";
import { AppError } from "../lib/AppError.js";
import { assertJobOwned, getOwnedJob, jobExists, toJobDto } from "./job.service.js";
import { scoreSeekerForJob } from "./matching.pipeline.js";
import { signedResumeUrl } from "./resume.service.js";

/** Mongo's duplicate-key error, whatever driver version raised it. */
function isDuplicateKey(err: unknown): boolean {
  return (err as { code?: number }).code === 11000;
}

export async function applyToJob(seekerId: string, jobId: string): Promise<void> {
  if (!(await jobExists(jobId))) {
    throw AppError.notFound("JOB_NOT_FOUND", "Job not found");
  }
  try {
    await Application.create({ job: jobId, applicant: seekerId });
  } catch (err) {
    // The unique {job, applicant} index is the dedupe. A findOne pre-read would
    // let two parallel applies both pass the check and both insert.
    if (isDuplicateKey(err)) {
      throw AppError.conflict("ALREADY_APPLIED", "You have already applied for this job");
    }
    throw err;
  }
}

type PopulatedApplication = HydratedDocument<ApplicationDocument> & {
  createdAt?: Date;
};

export async function listAppliedJobs(
  seekerId: string,
  { page, limit }: PaginationQuery,
): Promise<PaginatedResponse<AppliedJobDto>> {
  const filter = { applicant: seekerId };
  const [total, applications] = await Promise.all([
    Application.countDocuments(filter),
    Application.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate({ path: "job", populate: { path: "company" } }),
  ]);
  return {
    items: (applications as PopulatedApplication[]).map((a) => ({
      id: String(a._id),
      status: a.status as AppliedJobDto["status"],
      appliedAt: a.createdAt?.toISOString() ?? "",
      // Null when the job was deleted after the application was filed.
      job:
        a.job && typeof a.job === "object" && "title" in a.job
          ? toJobDto(a.job as never)
          : null,
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}

type PopulatedApplicant = Omit<PopulatedApplication, "applicant"> & {
  applicant: HydratedDocument<SeekerDocument> | null;
};

export async function listApplicants(
  recruiterId: string,
  jobId: string,
  { page, limit }: PaginationQuery,
): Promise<PaginatedResponse<ApplicantDto>> {
  // The document is both the ownership check and the right-hand side of every
  // reverse fit score. Looking it up again per applicant would be an N+1 read.
  const job = await getOwnedJob(recruiterId, jobId);
  const filter = { job: jobId };
  const applications = await Application.find(filter)
    .sort({ createdAt: -1 })
    // Projected at the query, not trimmed afterwards: the seeker record holds
    // far more than a recruiter is entitled to see. The full `profile` object is
    // needed internally for scoring, but only its established DTO fields leave.
    .populate({ path: "applicant", select: "fullName email phone profile resume" });

  const ranked = (applications as unknown as PopulatedApplicant[])
    .map((application) => ({
      application,
      fit: application.applicant ? scoreSeekerForJob(application.applicant, job) : null,
    }))
    .sort((a, b) => {
      const scoreDelta = (b.fit?.score ?? -1) - (a.fit?.score ?? -1);
      if (scoreDelta !== 0) return scoreDelta;

      // Stable, useful tie-breakers: newer applications first, then id so two
      // rows created in the same millisecond cannot swap between requests.
      const dateDelta =
        (b.application.createdAt?.getTime() ?? 0) -
        (a.application.createdAt?.getTime() ?? 0);
      if (dateDelta !== 0) return dateDelta;
      return String(a.application._id).localeCompare(String(b.application._id));
    });

  const total = ranked.length;
  const pageItems = ranked.slice((page - 1) * limit, page * limit);
  return {
    items: pageItems.map(({ application: a, fit }) => ({
      applicationId: String(a._id),
      status: a.status as ApplicantDto["status"],
      appliedAt: a.createdAt?.toISOString() ?? "",
      fullName: a.applicant?.fullName ?? "",
      email: a.applicant?.email ?? "",
      phone: a.applicant?.phone ?? null,
      headline: a.applicant?.profile?.headline ?? null,
      skills: a.applicant?.profile?.skills ?? [],
      resumeUrl: signedResumeUrl(a.applicant?.resume?.storageKey),
      resumeName: a.applicant?.resume?.originalName ?? null,
      fit,
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}

export async function decideApplication(
  recruiterId: string,
  applicationId: string,
  status: "accepted" | "rejected",
): Promise<void> {
  const notFound = () => AppError.notFound("APPLICATION_NOT_FOUND", "Application not found");

  const application = await Application.findById(applicationId).select("job status");
  if (!application) throw notFound();

  // assertJobOwned throws JOB_NOT_FOUND; normalized here so a foreign
  // application answers exactly as a missing one does.
  try {
    await assertJobOwned(recruiterId, String(application.job));
  } catch {
    throw notFound();
  }

  application.status = status;
  await application.save();
}
