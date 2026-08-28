import { PORTALS } from "@jobportal/shared";
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
    /**
     * Keep in sync with the `otpBudget` enum and the `OtpPurpose` type, plus
     * `renderOtpEmail`'s branches — the four places a purpose exists.
     */
    purpose: {
      type: String,
      enum: ["verify_email", "reset_password", "change_email", "guardian_consent"],
      required: true,
    },
    /**
     * Which mailbox proof a `change_email` row demands. `confirm-current` is
     * the admin stage-1 code (sent to the address being left);
     * `confirm-new` proves the new mailbox and is the only stage seekers and
     * recruiters ever see. Null for every other purpose.
     *
     * The stage is enforced in the redemption query itself, so a stage-1 code
     * presented as stage 2 fails the lookup before any state is consulted.
     */
    stage: {
      type: String,
      enum: ["confirm-current", "confirm-new"],
      default: null,
    },
    subjectId: { type: Schema.Types.ObjectId, required: true },
    subjectType: { type: String, enum: PORTALS, required: true },
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
export type OtpPurpose =
  | "verify_email"
  | "reset_password"
  | "change_email"
  | "guardian_consent";

/** Which mailbox a `change_email` code was mailed to. See `stage` above. */
export type OtpStage = "confirm-current" | "confirm-new";
