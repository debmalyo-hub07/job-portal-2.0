import { Schema, type InferSchemaType, type Model } from "mongoose";
import { JOB_STATUSES } from "@jobportal/shared";
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
    department: {
      type: String,
      default: "Other",
      required: true,
    },
    position: {
      type: String,
      required: true,
    },
    // 4A.3 — flat remote flag. Legacy docs default false; the matching pipeline
    // derives its `workMode` from this (true → "remote", else "onsite"). The
    // `location` field stays the human-written string; it is NOT the remote
    // signal, so a "Remote"-titled job with the flag unset still scores on-site.
    remote: {
      type: Boolean,
      default: false,
    },
    // A posting is open, or the role is filled and it has left the board.
    //
    // Rows written before this field existed have no field at all, and every
    // read treats that as open. That is why the board filters with
    // `$ne: "closed"` and never with equality on "open": Mongo does not match a
    // missing field against an equality, so the latter would hide every job
    // posted before this shipped — 198 of them in production.
    status: {
      type: String,
      enum: JOB_STATUSES,
      default: "open",
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

// 4A.4 — scan replacement for the faceted-search filter tuple 4B's left rail
// selects: location × jobType × experienceLevel × salary. All four are
// direct equality/range fields on the document, so a single ascending
// compound covers the filter without a collection scan.
//
// The keyword path scans by design: a text index would change result meaning
// — it cannot match the literal pattern ".*" that escaped-regex currently and
// deliberately returns exactly one hit for, breaking the search contract
// (job.test.ts). Text indexing is deferred until keyword semantics get a
// deliberate exact-vs-ranked decision; it is not a silent swap.
jobSchema.index({ location: 1, jobType: 1, department: 1, experienceLevel: 1, salary: 1 });

export type JobDocument = InferSchemaType<typeof jobSchema>;
export const Job: Model<JobDocument> = defineModel<JobDocument>("Job", jobSchema);
