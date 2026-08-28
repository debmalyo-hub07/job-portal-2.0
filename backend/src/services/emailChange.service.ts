import mongoose from "mongoose";
import type { Portal } from "@jobportal/shared";
import { env } from "../config/env.js";
import { AppError } from "../lib/AppError.js";
import { hashOtp } from "../lib/otp.js";
import { verifyPassword } from "../lib/password.js";
import { sendOtpEmail, sendRendered, dispatch } from "../lib/mailer.js";
import { renderEmailChangeWarningEmail } from "../lib/emailTemplates.js";
import { OtpCode } from "../models/otpCode.model.js";
import { EmailRegistry } from "../models/emailRegistry.model.js";
import { accountModel } from "./account.service.js";
import { revokeAllForSubject } from "./session.service.js";
import { chargeOtpAttempt, clearOtpBudget, issueOtp, type AccountDoc } from "./otp.service.js";

/** How long a started change stays redeemable. Matches the pending-resume UX. */
const PENDING_TTL_MS = 24 * 3_600_000;

/** The one uniform rejection confirm ever answers with. */
const otpInvalid = () =>
  AppError.badRequest("OTP_INVALID", "That code is incorrect or has expired.");

/**
 * Step 1 of an email change: verify the caller really is the owner, record
 * the intent, and mail the code.
 *
 * The account comes from the session (the controller read it); `newEmail`
 * is the only request-driven input that reaches the database. The password
 * re-entry is what keeps a stolen session from redirecting the account's
 * recovery mail to an attacker's mailbox: missing and wrong answer
 * identically, so the response never says whether the account has one.
 *
 * Nothing is reserved here. The registry is only touched at redemption, so
 * starting changes you never finish cannot squat addresses.
 *
 * Admins get the stronger opening: the code goes to the CURRENT address
 * (stage `confirm-current`) and the new address is not even mailed until that
 * one is redeemed. The highest-privilege account needs the password AND the
 * current mailbox before a change begins.
 */
export async function startEmailChange(
  portal: Portal,
  account: AccountDoc,
  input: { newEmail: string; password?: string },
): Promise<string> {
  const newEmail = input.newEmail.trim().toLowerCase();

  if (newEmail === account.email) {
    // A no-op is not a change; refusing it here keeps "start" from minting a
    // code that proves a mailbox the account already owns.
    throw AppError.badRequest("EMAIL_UNCHANGED", "That is already your email address.");
  }

  // Password re-entry iff the account HAS one — the step-up that keeps a
  // stolen session from redirecting the account's recovery mail to an
  // attacker's mailbox. Missing and wrong answer identically, so the response
  // never says whether the account has a password. Google-only accounts (no
  // hash) skip the field: there is no credential to re-enter.
  if ((account.passwordHash ?? null) !== null) {
    const passwordOk = await verifyPassword(input.password ?? "", account.passwordHash ?? null);
    if (!passwordOk) {
      throw AppError.unauthorized("PASSWORD_INVALID", "That password is incorrect.");
    }
  }

  // Advisory availability lookup — fast feedback, not the guarantee. The
  // registry insert at redemption is the guarantee; someone may take the
  // address between here and there, and that is fine.
  const takenRow = await EmailRegistry.findOne({ email: newEmail }).lean();
  if (takenRow) {
    throw AppError.conflict("EMAIL_TAKEN", "An account already exists for this email address.");
  }

  const isAdmin = portal === "admin";

  // Latest attempt wins: a fresh start overwrites any older pending and
  // resets any half-finished admin stage — the same idiom as
  // `pendingGoogleLink`.
  await accountModel(portal).updateOne(
    { _id: account._id },
    {
      $set: {
        pendingEmailChange: {
          newEmail,
          requestedAt: new Date(),
          confirmedCurrentAt: null,
        },
      },
    },
  );

  if (isAdmin) {
    await issueOtp(
      portal,
      account,
      "change_email",
      "confirm-current",
      (code) => sendOtpEmail(account.email, code, "change_email", "confirm-current"),
    );
    return "A confirmation code is on its way to your current email address.";
  }

  await issueOtp(
    portal,
    account,
    "change_email",
    "confirm-new",
    (code) => sendOtpEmail(newEmail, code, "change_email", "confirm-new"),
  );
  // The warning to the OLD address: a change was requested, and if it was not
  // the owner asking, their session may be compromised. The code went to the
  // new address; nothing changes until it is entered.
  dispatch(sendRendered(account.email, renderEmailChangeWarningEmail(newEmail)));
  return "A confirmation code is on its way to your new email address.";
}

/**
 * Step 2: redeem the code and — for the final stage — perform the swap.
 *
 * The account comes from the session, never the body, and the pending change
 * is read off the account. No pending, one older than 24 hours, a wrong code
 * and an expired code are deliberately indistinguishable: uniform
 * `OTP_INVALID`, with `EMAIL_TAKEN` as the only distinct rejection.
 *
 * Admin state machine: a `confirm-current` code redeems only while
 * `confirmedCurrentAt` is null, and sets it — which is when the `confirm-new`
 * code is mailed. A `confirm-new` code redeems only once that has happened.
 * Seekers and recruiters never read `confirmedCurrentAt`; their single code
 * is the whole proof, and their start leaves it null.
 */
