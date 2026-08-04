import { Schema, type InferSchemaType, type Model } from "mongoose";
import { defineModel } from "./defineModel.js";

const jobSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    requirements: [
      {
        type: String,
      },
    ],
    salary: {
      type: Number,
      required: true,
    },
    experienceLevel: {
      type: Number,
      required: true,
    },
    location: {
      type: String,
      required: true,
    },
    jobType: {
      type: String,
      required: true,
    },
    position: {
      type: String,
      required: true,
    },
    company: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },
    created_by: {
      type: Schema.Types.ObjectId,
      ref: "Recruiter",
      required: true,
    },
  },
  { timestamps: true },
);

export type JobDocument = InferSchemaType<typeof jobSchema>;
export const Job: Model<JobDocument> = defineModel<JobDocument>("Job", jobSchema);
