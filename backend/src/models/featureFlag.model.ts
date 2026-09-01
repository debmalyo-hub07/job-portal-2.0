import { Schema, type InferSchemaType, type Model } from "mongoose";
import { FLAG_KEYS } from "@jobportal/shared";

import { defineModel } from "./defineModel.js";

/**
 * A flag's DEVIATION from its registry default — never the flag itself.
 * `enum: FLAG_KEYS` means a key removed from the registry can no longer be
 * written; its surviving row is skipped by reads (the registry is the source
 * of truth for what exists).
 */
const featureFlagSchema = new Schema(
  {
    key: { type: String, required: true, enum: [...FLAG_KEYS], unique: true },
    enabled: { type: Boolean, required: true },
    lastChangedBy: { type: Schema.Types.ObjectId, default: null },
    lastChangedAt: { type: Date, required: true },
  },
  { timestamps: false },
);

export type FeatureFlagDocument = InferSchemaType<typeof featureFlagSchema>;
export const FeatureFlag: Model<FeatureFlagDocument> = defineModel<FeatureFlagDocument>(
  "FeatureFlag",
  featureFlagSchema,
);
