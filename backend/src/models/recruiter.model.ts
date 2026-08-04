import { Schema, type InferSchemaType, type Model } from "mongoose";
import { authFields, applyAuthIndexes } from "./authFields.js";
import { defineModel } from "./defineModel.js";

const recruiterSchema = new Schema(
  {
    ...authFields,
    designation: { type: String, default: null },
  },
  { timestamps: true },
);

applyAuthIndexes(recruiterSchema);

export type RecruiterDocument = InferSchemaType<typeof recruiterSchema>;
export const Recruiter: Model<RecruiterDocument> = defineModel<RecruiterDocument>(
  "Recruiter",
  recruiterSchema,
);
