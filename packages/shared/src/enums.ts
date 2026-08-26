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
/**
 * Lowercase slugs, not the title-case JOB_TYPES uses.
 *
 * The note above already calls slugs "the better data shape" and says title-case
 * survived only because existing rows agreed on it. Gender has no existing rows,
 * so there is nothing to migrate around, and WORK_MODES is already slugs.
 *
 * "prefer-not-to-say" is a STORED value distinct from null: null means never
 * asked (a legacy row, or an admin who has not filled the form), the slug means
 * asked and declined. Neither field is clearable, so null stays stable.
 */
export const GENDERS = ["female", "male", "non-binary", "prefer-not-to-say"] as const;
export const JOB_DEPARTMENTS = [
  "Engineering",
  "Data & AI",
  "Product Management",
  "Design & Research",
  "Consulting & Strategy",
  "Sales & Business Development",
  "Marketing & Communications",
  "Finance & Accounting",
  "Human Resources",
  "Operations & Supply Chain",
  "Customer Service",
  "Legal & Compliance",
  "Other",
] as const;
/**
 * A posting is open, or the role is filled and it has left the board.
 *
 * Two values, deliberately: "draft" would be a third state nothing can reach,
 * since a job is public the moment it is posted, and inventing it would put an
 * unreachable branch in every filter that reads this field.
 *
 * The absence of this field is not a third state either — it means "written
 * before the field existed", and the board reads it as open. Anything that
 * filters on it must therefore exclude `closed` rather than select `open`:
 * Mongo does not match a missing field against an equality, so
 * `{ status: "open" }` would hide every row posted before this shipped. The
 * board filter in `job.service.ts` is `$ne` for exactly that reason.
 */
export const JOB_STATUSES = ["open", "closed"] as const;
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
export const jobDepartmentSchema = z.enum(JOB_DEPARTMENTS);
export const jobStatusSchema = z.enum(JOB_STATUSES);
export const applicationStatusSchema = z.enum(APPLICATION_STATUSES);
export const genderSchema = z.enum(GENDERS);

export type JobType = z.infer<typeof jobTypeSchema>;
export type WorkMode = z.infer<typeof workModeSchema>;
export type JobDepartment = z.infer<typeof jobDepartmentSchema>;
export type JobStatus = z.infer<typeof jobStatusSchema>;
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;
export type Gender = z.infer<typeof genderSchema>;

/**
 * Display strings, kept beside the enum so a new slug with no label fails a test
 * rather than rendering blank.
 */
export const GENDER_LABELS: Record<Gender, string> = {
  female: "Female",
  male: "Male",
  "non-binary": "Non-binary",
  "prefer-not-to-say": "Prefer not to say",
};
