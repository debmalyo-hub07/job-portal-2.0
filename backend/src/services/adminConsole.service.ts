import mongoose from "mongoose";
import { APPLICATION_STATUSES, isMinor } from "@jobportal/shared";
import type {
  AdminActivityDto,
  AdminActivityItem,
  AdminCompanyDto,
  AdminInsightsDto,
  AdminJobDto,
  AdminListQuery,
  AdminOverviewDto,
  AdminRankedSlice,
  AdminRecruiterDto,
  AdminSeekerDto,
  ApplicationStatus,
  PaginatedResponse,
} from "@jobportal/shared";

import { Application } from "../models/application.model.js";
import { AccountEvent } from "../models/accountEvent.model.js";
import { Company } from "../models/company.model.js";
import { Job } from "../models/job.model.js";
import { Recruiter } from "../models/recruiter.model.js";
import { Seeker } from "../models/seeker.model.js";
import { escapeRegex } from "../lib/escapeRegex.js";

/**
 * The admin console's reads.
 *
 * Separate from `approval.service.ts`, which owns the moderation *actions* on a
 * recruiter. This module only counts and lists, and it is the one place in the
 * codebase that reads across every recruiter's data — which is why each
 * projection below is written out by hand rather than reusing a domain DTO. A
 * console screen must not become a bulk export of contact details by
 * inheriting a field somebody adds to `JobDto` later.
 */

/**
 * Dashboard counters.
 *
 * Every count runs concurrently: they are independent, and issuing them in
 * series makes the dashboard as slow as their sum for no benefit.
 *
 * `countDocuments` rather than `estimatedDocumentCount` — the recruiter numbers
 * are filtered by status, and a dashboard that says "3 pending" while the queue
 * shows 4 is worse than one that takes an extra millisecond.
 */
export async function getOverview(): Promise<AdminOverviewDto> {
  const [pending, active, suspended, seekers, jobs, companies, applications] = await Promise.all([
    Recruiter.countDocuments({ status: "pending" }),
    Recruiter.countDocuments({ status: "active" }),
    Recruiter.countDocuments({ status: "suspended" }),
    Seeker.countDocuments({}),
    Job.countDocuments({}),
    Company.countDocuments({}),
    Application.countDocuments({}),
  ]);

  return {
    recruiters: { pending, active, suspended },
    seekers: { total: seekers },
    jobs: { total: jobs },
    companies: { total: companies },
    applications: { total: applications },
  };
}

/**
 * Builds a case-insensitive literal matcher for a keyword.
 *
 * `escapeRegex` first: the keyword is user input reaching a RegExp constructor,
 * which is the ReDoS/injection path 1C closed on the public job search. Same
 * rule applies here even though the caller is an admin.
 */
function keywordMatcher(keyword: string): RegExp {
  return new RegExp(escapeRegex(keyword), "i");
}

/**
 * Jobs across every recruiter, newest first.
 *
 * Carries `recruiterEmail` — the field `JobDto` deliberately withholds from the
 * public board — because the admin's question about a job is nearly always "who
 * posted this".
 */
