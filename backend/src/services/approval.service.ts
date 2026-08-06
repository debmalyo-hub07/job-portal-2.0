import { Recruiter } from "../models/recruiter.model.js";
import { AppError } from "../lib/AppError.js";
import { dispatch, sendRendered } from "../lib/mailer.js";
import { renderRecruiterApprovedEmail } from "../lib/emailTemplates.js";
import { logger } from "../lib/logger.js";

export interface PendingRecruiterDto {
  id: string;
  fullName: string;
  email: string;
  createdAt: string;
}

/**
 * Explicit projection, never the raw document — the same rule as every other
 * DTO here. `passwordHash` is `select: false`, but relying on that alone is how
 * a hash eventually ships.
 *
 * Capped at 50 like every other list endpoint. Oldest first: a queue is worked
 * from the front, and a recruiter who has waited longest should not be pushed
 * off the page by newer signups.
 */
export async function listPendingRecruiters(): Promise<PendingRecruiterDto[]> {
  const rows = await Recruiter.find({ status: "pending" })
    .select("fullName email createdAt")
    .sort({ createdAt: 1 })
    .limit(50);

  return rows.map((r) => ({
    id: String(r._id),
    fullName: r.fullName,
    email: r.email,
    createdAt: (r as unknown as { createdAt: Date }).createdAt.toISOString(),
  }));
}

/**
 * Flips pending → active.
 *
 * The update is GUARDED on the current status rather than an unconditional
 * set, so two admins racing the same approval send exactly one mail: the
 * loser matches nothing and returns quietly. That is also what makes the route
 * idempotent — approving an already-active recruiter is a no-op, not an error,
 * because a double-click must not be a failure the admin has to interpret.
 *
 * A missing recruiter is a genuine 404: the id came from the admin's own list,
 * so an unknown one means the row was deleted, not that ownership is being
 * probed. The 404-for-foreign-resources rule does not apply — an admin has no
 * "foreign" recruiters.
 */
export async function approveRecruiter(id: string): Promise<void> {
  const exists = await Recruiter.exists({ _id: id });
  if (!exists) throw AppError.notFound("NOT_FOUND", "No such recruiter.");

  const result = await Recruiter.updateOne(
    { _id: id, status: "pending" },
    { $set: { status: "active" } },
  );
  if (result.matchedCount === 0) return; // already approved

  const account = await Recruiter.findById(id).select("email");
  if (account) dispatch(sendRendered(account.email, renderRecruiterApprovedEmail()));
  logger.info({ recruiterId: id }, "recruiter approved");
}
