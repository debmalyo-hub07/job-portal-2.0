import { PORTALS } from "@jobportal/shared";
import { Schema, type InferSchemaType, type Model } from "mongoose";
import { defineModel } from "./defineModel.js";

/**
 * One row per account, cross-portal: `{ email, portal, subjectId }`.
 *
 * MongoDB cannot put a unique index across the `seekers`, `recruiters` and
 * `admins` collections, so this collection *is* that index. The unique email
 * constraint on each account collection stays as a backstop that makes registry
 * drift fail loudly on the same portal; this row is what guards across portals.
 *
 * The write order at every account-creation site is: insert this row first,
 * then create the account. An E11000 here is the cross-portal `EMAIL_TAKEN`
 * refusal; the per-collection index remains the same-portal one. If the account
 * creation fails, a compensating delete frees the row.
 *
 * ADR-0001 rejected "email globally unique" on two grounds — a racy
 * cross-collection check, and losing the dual seeker+recruiter account. Both
 * are answered by the 2026-08-27 decision this implements: the registry's
 * unique index is the guarantee (the same doctrine `register()` already
 * states for its own index), and one-address-one-account is a product
 * decision taken at the moment of cheapest reversal (zero collisions).
 */
const emailRegistrySchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    portal: { type: String, enum: PORTALS, required: true },
    subjectId: { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: true },
);

emailRegistrySchema.index({ email: 1 }, { unique: true });
// The compensating delete, the email-change swap and the reconciliation scan
// all key on the subject rather than the address.
emailRegistrySchema.index({ subjectId: 1 });

export type EmailRegistryDocument = InferSchemaType<typeof emailRegistrySchema>;
export const EmailRegistry: Model<EmailRegistryDocument> =
  defineModel<EmailRegistryDocument>("EmailRegistry", emailRegistrySchema);
