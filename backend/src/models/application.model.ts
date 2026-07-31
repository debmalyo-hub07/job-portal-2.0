import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const applicationSchema = new Schema(
  {
    job: {
      type: Schema.Types.ObjectId,
      ref: "Job",
      required: true,
    },
    applicant: {
      type: Schema.Types.ObjectId,
      ref: "User",
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

export type ApplicationDocument = InferSchemaType<typeof applicationSchema>;
export const Application: Model<ApplicationDocument> = mongoose.model<ApplicationDocument>(
  "Application",
  applicationSchema,
);
