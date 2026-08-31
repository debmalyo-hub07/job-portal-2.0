import { Schema, type InferSchemaType, type Model } from "mongoose";
import { authFields, applyAuthIndexes } from "./authFields.js";
import { defineModel } from "./defineModel.js";

const seekerSchema = new Schema(
  {
    ...authFields,
    profile: {
      headline: { type: String, default: null, maxlength: 120 },
      bio: { type: String, default: null, maxlength: 2000 },
      skills: { type: [String], default: [] },
      experienceYears: { type: Number, default: null, min: 0, max: 60 },
      location: { type: String, default: null },
      // 4A.3 — self-reported fit signals the matching pipeline reads. Absent on
      // legacy docs; the pipeline treats unknowns as no-penalty (returns 1), so
      // an unbackfilled profile scores high rather than zeroing on these fields.
      salaryMin: { type: Number, default: null, min: 0 },
      salaryMax: { type: Number, default: null, min: 0 },
      openToRemote: { type: Boolean, default: null },
    },
    resume: {
      storageKey: { type: String, default: null },
      originalName: { type: String, default: null },
      mimeType: { type: String, default: null },
      sizeBytes: { type: Number, default: null },
      uploadedAt: { type: Date, default: null },
    },
    /**
     * P2 of the location-aware phase: the consented device location, from a
     * one-time browser geolocation the reverse endpoint normalized. City-level
     * only — coordinates are used transiently by that endpoint and never
     * stored. `updatedAt` records when the consent last ran, so a stale city
     * is at least a dated one.
     *
     * Top-level, not inside `profile`: the profile block is the seeker's
     * self-description (typed), this is a device observation (consented) —
     * different provenance, different lifetime.
     */
    geoLocation: {
      type: new Schema(
        {
          city: { type: String, required: true },
          country: { type: String, required: true },
          updatedAt: { type: Date, default: Date.now },
        },
        { _id: false },
      ),
      default: null,
    },
  },
  { timestamps: true },
);

applyAuthIndexes(seekerSchema);

export type SeekerDocument = InferSchemaType<typeof seekerSchema>;
export const Seeker: Model<SeekerDocument> = defineModel<SeekerDocument>("Seeker", seekerSchema);
