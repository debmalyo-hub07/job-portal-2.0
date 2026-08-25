import mongoose, { type HydratedDocument } from "mongoose";
import type {
  JobCreateBody,
  JobDto,
  JobListQuery,
  JobPosterDto,
  JobStatus,
  JobUpdateBody,
  OwnedJobsQuery,
  PaginatedResponse,
  PaginationQuery,
} from "@jobportal/shared";
import { TERMINAL_STATUSES } from "@jobportal/shared";
import { Job, type JobDocument } from "../models/job.model.js";
import { Company } from "../models/company.model.js";
// The model, not the application service: a job owning a count of its own
// applications must not make the two services import each other.
import { Application } from "../models/application.model.js";
import type { CompanyDocument } from "../models/company.model.js";
import type { RecruiterDocument } from "../models/recruiter.model.js";
import type { SeekerDocument } from "../models/seeker.model.js";
import { AppError } from "../lib/AppError.js";
import { escapeRegex } from "../lib/escapeRegex.js";
import { assertCompanyOwned, toCompanyDto } from "./company.service.js";
import { findAccountById } from "./account.service.js";
import { scoreJobForSeeker } from "./matching.pipeline.js";

const notFound = () => AppError.notFound("JOB_NOT_FOUND", "Job not found");

// After populate("company") the field is a document, not an ObjectId. Same for
// `created_by` once populated — but that one stays deliberately loose, because a
// path that forgot to populate hands back a bare ObjectId and `toJobDto` has to
// be able to tell the difference.
type PopulatedJob = Omit<HydratedDocument<JobDocument>, "company" | "created_by"> & {
  company: HydratedDocument<CompanyDocument> | null;
  created_by: unknown;
};

/**
 * The recruiter fields a job's poster block may draw on — and only those.
 *
 * Projected at every populate rather than trimmed afterwards, per the note on
 * `authFields`: the recruiter document holds a password hash, lockout counters
 * and a token cutoff, none of which has any business travelling to a job page.
 */
const POSTER_FIELDS = "fullName designation email phone";

/**
 * Reads the poster block off a populated `created_by`.
 *
 * Returns `null` for an absent owner — the seeded catalogue's jobs are
 * deliberately owner-less — and also for an *unpopulated* reference, which is a
 * caller bug rather than a missing recruiter. Both render as "no poster", so the
 * shape check is what keeps the bug from looking like data.
 */
function toJobPosterDto(createdBy: unknown, includeContact: boolean): JobPosterDto | null {
  if (!createdBy || typeof createdBy !== "object" || !("fullName" in createdBy)) return null;
  const r = createdBy as Pick<RecruiterDocument, "fullName" | "designation" | "email" | "phone">;
  const poster: JobPosterDto = {
    fullName: r.fullName,
    designation: r.designation ?? null,
  };
  // Assigned only for a caller entitled to them, so the keys are absent rather
  // than present-and-null on a public response.
  if (includeContact) {
    poster.email = r.email;
    poster.phone = r.phone ?? null;
  }
  return poster;
}

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
    // A row written before the field existed reads as open, the same reading the
    // board's `$ne` filter gives it. `department` above does this for the same
    // reason.
    status: (doc.status as JobStatus | undefined) ?? "open",
    company: doc.company ? toCompanyDto(doc.company) : null,
    createdAt: (doc as { createdAt?: Date }).createdAt?.toISOString() ?? "",
    // `viewer` is non-null only for an authenticated seeker, so it doubles as
    // the contact-visibility gate — the same signal that decides `fit`.
    postedBy: toJobPosterDto(doc.created_by, viewer !== null),
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
  const populated = (await job.populate([
    { path: "company" },
    { path: "created_by", select: POSTER_FIELDS },
  ])) as unknown as PopulatedJob;
  return toJobDto(populated);
}

/**
 * How many candidates applied to each of these jobs, and how many are still live.
 *
 * One aggregation for the whole page, never a count per row — the same rule the
 * `created_by` populate below follows. Returned as a Map so a job with no
 * applications is simply absent rather than needing a zero row.
 */
async function countApplicationsByJob(
  jobIds: unknown[],
): Promise<Map<string, { total: number; active: number }>> {
  if (jobIds.length === 0) return new Map();
  const rows = await Application.aggregate<{
    _id: unknown;
    total: number;
    active: number;
  }>([
    { $match: { job: { $in: jobIds } } },
    {
      $group: {
        _id: "$job",
        total: { $sum: 1 },
        // "Active" is the complement of the terminal set rather than a list of
        // active stages, so a stage added to the pipeline counts as active
        // without this query being touched — and a legacy row with no status at
        // all counts too, which a positive list would silently drop.
        active: {
          $sum: {
            $cond: [{ $in: [{ $ifNull: ["$status", "applied"] }, TERMINAL_STATUSES] }, 0, 1],
          },
        },
      },
    },
  ]);
  return new Map(rows.map((r) => [String(r._id), { total: r.total, active: r.active }]));
}

