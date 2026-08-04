import type { HydratedDocument } from "mongoose";
import type {
  ApplicantDto,
  AppliedJobDto,
  PaginatedResponse,
  PaginationQuery,
} from "@jobportal/shared";
import { Application, type ApplicationDocument } from "../models/application.model.js";
import { AppError } from "../lib/AppError.js";
import { assertJobOwned, jobExists, toJobDto } from "./job.service.js";

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

type PopulatedApplicant = PopulatedApplication & {
  applicant: {
    fullName: string;
    email: string;
    phone: string | null;
    profile?: { headline?: string | null; skills?: string[] } | null;
    resume?: { storageKey?: string | null; originalName?: string | null } | null;
  } | null;
};

export async function listApplicants(
  recruiterId: string,
  jobId: string,
  { page, limit }: PaginationQuery,
): Promise<PaginatedResponse<ApplicantDto>> {
  // 404 whether the job is missing or belongs to another recruiter.
  await assertJobOwned(recruiterId, jobId);
  const filter = { job: jobId };
  const [total, applications] = await Promise.all([
    Application.countDocuments(filter),
    Application.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      // Projected at the query, not trimmed afterwards: the seeker record holds
      // far more than a recruiter is entitled to see.
      .populate({ path: "applicant", select: "fullName email phone profile resume" }),
  ]);
  return {
    items: (applications as unknown as PopulatedApplicant[]).map((a) => ({
      applicationId: String(a._id),
      status: a.status as ApplicantDto["status"],
      appliedAt: a.createdAt?.toISOString() ?? "",
      fullName: a.applicant?.fullName ?? "",
      email: a.applicant?.email ?? "",
      phone: a.applicant?.phone ?? null,
      headline: a.applicant?.profile?.headline ?? null,
      skills: a.applicant?.profile?.skills ?? [],
      resumeUrl: a.applicant?.resume?.storageKey ?? null,
      resumeName: a.applicant?.resume?.originalName ?? null,
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
