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
    // 4A.3 in body (optional boolean); falls back to the schema default when absent.
    remote: body.remote ?? false,
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
  // 4B — facet filter. OR within a comma-joined multi-select facet, AND across
  // facets. Each clause is an additive equality/range the compound index
  // `{location, jobType, experienceLevel, salary}` covers; the keyword regex
  // (title/description substring) stays the exception that 4A.4 preserved.
  const filter: Record<string, unknown> = {};

  const split = (s: string) => s.split(",").map((v) => v.trim()).filter(Boolean);
  const locations = split(query.location);
  const jobTypes = split(query.jobType);
  if (locations.length > 0)
    filter.location =
      locations.length === 1 ? locations[0] : mongoose.trusted({ $in: locations });
  if (jobTypes.length > 0)
    filter.jobType =
      jobTypes.length === 1 ? jobTypes[0] : mongoose.trusted({ $in: jobTypes });
  if (query.salaryMax !== undefined) filter.salary = mongoose.trusted({ $lte: query.salaryMax });
  if (query.experienceMax !== undefined)
    filter.experienceLevel = mongoose.trusted({ $lte: query.experienceMax });
  if (query.remote !== undefined) filter.remote = query.remote;

  if (query.keyword) {
    const re = new RegExp(escapeRegex(query.keyword), "i");
    // Wrap each $or branch, matching the established pattern: `trusted` belongs
    // on the operator value, not the whole top-level filter.
    filter.$or = [{ title: re }, { description: re }];
  }

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
