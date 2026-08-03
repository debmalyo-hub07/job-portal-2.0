import { Schema, type InferSchemaType, type Model } from "mongoose";
import { defineModel } from "./defineModel.js";

const otpCodeSchema = new Schema(
  {
    /**
     * HMAC-SHA256(OTP_PEPPER, `${subjectId}:${code}`).
     *
     * Not a bare SHA-256: the space is a million values, so the full rainbow
     * table is 32 MB and any read of this collection — a dump, a staging copy,
     * a log line — converts directly into sessions. Keying with a pepper that
     * lives only in env means a database read alone yields nothing, and binding
     * the subject into the input means a recovered code cannot be replayed
     * against a different account even with the pepper.
     */
    codeHash: { type: String, required: true },
    purpose: { type: String, enum: ["verify_email", "reset_password"], required: true },
    subjectId: { type: Schema.Types.ObjectId, required: true },
    subjectType: { type: String, enum: ["seeker", "recruiter"], required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// The redemption query. Order matters: equality fields first, then range.
otpCodeSchema.index({ codeHash: 1, purpose: 1, subjectType: 1 });
otpCodeSchema.index({ subjectId: 1, purpose: 1 });
otpCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type OtpCodeDocument = InferSchemaType<typeof otpCodeSchema>;
export const OtpCode: Model<OtpCodeDocument> =
  defineModel<OtpCodeDocument>("OtpCode", otpCodeSchema);

/** Exported for the mailer and the services; keep in sync with the enum above. */
export type OtpPurpose = "verify_email" | "reset_password";
