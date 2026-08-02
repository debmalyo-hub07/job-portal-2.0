import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
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
export const Application: Model<ApplicationDocument> = defineModel<ApplicationDocument>(
  "Application",
  applicationSchema,
);
