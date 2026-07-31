import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const companySchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
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
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

export type CompanyDocument = InferSchemaType<typeof companySchema>;
export const Company: Model<CompanyDocument> = mongoose.model<CompanyDocument>(
  "Company",
  companySchema,
);
