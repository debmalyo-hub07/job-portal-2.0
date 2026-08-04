import mongoose, { Types, type HydratedDocument } from "mongoose";
import type { Portal, RegisterBody, SessionUser } from "@jobportal/shared";
import { AppError } from "../lib/AppError.js";
import { env } from "../config/env.js";
import { burnPasswordTime, hashPassword, needsRehash, verifyPassword } from "../lib/password.js";
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
import { revokeAllForSubject } from "./session.service.js";

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
      expiresAt: mongoose.trusted({ $gt: new Date() }),
      // Meters the CORRECT code only (see above); kept as a backstop against
      // pathological replay of a known-good code before consumption lands.
      attempts: mongoose.trusted({ $lt: env().OTP_MAX_ATTEMPTS }),
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
 * Password sign-in.
 *
 * Every line's position here is one of the review findings — read the ordering
 * comments before rearranging anything. Three invariants shape the whole
 * function: one failure message for every rejection reason, a lockout that
 * cannot be weaponised against the account it protects, and no branch that is
 * measurably faster than another.
 */
export async function login(portal: Portal, email: string, password: string): Promise<AccountDoc> {
  const account = await findAccountByEmail(portal, email, { withSecret: true });

  if (!account) {
    // Same Argon2 cost as the real branch, then the same error. Without the
    // burn, response time says which addresses exist.
    await burnPasswordTime(password);
    throw AppError.unauthorized("INVALID_CREDENTIALS", "Incorrect email or password.");
  }

  // ALWAYS verify before branching on lock state, so a locked account costs
  // the same time as a wrong password and the lock is not a timing oracle.
  // verifyPassword(_, null) burns a dummy verify for Google-only accounts, so
  // "this account has no password" is not an oracle either.
  //
  // `?? null` because Mongoose types a non-required path as possibly undefined,
  // and `select: false` means passwordHash genuinely can be absent. Collapsing
  // undefined to null routes an absent hash through the dummy-verify burn
  // instead of past it, which is exactly the branch that must not be fast.
  const passwordOk = await verifyPassword(password, account.passwordHash ?? null);

  const lockedUntil = account.lockedUntil ?? null;
  if (lockedUntil !== null && lockedUntil > new Date()) {
    // Uniform message even when the password was right: the lock IS the
    // backoff. A distinct "locked" response would confirm both that the
    // account exists and that guesses are landing. No counter increment
    // during the lock — the attacker cannot ratchet it further.
    throw AppError.unauthorized("INVALID_CREDENTIALS", "Incorrect email or password.");
  }

  if (!passwordOk) {
    await registerLoginFailure(portal, account._id);
    throw AppError.unauthorized("INVALID_CREDENTIALS", "Incorrect email or password.");
  }

  if (account.status !== "active") {
    // Suspended reads exactly like a bad credential — account state is not
    // for strangers. The owner finds out through support, not through probes.
    throw AppError.unauthorized("INVALID_CREDENTIALS", "Incorrect email or password.");
  }

  if (account.emailVerifiedAt === null) {
    // Security invariant 10: this distinct code is reachable ONLY here, after
    // passwordOk. A wrong password on an unverified account took the uniform
    // exit above, so login is not an existence-and-state oracle.
    throw AppError.forbidden("EMAIL_NOT_VERIFIED", "Confirm your email address to continue.");
  }

  // Success: clear counters, and transparently upgrade a legacy bcrypt hash.
  // Migrated accounts carry bcrypt (the migration has no plaintext to work
  // with); this is the only moment plaintext and account meet, so this is
  // where the upgrade happens (see needsRehash, Task 3).
  const updates: Record<string, unknown> = { failedLoginCount: 0, lockedUntil: null };
  if (needsRehash(account.passwordHash ?? null)) {
    updates.passwordHash = await hashPassword(password);
  }
  await accountModel(portal).updateOne({ _id: account._id }, { $set: updates });

  return account;
}

/**
 * Exponential backoff from the threshold, atomically counted, capped hard.
 *
 * The cap is load-bearing: an uncapped lock is a denial-of-service primitive —
 * anyone who knows an address can keep that account locked forever with wrong
 * passwords. 5th failure locks 1 minute, doubling per failure to
 * LOGIN_LOCK_MAX_MINUTES (default 15), cleared entirely by one success. Never
 * keyed by IP (a corporate NAT shares one), never touching OTP paths.
 */
