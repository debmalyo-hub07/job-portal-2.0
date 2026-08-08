import mongoose, { type HydratedDocument } from "mongoose";
import type {
  JobCreateBody,
  JobDto,
  JobListQuery,
  PaginatedResponse,
  PaginationQuery,
} from "@jobportal/shared";
import { Job, type JobDocument } from "../models/job.model.js";
import type { CompanyDocument } from "../models/company.model.js";
import { AppError } from "../lib/AppError.js";
import { escapeRegex } from "../lib/escapeRegex.js";
import { assertCompanyOwned, toCompanyDto } from "./company.service.js";

const notFound = () => AppError.notFound("JOB_NOT_FOUND", "Job not found");

// After populate("company") the field is a document, not an ObjectId.
type PopulatedJob = Omit<HydratedDocument<JobDocument>, "company"> & {
  company: HydratedDocument<CompanyDocument> | null;
};

export function toJobDto(doc: PopulatedJob): JobDto {
  return {
    id: String(doc._id),
    title: doc.title,
    description: doc.description,
    requirements: doc.requirements ?? [],
    salary: doc.salary,
    experienceLevel: doc.experienceLevel,
    location: doc.location,
    jobType: doc.jobType,
    position: doc.position,
    remote: doc.remote ?? false,
    company: doc.company ? toCompanyDto(doc.company) : null,
    createdAt: (doc as { createdAt?: Date }).createdAt?.toISOString() ?? "",
  };
}

export async function createJob(ownerId: string, body: JobCreateBody): Promise<JobDto> {
  // Throws 404 COMPANY_NOT_FOUND when the company is missing OR foreign —
  // this is the ownership check the old controller lacked.
  await assertCompanyOwned(ownerId, body.companyId);
  const job = await Job.create({
    title: body.title,
    description: body.description,
    requirements: body.requirements,
    salary: body.salary,
    experienceLevel: body.experience,
    location: body.location,
    jobType: body.jobType,
    position: body.position,
    company: body.companyId,
    created_by: ownerId,
  });
  const populated = (await job.populate("company")) as unknown as PopulatedJob;
  return toJobDto(populated);
}

async function paginate(
  filter: Record<string, unknown>,
  { page, limit }: PaginationQuery,
): Promise<PaginatedResponse<JobDto>> {
  const [total, jobs] = await Promise.all([
    Job.countDocuments(filter),
    Job.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate<{ company: HydratedDocument<CompanyDocument> | null }>("company"),
  ]);
  return {
    items: jobs.map((j) => toJobDto(j as unknown as PopulatedJob)),
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}

export async function listPublicJobs(query: JobListQuery): Promise<PaginatedResponse<JobDto>> {
  if (!query.keyword) return paginate({}, query);
  // Escaping makes hostile input match literally rather than as a pattern, so a
  // catastrophically backtracking regex is impossible. The filter is wrapped in
  // `mongoose.trusted` because it is service-constructed and contains an
  // operator key: once global `sanitizeFilter` lands, a bare top-level `$or`
  // would be stripped even though it never came from user input.
  const re = new RegExp(escapeRegex(query.keyword), "i");
  const filter = mongoose.trusted({
    $or: [{ title: re }, { description: re }],
  }) as Record<string, unknown>;
  return paginate(filter, query);
}

export async function getPublicJob(jobId: string): Promise<JobDto> {
  const job = await Job.findById(jobId).populate<{
    company: HydratedDocument<CompanyDocument> | null;
  }>("company");
  if (!job) throw notFound();
  return toJobDto(job as unknown as PopulatedJob);
}

export async function listOwnedJobs(
  ownerId: string,
  query: PaginationQuery,
): Promise<PaginatedResponse<JobDto>> {
  return paginate({ created_by: ownerId }, query);
}

/** Missing and foreign are indistinguishable by design: both 404. */
export async function assertJobOwned(ownerId: string, jobId: string): Promise<void> {
  const job = await Job.findOne({ _id: jobId, created_by: ownerId }).select("_id");
  if (!job) throw notFound();
}

export async function jobExists(jobId: string): Promise<boolean> {
  return (await Job.exists({ _id: jobId })) !== null;
}
