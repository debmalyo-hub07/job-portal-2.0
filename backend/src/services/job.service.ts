import mongoose, { type HydratedDocument } from "mongoose";
import type {
  JobCreateBody,
  JobDto,
  JobListQuery,
  OwnedJobsQuery,
  PaginatedResponse,
  PaginationQuery,
} from "@jobportal/shared";
import { Job, type JobDocument } from "../models/job.model.js";
import { Company } from "../models/company.model.js";
import type { CompanyDocument } from "../models/company.model.js";
import type { SeekerDocument } from "../models/seeker.model.js";
import { AppError } from "../lib/AppError.js";
import { escapeRegex } from "../lib/escapeRegex.js";
import { assertCompanyOwned, toCompanyDto } from "./company.service.js";
import { findAccountById } from "./account.service.js";
import { scoreJobForSeeker } from "./matching.pipeline.js";

const notFound = () => AppError.notFound("JOB_NOT_FOUND", "Job not found");

// After populate("company") the field is a document, not an ObjectId.
type PopulatedJob = Omit<HydratedDocument<JobDocument>, "company"> & {
  company: HydratedDocument<CompanyDocument> | null;
};

/**
 * The viewing seeker, or `null` for everyone else.
 *
 * Resolved once per request and threaded down, rather than looked up inside
 * `toJobDto`: the profile cannot change mid-request, so a per-row lookup would
 * be up to 50 reads of the same document for one page.
 */
export type FitViewer = HydratedDocument<SeekerDocument> | null;

/**
 * `viewerId` is a seeker's id or nothing. The caller decides — the controller
 * reads `req.auth.portal`, which the authentication middleware set from the
 * cookie it verified, so a recruiter or an anonymous visitor arrives here as
 * `undefined` and gets no `fit`.
 */
async function resolveFitViewer(viewerId?: string): Promise<FitViewer> {
  if (!viewerId) return null;
  const account = await findAccountById("seeker", viewerId);
  return (account as FitViewer) ?? null;
}