async function registerLoginFailure(portal: Portal, id: Types.ObjectId): Promise<void> {
  const updated = await accountModel(portal).findOneAndUpdate(
    { _id: id },
    { $inc: { failedLoginCount: 1 } },
    { new: true },
  );
  if (!updated) return;

  const over = updated.failedLoginCount - env().LOGIN_LOCK_THRESHOLD;
  if (over < 0) return;

  const minutes = Math.min(2 ** over, env().LOGIN_LOCK_MAX_MINUTES);
  await accountModel(portal).updateOne(
    { _id: id },
    { $set: { lockedUntil: new Date(Date.now() + minutes * 60_000) } },
  );
}

/** Response-time floor for the enumeration-sensitive endpoints. */
const UNIFORM_FLOOR_MS = 250;

async function holdUntil(started: number, floorMs: number): Promise<void> {
  const remaining = started + floorMs - Date.now();
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
}

/**
 * Always 200, and the same work on both branches: a real account gets a real
 * OTP row and an ENQUEUED send; an absent address gets the ghost write and no
 * send. Neither branch awaits Brevo — dispatch() is fire-and-forget precisely
 * so the 50-300ms provider round-trip never shows up in the response time —
 * and the floor absorbs the residual skew. "Uniform in body" without this is
 * still an existence oracle; see the spec's hardening section.
 */
export async function forgotPassword(portal: Portal, email: string): Promise<void> {
  const started = Date.now();
  const account = await findAccountByEmail(portal, email);
  if (account) {
    await issueOtp(portal, account, "reset_password");
  } else {
    await writeGhostOtp(portal, "reset_password");
  }
  await holdUntil(started, UNIFORM_FLOOR_MS);
}

/**
 * Redeems a reset_password code and rotates the credential.
 *
 * No session is issued afterwards. The resetter proved mailbox control, not
 * possession of the new password from a device we should trust silently — they
 * sign in once with the password they just chose, which also exercises the new
 * credential immediately.
 */
export async function resetPassword(
  portal: Portal,
  email: string,
  code: string,
  newPassword: string,
): Promise<void> {
  const account = await findAccountByEmail(portal, email);
  const subjectId = account?._id ?? new Types.ObjectId();

  // Atomic pre-charge, refunded on success — identical to verify-email.
  await chargeOtpAttempt(portal, subjectId, "reset_password");

  const otp = await OtpCode.findOneAndUpdate(
    {
      codeHash: hashOtp(code, subjectId),
      purpose: "reset_password", // a verify_email code cannot rotate a credential
      subjectType: portal,
      subjectId,
      consumedAt: null,
      expiresAt: mongoose.trusted({ $gt: new Date() }),
      attempts: mongoose.trusted({ $lt: env().OTP_MAX_ATTEMPTS }),
    },
    { $inc: { attempts: 1 } },
    { new: true },
  );
  if (!otp) throw AppError.badRequest("OTP_INVALID", "That code is incorrect or has expired.");

  const claimed = await OtpCode.findOneAndUpdate(
    { _id: otp._id, consumedAt: null },
    { $set: { consumedAt: new Date() } },
  );
  if (!claimed) throw AppError.badRequest("OTP_INVALID", "That code is incorrect or has expired.");

  // The account comes from the ROW, never from `email` (invariant 1).
  // `withSecret` because the reuse check below is a credential comparison.
  const target = await findAccountById(portal, String(otp.subjectId), { withSecret: true });
  if (!target) throw AppError.badRequest("OTP_INVALID", "That code is incorrect or has expired.");

  // Reuse check AFTER redemption, deliberately: checking before would spend an
  // Argon2 verify on every unauthenticated garbage-code request — a CPU
  // faucet. The cost of this ordering is that a reuse rejection has consumed
  // the code and the user requests another. Annoying once, abusable never.
  if (await verifyPassword(newPassword, target.passwordHash ?? null)) {
    throw AppError.badRequest(
      "PASSWORD_REUSED",
      "Choose a password you have not used here before.",
    );
  }

  const passwordHash = await hashPassword(newPassword);
  await accountModel(portal).updateOne(
    { _id: otp.subjectId },
    {
      $set: {
        passwordHash,
        // Kills outstanding ACCESS tokens too. Revoking refresh families only
        // stops sessions from CONTINUING; the access token already in an
        // attacker's hands stays valid for up to ACCESS_TOKEN_TTL_MINUTES,
        // which is exactly the window the owner is trying to close. The
        // authenticate middleware compares iat against this cutoff (Task 6).
        sessionsInvalidatedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
        // Redeeming a mailed code is the same mailbox proof verify-email asks
        // for, so an unverified account that resets becomes verified. Without
        // this, "forgot my password before verifying" is unrecoverable.
        ...(target.emailVerifiedAt === null ? { emailVerifiedAt: new Date() } : {}),
      },
    },
  );

  await revokeAllForSubject(otp.subjectId, portal);
  await clearOtpBudget(portal, otp.subjectId, "reset_password");
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
