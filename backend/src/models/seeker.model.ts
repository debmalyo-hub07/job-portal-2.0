import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { authFields, applyAuthIndexes } from "./authFields.js";

const seekerSchema = new Schema(
  {
    ...authFields,
    profile: {
      headline: { type: String, default: null, maxlength: 120 },
      bio: { type: String, default: null, maxlength: 2000 },
      skills: { type: [String], default: [] },
      experienceYears: { type: Number, default: null, min: 0, max: 60 },
      location: { type: String, default: null },
    },
    resume: {
      storageKey: { type: String, default: null },
      originalName: { type: String, default: null },
      mimeType: { type: String, default: null },
      sizeBytes: { type: Number, default: null },
      uploadedAt: { type: Date, default: null },
    },
  },
  { timestamps: true },
);

applyAuthIndexes(seekerSchema);

export type SeekerDocument = InferSchemaType<typeof seekerSchema>;
export const Seeker: Model<SeekerDocument> = mongoose.model<SeekerDocument>("Seeker", seekerSchema);
