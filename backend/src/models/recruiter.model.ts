import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { authFields, applyAuthIndexes } from "./authFields.js";

const recruiterSchema = new Schema(
  {
    ...authFields,
    designation: { type: String, default: null },
    company: { type: Schema.Types.ObjectId, ref: "Company", default: null },
  },
  { timestamps: true },
);

applyAuthIndexes(recruiterSchema);

export type RecruiterDocument = InferSchemaType<typeof recruiterSchema>;
export const Recruiter: Model<RecruiterDocument> = mongoose.model<RecruiterDocument>(
  "Recruiter",
  recruiterSchema,
);
