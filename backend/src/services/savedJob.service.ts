import mongoose from "mongoose";
import type { PaginatedResponse, PaginationQuery, SavedJobDto } from "@jobportal/shared";

import { Application } from "../models/application.model.js";
import { Job } from "../models/job.model.js";
import { SavedJob } from "../models/savedJob.model.js";
import { AppError } from "../lib/AppError.js";
import { toJobDto } from "./job.service.js";

/** Mongo's duplicate-key error, whatever driver version raised it. */
function isDuplicateKey(err: unknown): boolean {
  return (err as { code?: number }).code === 11000;
}

/**
 * Save a role. Idempotent by design: the unique {seeker, job} index is the
 * dedupe (insert-first, not findOne-then-create — the same race the
 * applications index closes), and a duplicate key means the save already
 * exists, which is the state the caller asked for. Saving is a toggle, and a
 * toggle must never error on stale button state — unlike apply's 409, because
 * applying twice is a real conflict while saving twice is the same state.
 */
export async function saveJob(seekerId: string, jobId: string): Promise<boolean> {
  const job = await Job.findById(jobId).select("_id");
  if (!job) throw AppError.notFound("JOB_NOT_FOUND", "Job not found");
  try {
    await SavedJob.create({ seeker: seekerId, job: jobId });
    return true;
  } catch (err) {
    if (isDuplicateKey(err)) return false;
    throw err;
  }
}

/**
 * Unsave a role. Idempotent for the same reason: deleting a save that is
 * already gone produces the state the caller asked for.
 */
export async function unsaveJob(seekerId: string, jobId: string): Promise<void> {
  await SavedJob.deleteOne({ seeker: seekerId, job: jobId });
}

/** The per-job check the detail page's button state reads. */
export async function isJobSaved(seekerId: string, jobId: string): Promise<boolean> {
  const saved = await SavedJob.findOne({ seeker: seekerId, job: jobId }).select("_id");
  return saved !== null;
}

/**
 * The caller's shortlist, newest first.
 *
 * Jobs are resolved in two steps — raw ids off the saves first, then one
 * populate keyed on them — because populating the save itself destroys the
 * stored id when the ref is gone, and that id is what the DTO's `jobId`, the
 * Unsave target, and the applied join all key on.
 */
export async function listSavedJobs(
  seekerId: string,
  { page, limit }: PaginationQuery,
): Promise<PaginatedResponse<SavedJobDto>> {
  const filter = { seeker: seekerId };
  const [total, saves] = await Promise.all([
    SavedJob.countDocuments(filter),
    SavedJob.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
  ]);

  const rows = saves as unknown as Array<{
    _id: unknown;
    createdAt?: Date;
    job: unknown;
  }>;
  const jobIds = rows.map((row) => String(row.job));

  // The applied join: one bounded read of this seeker's applications on the
  // page's stored job ids, rather than a per-row lookup or a client-side scan
  // of the paginated applied list (which would mark an applied role as
  // unapplied past that list's page).
  const [jobs, appliedRows] = await Promise.all([
    jobIds.length === 0
      ? Promise.resolve([])
      : Job.find({ _id: mongoose.trusted({ $in: jobIds }) }).populate("company"),
    jobIds.length === 0
      ? Promise.resolve([])
      : Application.find({
          applicant: seekerId,
          job: mongoose.trusted({ $in: jobIds }),
        }).select("job"),
  ]);
  const jobById = new Map(jobs.map((job) => [String(job._id), job]));
  const appliedJobIds = new Set(appliedRows.map((row) => String(row.job)));

  return {
    items: rows.map((row) => {
      const jobId = String(row.job);
      const job = jobById.get(jobId);
      return {
        id: String(row._id),
        jobId,
        savedAt: row.createdAt?.toISOString() ?? "",
        job: job && typeof job === "object" && "title" in job ? toJobDto(job as never) : null,
        applied: appliedJobIds.has(jobId),
      };
    }),
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}
