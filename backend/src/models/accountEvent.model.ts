import { Schema, type InferSchemaType, type Model } from "mongoose";
import { PORTALS } from "@jobportal/shared";
import { defineModel } from "./defineModel.js";

/**
 * Project D's status history: one row per oversight decision, append-only.
 *
 * The account row's `status` answers "what is this account now"; this
 * collection answers "how did it get there, who decided, and why". The
 * `reason` is the admin's own words on suspend/deny — bounded at the schema
 * boundary like every other operator-typed string that reaches a mail body.
 *
 * No TTL anywhere: the history is the record. Correcting a decision is a new
 * row (reinstate), never an edit — an edited audit trail is a rewritten one.
 */
export const ACCOUNT_EVENT_KINDS = [
  "approved",
  "denied",
  "suspended",
  "reinstated",
] as const;

const accountEventSchema = new Schema(
  {
    portal: { type: String, enum: PORTALS, required: true },
    subjectId: { type: Schema.Types.ObjectId, required: true },
    kind: { type: String, enum: ACCOUNT_EVENT_KINDS, required: true },
    /** Null on approve/reinstate — those need no justification to their subject. */
    reason: { type: String, default: null },
    /**
     * The acting admin. Null where a script made the decision (seed:admin).
     * `ref` is what lets the history populate the actor's email without the
     * service issuing a second query per row.
     */
    actorAdminId: { type: Schema.Types.ObjectId, default: null, ref: "Admin" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// The console's per-account view is "newest first, this subject only".
accountEventSchema.index({ portal: 1, subjectId: 1, createdAt: -1 });

export type AccountEventDocument = InferSchemaType<typeof accountEventSchema>;
export const AccountEvent: Model<AccountEventDocument> =
  defineModel<AccountEventDocument>("AccountEvent", accountEventSchema);
