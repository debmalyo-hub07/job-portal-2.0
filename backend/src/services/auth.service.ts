import { Types, type HydratedDocument } from "mongoose";
import type { Portal, RegisterBody, SessionUser } from "@jobportal/shared";
import { AppError } from "../lib/AppError.js";
import { env } from "../config/env.js";
import { hashPassword } from "../lib/password.js";
import { generateOtp, hashOtp } from "../lib/otp.js";
import { dispatch, sendOtpEmail, sendRendered } from "../lib/mailer.js";
import { renderOtpBudgetEmail } from "../lib/emailTemplates.js";
import { OtpCode, type OtpPurpose } from "../models/otpCode.model.js";
import { OtpBudget, type OtpBudgetDocument } from "../models/otpBudget.model.js";
import {
  accountModel,
  findAccountByEmail,
  findAccountById,
  type AccountDocument,
} from "./account.service.js";

/**
 * A saved account, not the bare schema shape.
 *
 * `AccountDocument` comes from `InferSchemaType`, which does NOT include `_id` —
 * so annotating a created document with it makes every `account._id` below a
 * compile error. Everything in this file works with persisted documents, so the
 * hydrated type is the honest one.
 */
type AccountDoc = HydratedDocument<AccountDocument>;

/**
 * Creates an unverified account and mails a code. Issues NO session.
 *
 * Ordering matters and is not the inherited order: existence is checked before
 * anything expensive happens. The old registration uploaded an avatar to
 * Cloudinary *first*, so an unauthenticated caller could burn storage quota
 * indefinitely by re-registering an address that already existed. There is no
 * file in this path at all now — avatars move to the profile screen, after
 * verification.
 */
export async function register(portal: Portal, input: RegisterBody): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const existing = await findAccountByEmail(portal, email);

  if (existing) {
    // Registration cannot hide existence — the user has to be told the address
    // is taken. What it must not do is leak anything *else*: not whether the
    // account is verified, not whether it has a password, not when it was made.
    throw AppError.conflict("EMAIL_TAKEN", "An account already exists for this email address.");
  }

  const passwordHash = await hashPassword(input.password);
  let account: AccountDoc;
  try {
    account = await accountModel(portal).create({
      email,
      fullName: input.fullName,
      phone: input.phone ?? null,
      passwordHash,
      emailVerifiedAt: null,
    });
  } catch (error) {
    // The findOne above is a fast path, not the guarantee — two concurrent
    // registrations both pass it. The unique email index is the guarantee;
    // translate its violation instead of letting it surface as a 500.
    if ((error as { code?: number }).code === 11000) {
      throw AppError.conflict("EMAIL_TAKEN", "An account already exists for this email address.");
    }
    throw error;
  }

  await issueOtp(portal, account, "verify_email");
}

/**
 * Mints a code, stores its peppered hash, and sends it.
 *
 * Shared by register, resend, and forgot-password so the three cannot drift.
 * Rate limiting is the caller's job (Task 10) — this function is also called
 * from the migration script, which must not be throttled.
 */
async function issueOtp(portal: Portal, account: AccountDoc, purpose: OtpPurpose): Promise<void> {
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
    subjectId: account._id,
    subjectType: portal,
    attempts: 0,
    expiresAt: new Date(Date.now() + env().OTP_TTL_MINUTES * 60_000),
  });

  // Mail last, and ENQUEUED rather than awaited — dispatch() is Task 4's
  // fire-and-forget. Two reasons. Ordering: a Brevo failure after the store
  // leaves a consistent database (account exists unverified, resend recovers),
  // whereas mailing first and failing to store hands the user a code that can
  // never work. Availability and timing: awaiting the send would let a Brevo
  // outage fail registration, and would make forgot-password's response time
  // reveal whether an address exists (Task 8 reuses this function on both of
  // its branches).
  dispatch(sendOtpEmail(account.email, code, purpose));
}

/**
 * Redeems a verify_email code and issues a session.
 *
 * `email` selects WHICH HASH TO COMPUTE. It never selects which account to
 * mutate. Those are different things, and conflating them was the design's
 * pre-auth account-takeover hole: validating the code against any matching row
 * while writing to the account named in the body let an attacker redeem their
 * own code against a stranger's account.
 *
 * The account mutated below is `otp.subjectId` — read off the row the atomic
 * update just matched. If the caller's email belongs to a different account,
 * the computed hash simply does not match and the request fails; there is no
 * path by which the two can disagree and the write still land.
 */