export async function listAllJobs(query: AdminListQuery): Promise<PaginatedResponse<AdminJobDto>> {
  const filter: Record<string, unknown> = {};
  if (query.keyword) {
    const re = keywordMatcher(query.keyword);
    filter.$or = [{ title: re }, { location: re }];
  }

  const { page, limit } = query;
  const [total, rows] = await Promise.all([
    Job.countDocuments(filter),
    Job.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate<{ company: { name: string } | null }>("company", "name")
      .populate<{ created_by: { email: string } | null }>("created_by", "email"),
  ]);

  // One aggregate for the whole page rather than a count per row: the N+1 shape
  // is invisible on a seeded database and quadratic on a real one.
  const ids = rows.map((r) => r._id);
  const counts = await Application.aggregate<{ _id: mongoose.Types.ObjectId; n: number }>([
    { $match: { job: { $in: ids } } },
    { $group: { _id: "$job", n: { $sum: 1 } } },
  ]);
  const countByJob = new Map(counts.map((c) => [String(c._id), c.n]));

  return {
    items: rows.map((row) => ({
      id: String(row._id),
      title: row.title,
      location: row.location,
      jobType: row.jobType,
      salary: row.salary,
      companyName: row.company?.name ?? null,
      recruiterEmail: row.created_by?.email ?? null,
      applicationCount: countByJob.get(String(row._id)) ?? 0,
      createdAt: (row as unknown as { createdAt?: Date }).createdAt?.toISOString() ?? "",
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}

/** Companies across every recruiter, newest first, with their owner. */
export async function listAllCompanies(
  query: AdminListQuery,
): Promise<PaginatedResponse<AdminCompanyDto>> {
  const filter: Record<string, unknown> = {};
  if (query.keyword) {
    const re = keywordMatcher(query.keyword);
    filter.$or = [{ name: re }, { location: re }];
  }

  const { page, limit } = query;
  const [total, rows] = await Promise.all([
    Company.countDocuments(filter),
    Company.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate<{ userId: { email: string } | null }>("userId", "email"),
  ]);

  const ids = rows.map((r) => r._id);
  const counts = await Job.aggregate<{ _id: mongoose.Types.ObjectId; n: number }>([
    { $match: { company: { $in: ids } } },
    { $group: { _id: "$company", n: { $sum: 1 } } },
  ]);
  const countByCompany = new Map(counts.map((c) => [String(c._id), c.n]));

  return {
    items: rows.map((row) => ({
      id: String(row._id),
      name: row.name,
      location: row.location ?? null,
      website: row.website ?? null,
      logoUrl: row.logo ?? null,
      jobCount: countByCompany.get(String(row._id)) ?? 0,
      ownerEmail: row.userId?.email ?? null,
      createdAt: (row as unknown as { createdAt?: Date }).createdAt?.toISOString() ?? "",
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}

/**
 * Seekers across the platform (Project D) — "admin oversight of candidates".
 *
 * Hand-written projection, like every other console read: the moderation
 * question about a seeker is who they are, whether they are a minor (the one
 * consent-era signal that changes how to read the row), how much they are
 * using the platform, and whether they are currently suspended. Their phone,
 * DOB, resume and profile stay in their own portal.
 */
export async function listAllSeekers(query: AdminListQuery): Promise<PaginatedResponse<AdminSeekerDto>> {
  const filter: Record<string, unknown> = {};
  if (query.keyword) {
    const re = keywordMatcher(query.keyword);
    filter.$or = [{ fullName: re }, { email: re }];
  }

  const { page, limit } = query;
  const [total, rows] = await Promise.all([
    Seeker.countDocuments(filter),
    Seeker.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select("fullName email status dob guardianConsent createdAt"),
  ]);

  const ids = rows.map((r) => r._id);
  const counts = await Application.aggregate<{ _id: mongoose.Types.ObjectId; n: number }>([
    { $match: { applicant: { $in: ids } } },
    { $group: { _id: "$applicant", n: { $sum: 1 } } },
  ]);
  const countBySeeker = new Map(counts.map((c) => [String(c._id), c.n]));

  return {
    items: rows.map((row) => ({
      id: String(row._id),
      fullName: row.fullName,
      email: row.email,
      status: row.status as AdminSeekerDto["status"],
      // Derived on the server's clock — the console shows the band, not the DOB.
      minor: isMinor(row.dob ?? null),
      applicationCount: countBySeeker.get(String(row._id)) ?? 0,
      createdAt: (row as unknown as { createdAt?: Date }).createdAt?.toISOString() ?? "",
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}

/**
 * Every recruiter, not just the pending queue (Project D) — "all-recruiter
 * monitoring with suspend and reinstate".
 *
 * `pending` rows carry the queue's own actions on the screen (approve/deny);
 * `active` rows carry suspend; `suspended` rows carry reinstate. One listing
 * is what makes the moderation story continuous: an approved recruiter does
 * not vanish from the console the moment they clear the queue.
 */
export async function listAllRecruiters(
  query: AdminListQuery,
): Promise<PaginatedResponse<AdminRecruiterDto>> {
  const filter: Record<string, unknown> = {};
  if (query.keyword) {
    const re = keywordMatcher(query.keyword);
    filter.$or = [{ fullName: re }, { email: re }];
  }

  const { page, limit } = query;
  const [total, rows] = await Promise.all([
    Recruiter.countDocuments(filter),
    Recruiter.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select("fullName email status createdAt"),
  ]);

  // Both aggregates in one pass over the recruiter's jobs: the job count and
  // the applications those jobs attracted. Two separate $lookups could
  // disagree under a concurrent write. An empty page of recruiters has no
  // jobs to walk, so the counts are all zero without touching Mongo.
  const ids = rows.map((r) => r._id);
  const jobs =
    ids.length === 0
      ? []
      : await Job.find({ created_by: mongoose.trusted({ $in: ids }) }).select("created_by").lean();
  const jobIds = jobs.map((j) => j._id);
  const jobCountByOwner = new Map<string, number>();
  for (const job of jobs) {
    const key = String(job.created_by);
    jobCountByOwner.set(key, (jobCountByOwner.get(key) ?? 0) + 1);
  }
  const appCounts =
    jobIds.length === 0
      ? []
      : await Application.aggregate<{ _id: mongoose.Types.ObjectId; n: number }>([
          { $match: { job: { $in: jobIds } } },
          { $group: { _id: "$job", n: { $sum: 1 } } },
        ]);
  const appCountByJob = new Map(appCounts.map((c) => [String(c._id), c.n]));
  const appCountByOwner = new Map<string, number>();
  for (const job of jobs) {
    const owner = String(job.created_by);
    appCountByOwner.set(
      owner,
      (appCountByOwner.get(owner) ?? 0) + (appCountByJob.get(String(job._id)) ?? 0),
    );
  }

  return {
    items: rows.map((row) => ({
      id: String(row._id),
      fullName: row.fullName,
      email: row.email,
      status: row.status as AdminRecruiterDto["status"],
      jobCount: jobCountByOwner.get(String(row._id)) ?? 0,
      applicationCount: appCountByOwner.get(String(row._id)) ?? 0,
      createdAt: (row as unknown as { createdAt?: Date }).createdAt?.toISOString() ?? "",
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}

/**
 * Open means "not closed", never `status: "open"`.
 *
 * Mongo does not match a missing field against an equality, and every one of
 * production's 198 jobs predates the field — so equality would report zero
 * capacity on the live platform. `job.service.ts` filters the public board the
 * same way and for the same reason.
 */
const OPEN_JOBS = { status: { $ne: "closed" } } as const;

/** Eight weeks. Long enough to show a trend, short enough to stay one screen. */
const SERIES_DAYS = 56;

/** Midnight UTC, `daysBack` days ago. The series is keyed on UTC dates. */
function utcMidnight(daysBack: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d;
}

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * A ranked slice, biggest first, with the empties dropped.
 *
 * `$group` already omits values nothing carries, so this is a sort and a rename.
 * Kept as a helper because department and type must rank identically — two
 * inline sorts is how one of them ends up ascending. Ties break on the label so
 * the order is stable between requests rather than Mongo's arrival order.
 */
function ranked(rows: Array<{ _id: unknown; n: number }>): AdminRankedSlice[] {
  return rows
    .filter((row): row is { _id: string; n: number } => typeof row._id === "string" && row._id.length > 0)
    .map((row) => ({ label: row._id, count: row.n }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/**
 * The dashboard's aggregations.
 *
 * Every query runs concurrently, like `getOverview`: they are independent, and
 * in series the screen costs their sum for no benefit.
 *
 * The two shape guarantees this function upholds are both about what the client
 * must NOT have to reconstruct — see `AdminInsightsDto`. Zero-filling the series
 * and seeding every pipeline stage happen here rather than in the component,
 * because a second consumer would have to remember to do both.
 */
export async function getInsights(): Promise<AdminInsightsDto> {
  const seriesFrom = utcMidnight(SERIES_DAYS - 1);

  const [
    statusRows,
    total,
    decided,
    openJobs,
    coverageRows,
    pendingRecruiters,
    companiesMissingBranding,
    seriesRows,
    departmentRows,
    typeRows,
    remoteOpenJobs,
  ] = await Promise.all([
    Application.aggregate<{ _id: string; n: number }>([
      { $group: { _id: "$status", n: { $sum: 1 } } },
    ]),
    Application.countDocuments({}),
    Application.countDocuments({ decidedAt: { $ne: null } }),
    Job.countDocuments(OPEN_JOBS),
    // Demand and coverage in one pass, both scoped to open jobs. As two separate
    // queries they could disagree with each other under a concurrent write.
    Application.aggregate<{ _id: null; jobs: number; applications: number }>([
      { $lookup: { from: "jobs", localField: "job", foreignField: "_id", as: "posting" } },
      { $unwind: "$posting" },
      { $match: { "posting.status": { $ne: "closed" } } },
      { $group: { _id: "$job", n: { $sum: 1 } } },
      { $group: { _id: null, jobs: { $sum: 1 }, applications: { $sum: "$n" } } },
    ]),
    Recruiter.countDocuments({ status: "pending" }),
    // Missing EITHER — see the DTO for why OR rather than AND. Each field is
    // tested for absent, null and empty: all three mean the same thing to an
    // admin reading the row, and Mongo treats them as three different matches.
    Company.countDocuments({
      $or: [
        { logo: { $in: [null, ""] } },
        { logo: { $exists: false } },
        { website: { $in: [null, ""] } },
        { website: { $exists: false } },
      ],
    }),
    Job.aggregate<{ _id: string; n: number }>([
      { $match: { createdAt: { $gte: seriesFrom } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "UTC" } },
          n: { $sum: 1 },
        },
      },
    ]),
    Job.aggregate<{ _id: string; n: number }>([
      { $match: OPEN_JOBS },
      { $group: { _id: "$department", n: { $sum: 1 } } },
    ]),
    Job.aggregate<{ _id: string; n: number }>([
      { $match: OPEN_JOBS },
      { $group: { _id: "$jobType", n: { $sum: 1 } } },
    ]),
    Job.countDocuments({ ...OPEN_JOBS, remote: true }),
  ]);

  // Every stage, zeros included. Seeded from the shared enum rather than from
  // the rows, so a stage nobody has reached is still a row on the chart.
  const byStatus = Object.fromEntries(
    APPLICATION_STATUSES.map((status) => [status, 0]),
  ) as Record<ApplicationStatus, number>;
  for (const row of statusRows) {
    if (row._id in byStatus) byStatus[row._id as ApplicationStatus] = row.n;
  }

  // Dense and ascending. A sparse series makes the client infer the gaps, and a
  // chart that silently closes one draws a trend the data does not contain.
  const countByDay = new Map(seriesRows.map((row) => [row._id, row.n]));
  const jobsPostedSeries = Array.from({ length: SERIES_DAYS }, (_, i) => {
    const date = isoDay(utcMidnight(SERIES_DAYS - 1 - i));
    return { date, count: countByDay.get(date) ?? 0 };
  });

  const coverage = coverageRows[0] ?? { jobs: 0, applications: 0 };

  return {
    triage: { pendingRecruiters, companiesMissingBranding },
    pipeline: { byStatus, total, live: total - decided, decided },
    liquidity: {
      openJobs,
      jobsWithApplications: coverage.jobs,
      // null, never 0: "no applications per job" is a finding, "no open jobs to
      // divide by" is not, and the two must not render as the same number.
      applicationsPerJob: openJobs === 0 ? null : coverage.applications / openJobs,
    },
    composition: {
      byDepartment: ranked(departmentRows),
      byType: ranked(typeRows),
      remoteOpenJobs,
    },
    jobsPostedSeries,
    generatedAt: new Date().toISOString(),
  };
}

/** How many of each kind to read before merging. */
const ACTIVITY_PER_KIND = 10;
/** How many survive the merge. */
const ACTIVITY_LIMIT = 12;

/**
 * Recent events across every collection, newest first.
 *
 * Four bounded reads merged in memory rather than a `$unionWith`: the inputs are
 * capped at forty documents, each projection stays hand-written, and the
 * pipeline stays legible. `$unionWith` would also have to agree on one shape
 * across four different schemas before it could sort them.
 *
 * Nothing here carries a contact detail. The feed says what happened and where
 * to go about it; an applicant's identity is part of neither, and a field
 * inherited from a domain DTO later is how a moderation screen becomes an
 * export. That is asserted rather than assumed — see `admin-insights.test.ts`.
 */
export async function getActivity(): Promise<AdminActivityDto> {
  const [recruiters, jobs, companies, applications, autoApprovals] = await Promise.all([
    Recruiter.find({}).select("fullName createdAt").sort({ createdAt: -1 }).limit(ACTIVITY_PER_KIND),
    Job.find({})
      .select("title createdAt company")
      .sort({ createdAt: -1 })
      .limit(ACTIVITY_PER_KIND)
      .populate<{ company: { name: string } | null }>("company", "name"),
    Company.find({}).select("name createdAt").sort({ createdAt: -1 }).limit(ACTIVITY_PER_KIND),
    Application.find({})
      .select("createdAt job")
      .sort({ createdAt: -1 })
      .limit(ACTIVITY_PER_KIND)
      .populate<{ job: { title: string } | null }>("job", "title"),
    // P4's automation has no collection of its own — its record IS the
    // account event, so the feed reads the events directly.
    AccountEvent.find({ kind: "auto_approved" })
      .sort({ createdAt: -1 })
      .limit(ACTIVITY_PER_KIND)
      .populate<{ subjectId: { fullName: string } | null }>({
        path: "subjectId",
        model: Recruiter,
        select: "fullName",
      }),
  ]);

  const at = (row: unknown): string =>
    (row as { createdAt?: Date }).createdAt?.toISOString() ?? new Date(0).toISOString();

  const items: AdminActivityItem[] = [
    ...recruiters.map((row) => ({
      id: `recruiter:${String(row._id)}`,
      kind: "recruiter_registered" as const,
      at: at(row),
      label: row.fullName,
      detail: null,
      href: "/admin/recruiters",
    })),
    ...autoApprovals.map((row) => ({
      id: `auto-approval:${String(row._id)}`,
      kind: "recruiter_auto_approved" as const,
      at: at(row),
      label: row.subjectId?.fullName ?? "A recruiter",
      // The event's reason is "email domain matches <Company>"; the company
      // is the detail that makes the feed row meaningful.
      detail: row.reason ? row.reason.replace(/^email domain matches /, "") : null,
      href: "/admin/recruiters",
    })),
    ...jobs.map((row) => ({
      id: `job:${String(row._id)}`,
      kind: "job_posted" as const,
      at: at(row),
      label: row.title,
      detail: row.company?.name ?? null,
      href: "/admin/review/jobs",
    })),
    ...companies.map((row) => ({
      id: `company:${String(row._id)}`,
      kind: "company_created" as const,
      at: at(row),
      label: row.name,
      detail: null,
      href: "/admin/review/companies",
    })),
    ...applications.map((row) => ({
      id: `application:${String(row._id)}`,
      kind: "application_submitted" as const,
      at: at(row),
      // The role applied to, never the applicant. See the note above.
      label: row.job?.title ?? "a role",
      detail: null,
      href: null,
    })),
  ];

  items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return { items: items.slice(0, ACTIVITY_LIMIT) };
}
