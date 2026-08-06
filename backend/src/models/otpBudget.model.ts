import { PORTALS } from "@jobportal/shared";
import { Schema, type InferSchemaType, type Model } from "mongoose";
import { defineModel } from "./defineModel.js";

/**
 * Cumulative failure budget per (account, purpose), independent of any one code.
 *
 * The 5-attempts-per-code cap is not a brute-force defense on its own: a new
 * code arrives with attempts:0, so re-requesting resets the budget. That works
 * out to 15-20 guesses per account per hour indefinitely — about 0.25% per
 * account-week, which against a 10,000-address list is roughly 25 takeovers a
 * week with nothing per-account ever tripping. This document is what survives
 * a new code.
 */
const otpBudgetSchema = new Schema(
  {
    subjectId: { type: Schema.Types.ObjectId, required: true },
    subjectType: { type: String, enum: PORTALS, required: true },
    purpose: { type: String, enum: ["verify_email", "reset_password"], required: true },
    failures: { type: Number, default: 0 },
    windowStartedAt: { type: Date, required: true },
    lockedUntil: { type: Date, default: null },
    /** TTL: the document is worthless once the window is well past. */
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

otpBudgetSchema.index({ subjectId: 1, subjectType: 1, purpose: 1 }, { unique: true });
otpBudgetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type OtpBudgetDocument = InferSchemaType<typeof otpBudgetSchema>;
export const OtpBudget: Model<OtpBudgetDocument> =
  defineModel<OtpBudgetDocument>("OtpBudget", otpBudgetSchema);
