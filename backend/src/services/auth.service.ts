import mongoose, { Types, type HydratedDocument } from "mongoose";
import { isMinor, type AccountStatus, type Portal, type RegisterBody, type SessionUser } from "@jobportal/shared";
import { AppError } from "../lib/AppError.js";
import { env } from "../config/env.js";
import { burnPasswordTime, hashPassword, needsRehash, verifyPassword } from "../lib/password.js";
import { hashOtp } from "../lib/otp.js";
import { sendRendered } from "../lib/mailer.js";
import { renderPasswordSetupEmail } from "../lib/emailTemplates.js";
import { OtpCode } from "../models/otpCode.model.js";
import {
  accountModel,
  findAccountByEmail,
  findAccountById,
  isProfileComplete,
  type AccountDocument,
} from "./account.service.js";
import { revokeAllForSubject } from "./session.service.js";
import { chargeOtpAttempt, clearOtpBudget, issueOtp, writeGhostOtp } from "./otp.service.js";
import {
  EMAIL_TAKEN,
  isDuplicateKeyError,
  releaseEmail,
  reserveEmail,
} from "./emailRegistry.service.js";

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
 *
 * The email registry row is claimed BEFORE the account is created, with the
 * account's `_id` minted up front. The registry's unique index is the
 * cross-portal guarantee — one address, one account, on any portal — and an
 * E11000 there is the `EMAIL_TAKEN` refusal. If the account create then fails,
 * the compensating delete frees the row so a half-failed registration squats
 * nothing.
 */
export async function register(portal: Portal, input: RegisterBody): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const existing = await findAccountByEmail(portal, email);

  if (existing) {
    // Registration cannot hide existence — the user has to be told the address
    // is taken. What it must not do is leak anything *else*: not whether the
    // account is verified, not whether it has a password, not when it was made.
    throw EMAIL_TAKEN();
  }

  // Hash before claiming the address, so the registry row exists for the
  // shortest possible window between claim and account.
  const passwordHash = await hashPassword(input.password);
  const subjectId = await reserveEmail(portal, email);

  let account: AccountDoc;
  try {
    account = await accountModel(portal).create({
      _id: subjectId,
      email,
      fullName: input.fullName,
      passwordHash,
      emailVerifiedAt: null,
      // Recruiters land pending and are useless until an admin approves them:
      // registration alone must not confer the ability to post jobs or read
      // applicants. Seekers and admins are unaffected — admins never reach
      // this path at all, because the admin router omits /register.
      status: portal === "recruiter" ? "pending" : "active",
    });
  } catch (error) {
    // Free the address the account never took, then answer. The E11000 path
    // is registry drift made loud (same-portal duplicate with no row); any
    // other failure is a genuine 500, and the delete still ran.
    await releaseEmail(subjectId);
    if (isDuplicateKeyError(error)) {
      throw EMAIL_TAKEN();
    }
    throw error;
  }

  await issueOtp(portal, account, "verify_email");
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

  // `+passwordHash` because the session projection answers `hasPassword` and
  // this update is where the returned document comes from. A boolean in the
  // DTO is the point — the hash itself still never crosses the wire.
  const target = await accountModel(portal)
    .findByIdAndUpdate(
      otp.subjectId, // <-- the account comes from HERE. Never from `email`.
      { $set: { emailVerifiedAt: new Date() }, $unset: { failedLoginCount: "" } },
      { new: true },
    )
    .select("+passwordHash");
  if (!target) throw AppError.badRequest("OTP_INVALID", "That code is incorrect or has expired.");

  await clearOtpBudget(portal, otp.subjectId, "verify_email");
  return target;
}

/**
 * Per-account, per-purpose failure budget — the implementation lives in
 * `otp.service.ts`, shared with the email-change flow. See the notes there.
 */

