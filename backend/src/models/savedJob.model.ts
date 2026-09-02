import { Schema, type InferSchemaType, type Model } from "mongoose";
import { defineModel } from "./defineModel.js";

/**
 * One saved role: a seeker's private shortlist entry, nothing more. No
 * status, no notes — the questions a shortlist answers are "which roles am I
 * still deciding on" (the applied join, computed at read time) and "when did
 * I save this" (timestamps). Nothing here reaches a recruiter surface.
 */
const savedJobSchema = new Schema(
  {
    seeker: {
      type: Schema.Types.ObjectId,
      ref: "Seeker",
      required: true,
    },
    job: {
      type: Schema.Types.ObjectId,
      ref: "Job",
      required: true,
    },
  },
  { timestamps: true },
);

// One save per seeker per job, enforced at the storage layer — the same
// race-closing shape the applications index has: two parallel saves must not
// create two rows.
savedJobSchema.index({ seeker: 1, job: 1 }, { unique: true });

export type SavedJobDocument = InferSchemaType<typeof savedJobSchema>;
export const SavedJob: Model<SavedJobDocument> = defineModel<SavedJobDocument>(
  "SavedJob",
  savedJobSchema,
);
