import { z } from "zod";
import { portalSchema, type Portal } from "./auth.js";

/**
 * The four job types, title-case.
 *
 * These are the values `FilterCard` filters on by exact equality, and they were
 * hardcoded there while this export sat unused with lowercase values — so a
 * recruiter could post "Full Time" and the board could never show it under a
 * filter. Both sides import this now.
 *
 * Title-case rather than lowercase slugs because the facet and the existing rows
 * agree on it. Normalising to slugs with a display mapping is the better data
 * shape and needs a migration over free-text rows; that is a follow-up, not this
 * phase.
 */
export const JOB_TYPES = ["Full-time", "Part-time", "Internship", "Contract"] as const;
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