export function toJobDto(doc: PopulatedJob, viewer: FitViewer = null): JobDto {
  const dto: JobDto = {
    id: String(doc._id),
    title: doc.title,
    description: doc.description,
    requirements: doc.requirements ?? [],
    salary: doc.salary,
    experienceLevel: doc.experienceLevel,
    location: doc.location,
    jobType: doc.jobType,
    department: doc.department ?? "Other",
    position: doc.position,
    remote: doc.remote ?? false,
    company: doc.company ? toCompanyDto(doc.company) : null,
    createdAt: (doc as { createdAt?: Date }).createdAt?.toISOString() ?? "",
  };
  // Assigned only when there is a seeker to score, so the key is absent rather
  // than present-and-null for a caller the score does not describe.
  if (viewer) dto.fit = scoreJobForSeeker(viewer, doc as unknown as JobDocument);
  return dto;
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
    department: body.department,
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
  viewer: FitViewer = null,
): Promise<PaginatedResponse<JobDto>> {
  const [total, jobs] = await Promise.all([
    Job.countDocuments(filter),
    Job.find(filter)
      // `createdAt` has millisecond precision, so concurrent inserts can tie.
      // ObjectId order makes the sort total and keeps pagination stable.
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate<{ company: HydratedDocument<CompanyDocument> | null }>("company"),
  ]);
  return {
    // Newest first, unscored: sorting by fit here would rank this page only.
    items: jobs.map((j) => toJobDto(j as unknown as PopulatedJob, viewer)),
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}

export async function listPublicJobs(
  query: JobListQuery,
  viewerId?: string,
): Promise<PaginatedResponse<JobDto>> {
  // 4B — facet filter. OR within a comma-joined multi-select facet, AND across
  // facets. Each clause is an additive equality/range the compound index
  // `{location, jobType, experienceLevel, salary}` covers; the keyword regex
  // (title/description substring) stays the exception that 4A.4 preserved.
  const filter: Record<string, unknown> = {};

  const split = (s: string) => s.split(",").map((v) => v.trim()).filter(Boolean);
  const locations = split(query.location);
  const jobTypes = split(query.jobType);
  const departments = split(query.department);
  const companies = split(query.company);
  if (locations.length > 0)
    filter.location =
      locations.length === 1 ? locations[0] : mongoose.trusted({ $in: locations });
  if (jobTypes.length > 0)
    filter.jobType =
      jobTypes.length === 1 ? jobTypes[0] : mongoose.trusted({ $in: jobTypes });
  if (departments.length > 0)
    filter.department =
      departments.length === 1 ? departments[0] : mongoose.trusted({ $in: departments });
  if (companies.length > 0) {
    const companyDocs = await Company.find({
      name: mongoose.trusted({
        $in: companies.map((name) => new RegExp(`^${escapeRegex(name)}$`, "i")),
      }),
    }).select("_id");
    const companyIds = companyDocs.map((company) => company._id);
    filter.company =
      companyIds.length === 1
        ? mongoose.trusted({ $eq: companyIds[0] })
        : mongoose.trusted({ $in: companyIds });
  }
  if (query.salaryMax !== undefined) filter.salary = mongoose.trusted({ $lte: query.salaryMax });
  if (query.experienceMax !== undefined)
    filter.experienceLevel = mongoose.trusted({ $lte: query.experienceMax });
  if (query.remote !== undefined) filter.remote = query.remote;

  if (query.keyword) {
    const tokens = /[\p{L}\p{N}]/u.test(query.keyword)
      ? query.keyword.match(/[\p{L}\p{N}+#.-]+/gu)?.slice(0, 8) ?? []
      : [query.keyword];
    // Literal, case-insensitive search across every field a candidate expects:
    // title, description, location, requirements and the populated company's
    // name. Company names are handled with a second query because the job row
    // stores only the referenced ObjectId.
    const tokenFilters = await Promise.all(tokens.map(async (token) => {
      const re = new RegExp(escapeRegex(token), "i");
      const companyDocs = await Company.find({ name: re }).select("_id");
      return { $or: [
        { title: re }, { description: re }, { location: re }, { department: re }, { requirements: re },
        ...(companyDocs.length > 0 ? [{ company: mongoose.trusted({ $in: companyDocs.map((company) => company._id) }) }] : []),
      ] };
    }));
    if (tokenFilters.length > 0) filter.$and = mongoose.trusted(tokenFilters);
  }

  return paginate(filter, query, await resolveFitViewer(viewerId));
}

export async function getPublicJob(jobId: string, viewerId?: string): Promise<JobDto> {
  const job = await Job.findById(jobId).populate<{
    company: HydratedDocument<CompanyDocument> | null;
  }>("company");
  if (!job) throw notFound();
  return toJobDto(job as unknown as PopulatedJob, await resolveFitViewer(viewerId));
}

export async function listOwnedJobs(
  ownerId: string,
  query: OwnedJobsQuery,
): Promise<PaginatedResponse<JobDto>> {
  // Ownership first and unconditionally: the keyword can only ever narrow a set
  // the caller already owns.
  const filter: Record<string, unknown> = { created_by: ownerId };

  if (query.keyword) {
    // escapeRegex is mandatory — this is user input reaching a RegExp
    // constructor. No mongoose.trusted wrapper: a RegExp has no $-prefixed
    // keys, so the global sanitizeFilter passes it through, exactly as it does
    // for listPublicJobs.
    const re = new RegExp(escapeRegex(query.keyword), "i");
    filter.$or = [{ title: re }, { description: re }];
  }

  return paginate(filter, query);
}

/** The owned job document, for services that need more than an existence check. */
export async function getOwnedJob(
  ownerId: string,
  jobId: string,
): Promise<HydratedDocument<JobDocument>> {
  const job = await Job.findOne({ _id: jobId, created_by: ownerId });
  if (!job) throw notFound();
  return job;
}

/** Missing and foreign are indistinguishable by design: both 404. */
export async function assertJobOwned(ownerId: string, jobId: string): Promise<void> {
  const job = await Job.findOne({ _id: jobId, created_by: ownerId }).select("_id");
  if (!job) throw notFound();
}

export async function jobExists(jobId: string): Promise<boolean> {
  return (await Job.exists({ _id: jobId })) !== null;
}
