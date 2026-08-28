import mongoose from "mongoose";
import { isMinor, type Portal } from "@jobportal/shared";
import { env } from "../config/env.js";
import { AppError } from "../lib/AppError.js";
import { hashOtp } from "../lib/otp.js";
import { sendOtpEmail } from "../lib/mailer.js";
import { OtpCode } from "../models/otpCode.model.js";
import { accountModel } from "./account.service.js";
import { chargeOtpAttempt, clearOtpBudget, issueOtp, type AccountDoc } from "./otp.service.js";

/** The one uniform rejection a consent confirm ever answers with. */
const otpInvalid = () =>
  AppError.badRequest("OTP_INVALID", "That code is incorrect or has expired.");

/**
 * Project C: the guardian's OK that opens a 16-17-year-old's account.
 *
 * The shape mirrors email change's start/confirm pair on purpose — the reader
 * who understood that flow already understands this one — with one deliberate
 * difference: there is no password step-up and no address being contested,
 * because this is the completion step's sibling, not an authenticated account
 * mutation. The gate is what protects the caller: an incomplete minor cannot
 * reach any consequential write to re-consent against.
 */
export async function startGuardianConsent(
  portal: Portal,
  account: AccountDoc,
  email: string,
): Promise<string> {
  // A recruiter/admin never reaches the guardian stage (their completions
  // refuse a minor DOB outright), but this mount serves both portals and a
  // stale client could post anyway. Refuse rather than record nonsense.
  if (portal !== "seeker" || !isMinorAccount(account)) {
    throw AppError.badRequest("GUARDIAN_NOT_REQUIRED", "This account does not need guardian consent.");
  }
  // Already consented: the flow is complete, and a second consent would
  // overwrite the proof on file. Re-consent is a support operation.
  if (account.guardianConsent?.consentedAt != null) {
    throw AppError.conflict("GUARDIAN_ALREADY_CONSENTED", "Guardian consent is already on file.");
  }

  const guardianEmail = email.trim().toLowerCase();
  // Latest attempt wins, the pendingGoogleLink idiom: a re-send for a corrected
  // address overwrites the earlier one, and the confirm step reads this.
  await accountModel(portal).updateOne(
    { _id: account._id },
    {
      $set: {
        pendingGuardian: { email: guardianEmail, requestedAt: new Date() },
      },
    },
  );

  // The OTP row is subject-bound to the MINOR's account id like every other
  // purpose; only the delivery address differs. A code minted for one account
  // can never confirm another.
  await issueOtp(portal, account, "guardian_consent", null, (code) =>
    sendOtpEmail(guardianEmail, code, "guardian_consent"),
  );

  return "A confirmation code is on its way to your guardian's email address.";
}

/** The model stores a UTC-midnight Date; `isMinor` takes exactly that. */
function isMinorAccount(account: AccountDoc): boolean {
  return isMinor(account.dob ?? null);
}

export async function confirmGuardianConsent(
  portal: Portal,
  account: AccountDoc,
  code: string,
): Promise<string> {
  // Atomic pre-charge, refunded on success — the same doctrine as every other
  // redemption. Before the pending is read, so a confirm with no pending costs
  // the budget exactly like a wrong guess.
  await chargeOtpAttempt(portal, account._id, "guardian_consent");

  const pendingEmail = account.pendingGuardian?.email ?? null;
  if (pendingEmail === null) throw otpInvalid();

  const otp = await OtpCode.findOneAndUpdate(
    {
      codeHash: hashOtp(code, account._id),
      purpose: "guardian_consent",
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

  // Guarded on the pending still naming the address the code was mailed to: a
  // re-start that raced the redeem must not have its pending consumed by this
  // one. The matched document is what carries consent forward.
  const updated = await accountModel(portal).findOneAndUpdate(
    { _id: account._id, "pendingGuardian.email": pendingEmail },
    {
      $set: { guardianConsent: { email: pendingEmail, consentedAt: new Date() } },
      $unset: { pendingGuardian: "" },
    },
    { new: true },
  );
  if (!updated) throw otpInvalid();

  await clearOtpBudget(portal, account._id, "guardian_consent");

  // The account's own gate is now clear (dob + consent), so the caller is
  // told in the same sentence the client navigates on.
  return "Guardian consent recorded. Your account is ready.";
}
