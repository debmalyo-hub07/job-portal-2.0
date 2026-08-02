import { z } from "zod";
import { portalSchema } from "./auth.js";

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
/** Portal is defined in auth.ts — this derives from it so there is one list. */
export const PORTALS = portalSchema.options;

export const jobTypeSchema = z.enum(JOB_TYPES);
export const workModeSchema = z.enum(WORK_MODES);
export const applicationStatusSchema = z.enum(APPLICATION_STATUSES);

export type JobType = z.infer<typeof jobTypeSchema>;
export type WorkMode = z.infer<typeof workModeSchema>;
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;