async function paginate(
  filter: Record<string, unknown>,
  { page, limit }: PaginationQuery,
  viewer: FitViewer = null,
  /**
   * Attach per-job application counts. Owner-only: a count on a public job is
   * competitive information, so this defaults off and `listPublicJobs` never
   * turns it on.
   */
  withCounts = false,
): Promise<PaginatedResponse<JobDto>> {
  const [total, jobs] = await Promise.all([
    Job.countDocuments(filter),
    Job.find(filter)
      // `createdAt` has millisecond precision, so concurrent inserts can tie.
      // ObjectId order makes the sort total and keeps pagination stable.
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate<{ company: HydratedDocument<CompanyDocument> | null }>("company")
      // One extra lookup per page, not per row — the poster block would
      // otherwise be a read per job.
      .populate("created_by", POSTER_FIELDS),
  ]);
  const counts = withCounts ? await countApplicationsByJob(jobs.map((j) => j._id)) : null;
  return {
    // Newest first, unscored: sorting by fit here would rank this page only.
    items: jobs.map((j) => {
      const dto = toJobDto(j as unknown as PopulatedJob, viewer);
      // Present-and-zero rather than absent for a job nobody applied to: the
      // workspace reads `total` to decide whether Delete is available, and an
      // absent key there would be indistinguishable from a public response.
      if (counts) dto.applications = counts.get(String(j._id)) ?? { total: 0, active: 0 };
      return dto;
    }),
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
  //
  // `$ne` and not `{ status: "open" }`. Mongo does not match a missing field
  // against an equality, so the equality form would hide every job written
  // before the field existed — 198 rows in production, i.e. the entire board.
  // `mongoose.trusted` is required because the global `sanitizeFilter` reads a
  // bare `$ne` object as a literal value to compare against.
  const filter: Record<string, unknown> = {
    status: mongoose.trusted({ $ne: "closed" }),
  };

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
  const job = await Job.findById(jobId)
    .populate<{ company: HydratedDocument<CompanyDocument> | null }>("company")
    .populate("created_by", POSTER_FIELDS);
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

  // No status filter: a recruiter must keep seeing the roles they closed, or
  // closing one would look like deleting it. Counts are on, because this list
  // is where Close and Delete are offered and both depend on them.
  return paginate(filter, query, null, true);
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

/**
 * The job is real and still accepting applications.
 *
 * Replaces `jobExists`, whose single caller was `applyToJob` — an existence
 * check alone cannot tell a live role from a filled one, so a closed job kept
 * taking applications.
 */
export async function assertJobOpen(jobId: string): Promise<void> {
  const job = await Job.findById(jobId).select("status");
  if (!job) throw notFound();
  if (job.status === "closed") {
    throw AppError.conflict("JOB_CLOSED", "This role is no longer accepting applications");
  }
}

/**
 * Correct a posted job.
 *
 * Only the fields present in the body are written, so a form that posts what it
 * renders cannot blank what it does not. `experience` is the request's name for
 * `experienceLevel`, exactly as in `createJob`; the company is absent from the
 * schema entirely and so cannot arrive here.
 */
export async function updateJob(
  ownerId: string,
  jobId: string,
  body: JobUpdateBody,
): Promise<JobDto> {
  const job = await getOwnedJob(ownerId, jobId);

  if (body.title !== undefined) job.title = body.title;
  if (body.description !== undefined) job.description = body.description;
  if (body.requirements !== undefined) job.requirements = body.requirements;
  if (body.salary !== undefined) job.salary = body.salary;
  if (body.experience !== undefined) job.experienceLevel = body.experience;
  if (body.location !== undefined) job.location = body.location;
  if (body.jobType !== undefined) job.jobType = body.jobType;
  if (body.department !== undefined) job.department = body.department;
  if (body.position !== undefined) job.position = body.position;
  if (body.remote !== undefined) job.remote = body.remote;

  await job.save();
  const populated = (await job.populate([
    { path: "company" },
    { path: "created_by", select: POSTER_FIELDS },
  ])) as unknown as PopulatedJob;
  return toJobDto(populated);
}

/**
 * Close a filled role, or reopen one closed by mistake.
 *
 * Reopening is allowed for the same reason the application pipeline allows
 * backward moves: without it, closing the wrong role means retyping it.
 *
 * A repeated status is a conflict rather than a successful no-op. The status a
 * legacy row does not have reads as "open", so `?? "open"` is what makes
 * "reopen an already-open job" refuse rather than silently succeed.
 */
export async function setJobStatus(
  ownerId: string,
  jobId: string,
  status: JobStatus,
): Promise<JobDto> {
  const job = await getOwnedJob(ownerId, jobId);
  if ((job.status ?? "open") === status) {
    throw AppError.conflict("STATUS_UNCHANGED", `This role is already ${status}`);
  }
  job.status = status;
  await job.save();
  const populated = (await job.populate([
    { path: "company" },
    { path: "created_by", select: POSTER_FIELDS },
  ])) as unknown as PopulatedJob;
  return toJobDto(populated);
}

/**
 * Delete a posting nobody applied to.
 *
 * Refused once an application exists, because the row a candidate sees in their
 * own applied-jobs list resolves through this job — deleting it would leave them
 * with an application to something the platform will not name. `AppliedJobDto.job`
 * is nullable and would degrade rather than crash, which is precisely what makes
 * the erasure quiet.
 *
 * The check is a count rather than a cascade: closing is the answer for a role
 * with history, and it keeps every applicant's record intact.
 */
export async function deleteJob(ownerId: string, jobId: string): Promise<void> {
  const job = await getOwnedJob(ownerId, jobId);
  const applications = await Application.countDocuments({ job: job._id });
  if (applications > 0) {
    throw AppError.conflict(
      "JOB_HAS_APPLICATIONS",
      "Candidates have applied to this role, so it can be closed but not deleted",
    );
  }
  await job.deleteOne();
}
