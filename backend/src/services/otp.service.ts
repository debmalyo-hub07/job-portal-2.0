import { Types, type HydratedDocument } from "mongoose";
import type { Portal } from "@jobportal/shared";
import { env } from "../config/env.js";
import { AppError } from "../lib/AppError.js";
import { generateOtp, hashOtp } from "../lib/otp.js";
import { dispatch, sendOtpEmail, sendRendered } from "../lib/mailer.js";
import { renderOtpBudgetEmail } from "../lib/emailTemplates.js";
import { OtpCode, type OtpPurpose, type OtpStage } from "../models/otpCode.model.js";
import { OtpBudget, type OtpBudgetDocument } from "../models/otpBudget.model.js";
import { findAccountById, type AccountDocument } from "./account.service.js";

/** Same reason as auth.service.ts: InferSchemaType has no `_id`. */
export type AccountDoc = HydratedDocument<AccountDocument>;

/**
 * Mints a code, stores its peppered hash, and sends it.
 *
 * Shared by register, resend, forgot-password, the admin setup mail and the
 * email-change flow so none of them can drift. Rate limiting is the caller's
 * job — this function is also called from the migration script, which must
 * not be throttled.
 *
 * `stage` is set only by the email-change flow; every other purpose stores
 * null and matches null.
 */
export async function issueOtp(
  portal: Portal,
  account: AccountDoc,
  purpose: OtpPurpose,
  stage: OtpStage | null = null,
  deliver: (code: string) => Promise<void> = (code) =>
    sendOtpEmail(account.email, code, purpose, stage),
): Promise<void> {
  const code = generateOtp();

  // Supersede any live code for this subject+purpose. Without this, every
  // resend leaves another independently-guessable code alive for its full TTL,
  // which multiplies the attacker's per-hour attempts by the number of resends
  // they trigger.
  await OtpCode.updateMany(
    { subjectId: account._id, subjectType: portal, purpose, consumedAt: null },
    { $set: { consumedAt: new Date() } },
  );

  await OtpCode.create({
    codeHash: hashOtp(code, account._id),
    purpose,
    stage,
    subjectId: account._id,
    subjectType: portal,
    attempts: 0,
    expiresAt: new Date(Date.now() + env().OTP_TTL_MINUTES * 60_000),
  });

  // Mail last, and ENQUEUED rather than awaited. Ordering: a provider failure
  // after the store leaves a consistent database (account exists unverified,
  // resend recovers), whereas mailing first and failing to store hands the user
  // a code that can never work. Timing: awaiting the send would make
  // forgot-password reveal whether an address exists. The route-level readiness
  // gate handles known outages before any account or OTP write; dispatch opens
  // that circuit if the provider fails after the check.
  dispatch(deliver(code));
}

/**
 * Per-account, per-purpose failure budget that OUTLIVES individual codes.
 *
 * The per-code cap of 5 cannot meter brute force at all here: a wrong guess
 * hashes to a digest that matches no row, so no row's counter moves. And even
 * a located row resets on resend — a fresh code arrives with attempts:0.
 * Without this cumulative charge the real rate is ~15-20 guesses/hour
 * indefinitely — about 0.25% per account-week, which against a breach list of
 * 10,000 addresses is roughly 25 takeovers a week with no per-account signal
 * ever tripping. This document is what survives new codes.
 *
 * Every redemption attempt pre-pays one failure; success deletes the row.
 * Throws OTP_BUDGET_EXHAUSTED once the window's budget is spent.
 *
 * The charge is a single atomic increment-and-check, not a read-then-decide. A
 * separate `assert` followed by a later `record` re-creates the exact
 * concurrency bug the per-code counter fixed: fifty parallel guesses all read
 * `failures < 20` before any of them has written, and all fifty proceed.
 */
export async function chargeOtpAttempt(
  portal: Portal,
  subjectId: Types.ObjectId,
  purpose: OtpPurpose,
): Promise<void> {
  const windowMs = env().OTP_BUDGET_WINDOW_HOURS * 3_600_000;
  const now = new Date();

  const charge = () =>
    OtpBudget.findOneAndUpdate(
      { subjectId, subjectType: portal, purpose },
      {
        $inc: { failures: 1 },
        // The window is fixed from first failure, not sliding — a sliding
        // window that each failure extends would let an attacker who has
        // already blown the budget keep the victim locked out of their own
        // recovery forever. $setOnInsert only, never $set.
        $setOnInsert: {
          windowStartedAt: now,
          expiresAt: new Date(now.getTime() + windowMs),
        },
      },
      { upsert: true, new: true },
    );

  let row: HydratedDocument<OtpBudgetDocument> | null;
  try {
    row = await charge();
  } catch (error) {
    // Two concurrent first-attempts can race the upsert on the unique
    // (subjectId, subjectType, purpose) index; the loser gets E11000. The row
    // exists now, so retrying once takes the plain-update path.
    if ((error as { code?: number }).code !== 11000) throw error;
    row = await charge();
  }

  // `upsert: true, new: true` always yields a document, but Mongoose types the
  // result nullable because TS cannot see that guarantee. Guarded rather than
  // `!`-asserted: a real null would mean the driver contract changed, and
  // reading `.failures` off undefined would surface as a baffling 500 instead
  // of naming what broke.
  if (!row) throw new Error("otp budget upsert returned no document");

  const max = env().OTP_BUDGET_MAX_FAILURES;
  if (row.failures > max) {
    // Exactly-once notification, at the crossing. Blocks REDEMPTION only —
    // password login is untouched, so an attacker burning a victim's budget
    // degrades recovery, never the account. See the Task 3 design note.
    if (row.failures === max + 1) {
      const owner = await findAccountById(portal, String(subjectId));
      if (owner) {
        dispatch(sendRendered(owner.email, renderOtpBudgetEmail(env().OTP_BUDGET_WINDOW_HOURS)));
      }
    }
    throw AppError.tooManyRequests(
      "OTP_BUDGET_EXHAUSTED",
      "Too many incorrect codes. Try again later or contact support.",
    );
  }
}

/** Refund on success: any correct redemption proves the owner has control. */
export async function clearOtpBudget(
  portal: Portal,
  subjectId: Types.ObjectId,
  purpose: OtpPurpose,
): Promise<void> {
  await OtpBudget.deleteOne({ subjectId, subjectType: portal, purpose });
}

/**
 * issueOtp's exact database work against a subject id that cannot exist.
 * Nothing can ever redeem the row (the ghost ObjectId resolves to no account,
 * and the digest is bound to it); the TTL index removes it within the hour.
 */
export async function writeGhostOtp(portal: Portal, purpose: OtpPurpose): Promise<void> {
  const code = generateOtp();
  const ghost = new Types.ObjectId();
  await OtpCode.updateMany(
    { subjectId: ghost, subjectType: portal, purpose, consumedAt: null },
    { $set: { consumedAt: new Date() } },
  );
  await OtpCode.create({
    codeHash: hashOtp(code, ghost),
    purpose,
    subjectId: ghost,
    subjectType: portal,
    attempts: 0,
    expiresAt: new Date(Date.now() + env().OTP_TTL_MINUTES * 60_000),
  });
}
