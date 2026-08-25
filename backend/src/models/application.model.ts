import { Schema, type InferSchemaType, type Model } from "mongoose";
import { APPLICATION_STATUSES, PORTALS } from "@jobportal/shared";
import { defineModel } from "./defineModel.js";

/**
 * One recorded transition. Append-only — the service pushes, never rewrites, so
 * the timeline a candidate reads is the sequence that actually happened.
 */
const applicationEventSchema = new Schema(
  {
    status: { type: String, enum: APPLICATION_STATUSES, required: true },
    at: { type: Date, required: true },
    byPortal: { type: String, enum: PORTALS, required: true },
  },
  { _id: false },
);

const applicationSchema = new Schema(
  {
    job: {
      type: Schema.Types.ObjectId,
      ref: "Job",
      required: true,
    },
    applicant: {
      type: Schema.Types.ObjectId,
      ref: "Seeker",
      required: true,
    },
    /**
     * The seven-stage pipeline, enum taken from `@jobportal/shared` rather than
     * restated. The previous three-value list was written out here while the
     * shared `APPLICATION_STATUSES` export sat unused, so the schema could not
     * store the pipeline the rest of the codebase claimed to have.
     */
    status: {
      type: String,
      enum: APPLICATION_STATUSES,
      default: "applied",
    },
    history: {
      type: [applicationEventSchema],
      default: [],
    },
    /**
     * When the application reached a terminal stage, or null while it is live.
     * Derivable from `history`, but stored so "closed applications" is an indexed
     * query rather than a scan over subdocuments.
     */
    decidedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// One application per seeker per job, enforced at the storage layer — the old
// findOne-then-create dedupe was a race.
applicationSchema.index({ job: 1, applicant: 1 }, { unique: true });

export type ApplicationDocument = InferSchemaType<typeof applicationSchema>;
export const Application: Model<ApplicationDocument> = defineModel<ApplicationDocument>(
  "Application",
  applicationSchema,
);
