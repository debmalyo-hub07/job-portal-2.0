import { Schema, type InferSchemaType, type Model } from "mongoose";
import { defineModel } from "./defineModel.js";

const companySchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    website: {
      type: String,
    },
    location: {
      type: String,
    },
    logo: {
      type: String, // URL to the logo file
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "Recruiter",
      required: true,
    },
  },
  { timestamps: true },
);

companySchema.index({ userId: 1, name: 1 }, { unique: true });

export type CompanyDocument = InferSchemaType<typeof companySchema>;
export const Company: Model<CompanyDocument> = defineModel<CompanyDocument>(
  "Company",
  companySchema,
);
