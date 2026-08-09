import mongoose from "mongoose";
import type {
  AdminCompanyDto,
  AdminJobDto,
  AdminListQuery,
  AdminOverviewDto,
  PaginatedResponse,
} from "@jobportal/shared";

import { Application } from "../models/application.model.js";
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
