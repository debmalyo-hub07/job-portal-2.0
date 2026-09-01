import mongoose, { Types } from "mongoose";
import type { Portal } from "@jobportal/shared";
import { AppError } from "../lib/AppError.js";
import { dispatch, sendRendered } from "../lib/mailer.js";
import { renderAccountReinstatedEmail, renderAccountSuspendedEmail } from "../lib/emailTemplates.js";
import { logger } from "../lib/logger.js";
import { AccountEvent } from "../models/accountEvent.model.js";
import { accountModel } from "./account.service.js";
import { revokeAllForSubject } from "./session.service.js";

/**
 * Project D's moderation actions on an existing account — the levers the
 * console's counters always implied and nothing could pull.
 *
 * Every write is GUARDED on the current status, the same doctrine as
 * `approveRecruiter`: two admins racing produce exactly one event and one
 * mail, the loser's update matches nothing and returns quietly, and a
 * double-click is a no-op rather than an error to interpret.
 */
export async function suspendAccount(
  portal: Portal,
  id: string,
  reason: string,
  adminId: string,
): Promise<void> {
  const account = await accountModel(portal).findById(id).select("email status");
  if (!account) throw AppError.notFound("NOT_FOUND", "No such account.");

  const result = await accountModel(portal).updateOne(
    { _id: id, status: "active" },
    {
      $set: {
        status: "suspended",
        suspension: { reason, suspendedAt: new Date(), byAdminId: adminId },
        // Kills outstanding ACCESS tokens too, not just refresh families —
        // the same machinery the email change uses. A suspension that leaves
        // live sessions for the token's remaining lifetime is not a
        // suspension; it is a scheduled one.
        sessionsInvalidatedAt: new Date(),
      },
    },
  );
  if (result.matchedCount === 0) return; // already suspended or pending — nothing to do

  await revokeAllForSubject(new Types.ObjectId(id), portal);

  // The reason reaches the owner on both channels they have left: the mail
  // (no password needed) and the login refusal (the first thing they try).
  // Pending recruiters reach the deny path instead — their suspension has its
  // own copy and its own event kind.
  dispatch(sendRendered(account.email, renderAccountSuspendedEmail(reason)));
  await recordAccountEvent(portal, id, "suspended", reason, adminId);
  logger.info({ portal, subjectId: id }, "account suspended");
}

/**
 * Restores a suspended account to the state it held before suspension.
 *
 * The last suspend-or-deny event decides the target: an oversight suspension
 * returns to `active`; a denial (pending → suspended, from the approval
 * queue) is *undone* into `pending`, not leapfrogged into hiring — the
 * recruiter the queue rejected must go back through the queue, not around it.
 */
export async function reinstateAccount(portal: Portal, id: string, adminId: string): Promise<void> {
  const account = await accountModel(portal).findById(id).select("email status");
  if (!account) throw AppError.notFound("NOT_FOUND", "No such account.");

  // Read the decision being undone. Only suspend/deny rows end in a suspended
  // status, so this is the full candidate set. `trusted` because `kind` is a
  // plain enum of strings — without it Mongoose tries to cast the `$in`
  // object itself to a string and the query dies as a 500.
  const lastDecision = await AccountEvent.findOne({
    portal,
    subjectId: id,
    kind: mongoose.trusted({ $in: ["suspended", "denied"] }),
  }).sort({ createdAt: -1 });
  const target = lastDecision?.kind === "denied" ? "pending" : "active";

  const result = await accountModel(portal).updateOne(
    { _id: id, status: "suspended" },
    {
      $set: { status: target },
      $unset: { suspension: "" },
    },
  );
  if (result.matchedCount === 0) return; // already active — nothing to do

  await revokeAllForSubject(new Types.ObjectId(id), portal);

  dispatch(sendRendered(account.email, renderAccountReinstatedEmail()));
  await recordAccountEvent(portal, id, "reinstated", null, adminId);
  logger.info({ portal, subjectId: id, target }, "account reinstated");
}

/** Records an oversight decision. Approve/deny call this from approval.service;
 *  the automation's auto_approved kind calls it from the same core. */
export async function recordAccountEvent(
  portal: Portal,
  subjectId: string,
  kind: "approved" | "auto_approved" | "denied" | "suspended" | "reinstated",
  reason: string | null,
  actorAdminId: string | null,
): Promise<void> {
  await AccountEvent.create({
    portal,
    subjectId,
    kind,
    reason,
    actorAdminId,
  });
}

/** The per-account history, newest first, with the acting admin's email. */
export async function accountHistory(portal: Portal, id: string) {
  const events = await AccountEvent.find({ portal, subjectId: id })
    .sort({ createdAt: -1 })
    .limit(100)
    .populate<{ email: string } | null>("actorAdminId", "email");
  return events.map((event) => ({
    id: String(event._id),
    kind: event.kind,
    reason: event.reason ?? null,
    at: event.createdAt.toISOString(),
    actorEmail: (event.actorAdminId as unknown as { email?: string } | null)?.email ?? null,
  }));
}