export async function confirmEmailChange(
  portal: Portal,
  account: AccountDoc,
  code: string,
): Promise<string> {
  // Atomic pre-charge, refunded on success — the same doctrine as
  // verify-email and reset-password. It runs BEFORE the pending is read, so a
  // confirm with no pending costs the budget exactly like a wrong guess.
  await chargeOtpAttempt(portal, account._id, "change_email");

  const pending = account.pendingEmailChange ?? null;
  const newEmail = pending?.newEmail ?? null;
  const requestedAt = pending?.requestedAt ?? null;
  // No pending, and one older than 24 hours, are deliberately
  // indistinguishable from a wrong code — one uniform rejection.
  if (
    newEmail === null ||
    requestedAt === null ||
    Date.now() - requestedAt.getTime() > PENDING_TTL_MS
  ) {
    throw otpInvalid();
  }

  const expectedStage =
    portal === "admin" && pending?.confirmedCurrentAt == null
      ? ("confirm-current" as const)
      : ("confirm-new" as const);

  // Stage is enforced IN the query: a stage-1 code presented as stage 2 fails
  // the lookup itself, and the pending state must agree with which stage the
  // caller is on. Both layers, deliberately.
  const otp = await OtpCode.findOneAndUpdate(
    {
      codeHash: hashOtp(code, account._id),
      purpose: "change_email",
      stage: expectedStage,
      subjectType: portal,
      subjectId: account._id,
      consumedAt: null,
      expiresAt: mongoose.trusted({ $gt: new Date() }),
      attempts: mongoose.trusted({ $lt: env().OTP_MAX_ATTEMPTS }),
    },
    { $inc: { attempts: 1 } },
    { new: true },
  );
  if (!otp) throw otpInvalid();

  // Single-use, enforced by a guarded write rather than a read.
  const claimed = await OtpCode.findOneAndUpdate(
    { _id: otp._id, consumedAt: null },
    { $set: { consumedAt: new Date() } },
  );
  if (!claimed) throw otpInvalid();

  // Admin stage 1: current mailbox proven — advance the state machine and
  // mail the second code to the NEW address. The guarded update is the
  // "redeems only while confirmedCurrentAt is null" half: a re-start that
  // overwrote the pending between read and write makes this miss, and the
  // whole confirm answers OTP_INVALID.
  if (expectedStage === "confirm-current") {
    const advanced = await accountModel(portal).findOneAndUpdate(
      {
        _id: account._id,
        "pendingEmailChange.newEmail": newEmail,
        "pendingEmailChange.confirmedCurrentAt": null,
      },
      { $set: { "pendingEmailChange.confirmedCurrentAt": new Date() } },
      { new: true },
    );
    if (!advanced) throw otpInvalid();

    await issueOtp(
      portal,
      account,
      "change_email",
      "confirm-new",
      (code) => sendOtpEmail(newEmail, code, "change_email", "confirm-new"),
    );
    return "Your current email is confirmed. A second code is on its way to your new address.";
  }

  // Final stage: the swap, in order. Insert → update → delete, so the
  // availability guarantee (the unique index) is checked before anything
  // mutates, and the old address is freed only once the account has moved.
  let swapped: AccountDoc | null = null;
  try {
    await EmailRegistry.create({
      email: newEmail,
      portal,
      subjectId: account._id,
    });
  } catch (error) {
    // Someone took the address between start and confirm — the real check,
    // which start's advisory lookup could only hint at.
    if ((error as { code?: number }).code === 11000) {
      throw AppError.conflict("EMAIL_TAKEN", "An account already exists for this email address.");
    }
    throw error;
  }

  try {
    swapped = await accountModel(portal).findOneAndUpdate(
      // Guarded on the pending still naming this change: a newer start that
      // raced the redeem must not have its pending wiped by this one.
      { _id: account._id, "pendingEmailChange.newEmail": newEmail },
      {
        $set: {
          email: newEmail,
          // The code proved the new mailbox — this is the same proof
          // verify-email asks for.
          emailVerifiedAt: new Date(),
          // Kills outstanding ACCESS tokens too, not just refresh families:
          // every session is dead by design, including the caller's.
          sessionsInvalidatedAt: new Date(),
        },
        $unset: { pendingEmailChange: "" },
      },
      { new: true },
    );
    if (!swapped) throw otpInvalid();
  } catch (error) {
    // The account update failed after the new row was inserted: free the row
    // so a half-finished swap cannot squat the new address.
    await EmailRegistry.deleteOne({ email: newEmail, subjectId: account._id });
    throw error;
  }

  // The old address is free from this instant and may be registered by
  // anyone. Scoped to this subject and NOT the new row: deleteMany({ subjectId })
  // would remove the row the swap just wrote.
  await EmailRegistry.deleteMany({
    subjectId: account._id,
    email: mongoose.trusted({ $ne: newEmail }),
  });

  await revokeAllForSubject(account._id, portal);
  await clearOtpBudget(portal, account._id, "change_email");

  return "Email updated. Sign in with your new address.";
}
