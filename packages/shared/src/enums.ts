import { z } from "zod";
import { portalSchema, type Portal } from "./auth.js";

export const JOB_TYPES = ["full-time", "part-time", "internship", "contract"] as const;
export const WORK_MODES = ["onsite", "hybrid", "remote"] as const;
export const APPLICATION_STATUSES = [
  "applied",
  "reviewed",
  "shortlisted",
  "interview",
  "offered",
  "rejected",
  "withdrawn",
] as const;
/**
 * Portal is defined in auth.ts — this derives from it so there is one list.
 * Copied and frozen: zod's `.options` hands back the schema's own live array,
 * so exporting it directly would let a caller's `PORTALS.push(...)` mutate the
 * schema's option list while parsing (which uses a construction-time set) went
 * on accepting the original two.
 */
export const PORTALS: readonly Portal[] = Object.freeze([...portalSchema.options]);

export const jobTypeSchema = z.enum(JOB_TYPES);
export const workModeSchema = z.enum(WORK_MODES);
export const applicationStatusSchema = z.enum(APPLICATION_STATUSES);

export type JobType = z.infer<typeof jobTypeSchema>;
export type WorkMode = z.infer<typeof workModeSchema>;
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;
