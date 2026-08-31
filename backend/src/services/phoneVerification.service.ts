import mongoose from "mongoose";
import type { Portal } from "@jobportal/shared";

import { env } from "../config/env.js";
import { AppError } from "../lib/AppError.js";
import { hashOtp } from "../lib/otp.js";
import { OtpCode } from "../models/otpCode.model.js";
import { chargeOtpAttempt, clearOtpBudget, issueOtp } from "./otp.service.js";
import { sendSms, smsBody } from "./smsTransport.js";
import type { AccountDoc } from "./otp.service.js";

/**
 * Phone verification, dormant by design — P3 of the location-aware phase.
 *
 * The user decided (2026-08-31) that proving control of a number costs money
 * on every carrier-grade channel, so no SMS provider is configured. What
 * ships is everything EXCEPT the transport: the OTP purpose, the budget, the
 * redemption, and the routes — which mount only when `SMS_PROVIDER_KEY`
 * exists. Activation is one function (`services/smsTransport.ts`) plus a key;
 * see the deployment runbook's activation path.
 */

export async function startPhoneVerification(portal: Portal, account: AccountDoc): Promise<string> {
  if (!account.phone) {
    throw AppError.badRequest("PHONE_MISSING", "Add a phone number to your profile first.");
  }
  await issueOtp(portal, account, "verify_phone", null, (code) => sendSms(account.phone!, smsBody(code)));
  return "A verification code is on its way to your phone.";
}

/**
 * Redemption, mirroring `verifyEmail`'s shape: charge the budget before any
 * lookup (wrong guesses never move a row's own counter), match on the
 * subject-bound hash, claim single-use, then set `phoneVerifiedAt` from the
 * OTP row's subject — never from anything the request named.
 */
export async function verifyPhoneCode(portal: Portal, account: AccountDoc, code: string): Promise<string> {
  const subjectId = account._id;
  await chargeOtpAttempt(portal, subjectId, "verify_phone");

  const otp = await OtpCode.findOneAndUpdate(
    {
      codeHash: hashOtp(code, subjectId),
      purpose: "verify_phone",
      subjectType: portal,
      subjectId,
      consumedAt: null,
      expiresAt: mongoose.trusted({ $gt: new Date() }),
      attempts: mongoose.trusted({ $lt: env().OTP_MAX_ATTEMPTS }),
    },
    { $inc: { attempts: 1 } },
    { new: true },
  );
  if (!otp) {
    throw AppError.badRequest("OTP_INVALID", "That code is incorrect or has expired.");
  }

  const claimed = await OtpCode.findOneAndUpdate(
    { _id: otp._id, consumedAt: null },
    { $set: { consumedAt: new Date() } },
  );
  if (!claimed) {
    throw AppError.badRequest("OTP_INVALID", "That code is incorrect or has expired.");
  }

  await clearOtpBudget(portal, subjectId, "verify_phone");
  account.phoneVerifiedAt = new Date();
  await account.save();
  return "Your phone number is verified.";
}
