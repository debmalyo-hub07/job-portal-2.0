import { Recruiter } from "../models/recruiter.model.js";
import { AppError } from "../lib/AppError.js";
import { dispatch, sendRendered } from "../lib/mailer.js";
import {
  renderRecruiterApprovedEmail,
  renderRecruiterDeniedEmail,
} from "../lib/emailTemplates.js";
import { logger } from "../lib/logger.js";
import { recordAccountEvent } from "./oversight.service.js";
import { sweepOrphanedCompanies } from "./catalogOwnership.service.js";

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
 * Flips pending → active — the core both approval paths run.
 *
 * The update is GUARDED on the current status rather than an unconditional
 * set, so two approvals racing send exactly one mail and mint one event: the
 * loser matches nothing and returns false. That is also what makes both
 * paths idempotent — approving an already-active recruiter is a no-op, not
 * an error, because a double-click (or an automation racing a human) must
 * not be a failure anyone has to interpret.
 *
 * A missing recruiter is a genuine 404: the id came from the caller's own
 * read, so an unknown one means the row was deleted, not that ownership is
 * being probed.
 */
async function activateRecruiter(
  id: string,
  eventKind: "approved" | "auto_approved",
  reason: string | null,
  adminId: string | null,
): Promise<boolean> {
  const exists = await Recruiter.exists({ _id: id });
  if (!exists) throw AppError.notFound("NOT_FOUND", "No such recruiter.");

  const result = await Recruiter.updateOne(
    { _id: id, status: "pending" },
    { $set: { status: "active" } },
  );
  if (result.matchedCount === 0) return false; // already decided

  // The history row. Written after the guarded update, so a raced no-op
  // records nothing — the doctrine that keeps two actors from minting two
  // events for one decision.
  await recordAccountEvent("recruiter", id, eventKind, reason, adminId);
  const account = await Recruiter.findById(id).select("email");
  if (account) dispatch(sendRendered(account.email, renderRecruiterApprovedEmail()));

  // P2's sweep, shared by both paths: one more active recruiter is one more
  // pair of hands for any orphaned company.
  void sweepOrphanedCompanies().catch((error) => {
    logger.error({ err: error }, "orphan sweep failed");
  });

  logger.info({ recruiterId: id, eventKind }, "recruiter activated");
  return true;
}

export async function approveRecruiter(id: string, adminId: string | null = null): Promise<void> {
  await activateRecruiter(id, "approved", null, adminId);
}

/**
 * P4's automation: approval without a human, earned by an email at an
 * employer's own domain. The matched company names the reason, because an
 * audit trail that cannot say WHY the gate opened is not an audit trail.
 */
export async function autoApproveRecruiter(id: string, matchedCompany: string): Promise<boolean> {
  return activateRecruiter(id, "auto_approved", `email domain matches ${matchedCompany}`, null);
}

/**
 * Flips pending → suspended, the queue's negative outcome.
 *
 * Guarded on `status: "pending"` for the same race reason as `approveRecruiter`,
 * but the failure to match is NOT quiet here. Approval is idempotent because a
 * double-click must not read as an error; denial is not, because the two ways it
 * can fail to match mean different things:
 *
 *   - already suspended → the work is done, nothing to say
 *   - **active** → someone else approved them while this admin was typing, and
 *     silently overwriting that decision with a suspension is the opposite of
 *     what the admin's button said. 409 sends them back to a refreshed queue.
 *
 * Suspension rather than deletion: the row is the evidence that the address was
 * already reviewed. Deleting it would let the same person re-register into the
 * queue and be re-reviewed from scratch.
 */
export async function denyRecruiter(id: string, reason: string, adminId: string | null = null): Promise<void> {
  const account = await Recruiter.findById(id).select("email status");
  if (!account) throw AppError.notFound("NOT_FOUND", "No such recruiter.");
  if (account.status === "active") {
    throw AppError.conflict(
      "RECRUITER_ALREADY_ACTIVE",
      "This recruiter has already been approved. Refresh the queue.",
    );
  }

  const result = await Recruiter.updateOne(
    { _id: id, status: "pending" },
    { $set: { status: "suspended" } },
  );
  if (result.matchedCount === 0) return; // already suspended

  // A denial IS a suspension in the model's terms, but the history keeps the
  // kinds distinct: `denied` is what makes a later reinstate return the
  // account to the approval queue rather than straight to active.
  await recordAccountEvent("recruiter", id, "denied", reason, adminId);
  dispatch(sendRendered(account.email, renderRecruiterDeniedEmail(reason)));
  logger.info({ recruiterId: id }, "recruiter denied");
}