export async function verifyEmail(portal: Portal, email: string, code: string): Promise<AccountDoc> {
  const account = await findAccountByEmail(portal, email);

  // Absent account: do the same work and fail identically. Skipping straight to
  // the error here would make response time an existence oracle.
  const subjectId = account?._id ?? new Types.ObjectId();

  // Charge the cumulative budget BEFORE looking anything up, atomically.
  // Wrong guesses can never increment the per-code `attempts` counter — a wrong
  // code hashes to a digest that matches no row — so this charge is the only
  // thing that meters brute force. It is refunded by clearOtpBudget on success.
  await chargeOtpAttempt(portal, subjectId, "verify_email");

  const otp = await OtpCode.findOneAndUpdate(
    {
      codeHash: hashOtp(code, subjectId),
      purpose: "verify_email",
      subjectType: portal, // a seeker code cannot redeem on the recruiter mount
      subjectId, // redundant with the subject-bound hash, and kept anyway
      consumedAt: null,
      expiresAt: { $gt: new Date() },
      // Meters the CORRECT code only (see above); kept as a backstop against
      // pathological replay of a known-good code before consumption lands.
      attempts: { $lt: env().OTP_MAX_ATTEMPTS },
    },
    { $inc: { attempts: 1 } }, // increment in the SAME operation that matches
    { new: true },
  );

  if (!otp) {
    throw AppError.badRequest("OTP_INVALID", "That code is incorrect or has expired.");
  }

  // Single-use, enforced by a guarded write rather than a read. Two concurrent
  // requests with the same correct code both match above; only one wins here.
  const claimed = await OtpCode.findOneAndUpdate(
    { _id: otp._id, consumedAt: null },
    { $set: { consumedAt: new Date() } },
  );
  if (!claimed) {
    throw AppError.badRequest("OTP_INVALID", "That code is incorrect or has expired.");
  }

  const target = await accountModel(portal).findByIdAndUpdate(
    otp.subjectId, // <-- the account comes from HERE. Never from `email`.
    { $set: { emailVerifiedAt: new Date() }, $unset: { failedLoginCount: "" } },
    { new: true },
  );
  if (!target) throw AppError.badRequest("OTP_INVALID", "That code is incorrect or has expired.");

  await clearOtpBudget(portal, otp.subjectId, "verify_email");
  return target;
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
async function chargeOtpAttempt(
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
async function clearOtpBudget(
  portal: Portal,
  subjectId: Types.ObjectId,
  purpose: OtpPurpose,
): Promise<void> {
  await OtpBudget.deleteOne({ subjectId, subjectType: portal, purpose });
}

/**
 * Uniform 200 whether the address is unknown, unverified, or already verified
 * — and uniform WORK on every branch, or this endpoint is a free existence
 * probe. The ghost write costs the same database round-trips as the real one.
 */
export async function resendVerification(portal: Portal, email: string): Promise<void> {
  const account = await findAccountByEmail(portal, email);
  if (account && account.emailVerifiedAt === null) {
    await issueOtp(portal, account, "verify_email");
    return;
  }
  await writeGhostOtp(portal, "verify_email");
}

/**
 * issueOtp's exact database work against a subject id that cannot exist.
 * Nothing can ever redeem the row (the ghost ObjectId resolves to no account,
 * and the digest is bound to it); the TTL index removes it within the hour.
 * Shared with forgot-password in Task 8.
 */
async function writeGhostOtp(portal: Portal, purpose: OtpPurpose): Promise<void> {
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

/**
 * The ONLY projection from an account document to the wire. Field-by-field on
 * purpose — a spread would leak whatever the schema grows next. This is the
 * function that makes `getApplicants`-style hash leaks structurally impossible
 * on the new surface.
 */
export function toSessionUser(portal: Portal, account: AccountDoc): SessionUser {
  return {
    id: String(account._id),
    portal,
    fullName: account.fullName,
    email: account.email,
    emailVerified: account.emailVerifiedAt !== null,
    avatarUrl: account.avatarUrl ?? null,
  };
}
