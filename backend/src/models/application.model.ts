import { Schema, type InferSchemaType, type Model } from "mongoose";
import { defineModel } from "./defineModel.js";

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
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
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