/**
 * While mail is available, returns a uniform 200 whether the address is
 * unknown, unverified, or already verified — and does uniform WORK on every
 * branch, or this endpoint is a free existence probe. The route returns a
 * uniform 503 before reaching this service while the mail circuit is open.
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

  if (account.status === "suspended") {
    // Project D's amendment: the owner sees WHY, but only here — after the
    // password checked out. A stranger probing the address took the uniform
    // exit above, so account state is still not for strangers; the only person
    // who can read the reason is someone who already knows the password.
    //
    // (Pending still logs in normally below: the pending recruiter needs a
    // session to see the "awaiting approval" screen.)
    const reason = account.suspension?.reason ?? null;
    throw AppError.forbidden(
      "ACCOUNT_SUSPENDED",
      reason
        ? `This account is suspended: ${reason}`
        : "This account is suspended.",
    );
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
 * While mail is available, returns 200 with the same work on both branches: a
 * real account gets a real OTP row and an ENQUEUED send; an absent address gets
 * the ghost write and no send. The route returns a uniform 503 before reaching
 * this service while the mail circuit is open. Neither branch awaits Brevo, so
 * provider latency never becomes an existence oracle; the floor absorbs the
 * residual database skew.
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
 * Where an invited admin goes to redeem the setup code.
 *
 * Built here rather than in `emailTemplates.ts` so that module needs no `env()`
 * — its templates are pure functions of their arguments, and a config read at
 * import time there would run before the test setup has an environment.
 *
 * The address rides in the query string so the form can prefill it; the code
 * never does. See `renderPasswordSetupEmail`.
 */
function adminSetupUrl(email: string): string {
  return `${env().WEB_BASE_URL}/admin/set-password?email=${encodeURIComponent(email)}`;
}

/**
 * Mails a `reset_password` code to an account that has no password yet.
 *
 * The seed:admin script's entry point into the OTP machinery. A thin wrapper
 * over `issueOtp` rather than a second implementation: the code generation,
 * peppered hashing, supersede-the-previous-code and budget rules must not
 * exist twice. Exported because the script lives outside this module and
 * `issueOtp` is deliberately private.
 *
 * Distinct from `forgotPassword`, which resolves the account from an email and
 * burns uniform time to avoid being an existence oracle. Here the caller
 * already holds the account and there is no untrusted input to protect.
 */
export async function issuePasswordSetupCode(
  portal: Portal,
  account: AccountDoc,
): Promise<void> {
  await issueOtp(portal, account, "reset_password", null, (code) =>
    sendRendered(
      account.email,
      renderPasswordSetupEmail(code, env().OTP_TTL_MINUTES, adminSetupUrl(account.email)),
    ),
  );
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
 *
 * `hasPassword` is a boolean projection of `passwordHash`: the email-change
 * dialog needs to know whether to ask for the password, but the hash column is
 * `select: false` and stays that way — callers that reach here through a read
 * must select `+passwordHash` or the boolean reads false. `pendingEmailChange`
 * is owner-visible by design: a session holder can already see everything else
 * here, and the password step-up is what stops them *completing* a change.
 */
export function toSessionUser(portal: Portal, account: AccountDoc): SessionUser {
  const pending =
    account.pendingEmailChange?.newEmail != null &&
    account.pendingEmailChange.requestedAt != null
      ? {
          newEmail: account.pendingEmailChange.newEmail,
          requestedAt: account.pendingEmailChange.requestedAt.toISOString(),
          confirmedCurrentAt:
            account.pendingEmailChange.confirmedCurrentAt?.toISOString() ?? null,
        }
      : null;

  return {
    id: String(account._id),
    portal,
    fullName: account.fullName,
    email: account.email,
    emailVerified: account.emailVerifiedAt !== null,
    avatarUrl: account.avatarUrl ?? null,
    // A pending recruiter holds a valid session but may do no recruiter work.
    // Without this the client has a session it cannot explain — an empty
    // workspace and no reason for it.
    status: account.status as AccountStatus,
    profileComplete: isProfileComplete(portal, account),
    hasPassword: (account.passwordHash ?? null) !== null,
    // Derived on the server's clock; the client never recomputes age from the
    // wire DOB (see the DTO field's note).
    isMinor: isMinor(account.dob ?? null),
    pendingEmailChange: pending,
  };
}
