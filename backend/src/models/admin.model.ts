import { Schema, type InferSchemaType, type Model } from "mongoose";
import { authFields, applyAuthIndexes } from "./authFields.js";
import { defineModel } from "./defineModel.js";

/**
 * Admins carry no profile fields of their own. A seeker has a resume and a
 * recruiter has a designation; an admin is an authority over the domain, not a
 * participant in it, so the schema is `authFields` alone.
 *
 * A separate collection rather than a flag on `recruiters` (ADR-0006): the
 * portal boundary is cryptographic, because `accessTokenKey(portal)` derives a
 * per-portal signing key. A boolean would put admins and recruiters on one key
 * and reduce that boundary to a single comparison.
 */
const adminSchema = new Schema({ ...authFields }, { timestamps: true });

applyAuthIndexes(adminSchema);

export type AdminDocument = InferSchemaType<typeof adminSchema>;
export const Admin: Model<AdminDocument> = defineModel<AdminDocument>("Admin", adminSchema);
