import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const refreshTokenSchema = new Schema(
  {
    /** HMAC-SHA256(JWT_REFRESH_PEPPER, token). Never the token itself. */
    tokenHash: { type: String, required: true, unique: true },
    subjectId: { type: Schema.Types.ObjectId, required: true },
    /** The authoritative portal for this session. The refresh handler reads it
     *  from here — never from the request URL. See spec amendment, finding 5. */
    subjectType: { type: String, enum: ["seeker", "recruiter"], required: true },
    familyId: { type: String, required: true },
    userAgent: { type: String, default: null },
    ip: { type: String, default: null },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedBy: { type: String, default: null },
    /** Set when this token was successfully exchanged, for grace-window logic. */
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
refreshTokenSchema.index({ familyId: 1 });
refreshTokenSchema.index({ subjectId: 1, subjectType: 1 });

export type RefreshTokenDocument = InferSchemaType<typeof refreshTokenSchema>;
export const RefreshToken: Model<RefreshTokenDocument> =
  mongoose.model<RefreshTokenDocument>("RefreshToken", refreshTokenSchema);
