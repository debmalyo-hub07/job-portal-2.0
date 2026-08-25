import { z } from "zod";
import { jobDepartmentSchema, jobTypeSchema, type ApplicationStatus } from "./enums.js";
import { RECRUITER_SETTABLE } from "./applicationStatus.js";
import type { Portal } from "./auth.js";
import type { ScoreBreakdown } from "./matching/weights.js";
import { paginationQuerySchema } from "./pagination.js";

/** 24-hex Mongo ObjectId. Route params and body references both use this. */
export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Malformed id");

export const companyCreateBodySchema = z.object({
  name: z.string().trim().min(2).max(80),
}).strict();

const publicHttpUrlSchema = z
  .string()
  .trim()
  .url()
  .max(200)
  .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
    message: "must use http or https",
  });

export const companyUpdateBodySchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(2000).optional(),
  website: publicHttpUrlSchema.optional(),
  location: z.string().trim().max(120).optional(),
}).strict();

/**
 * `requirements` arrives as the legacy comma-string; normalized here so the
 * service never sees the raw shape. Numbers are coerced because the client
 * sends form strings.
 */
export const jobCreateBodySchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().min(2).max(5000),
  requirements: z
    .string()
    .max(2000)
    .transform((s) => s.split(",").map((t) => t.trim()).filter(Boolean)),
  salary: z.coerce.number().positive(),
  experience: z.coerce.number().int().min(0).max(50),
  location: z.string().trim().min(2).max(120),
  /**
   * An enum, not free text. `FilterCard` matches by exact equality, so an
   * unrecognised value is a row the board can never surface — accepted, stored,
   * displayed on the card, and unfilterable.
   */
  jobType: jobTypeSchema,
  department: jobDepartmentSchema.default("Other"),
  position: z.string().trim().min(1).max(120),
  /** Flat remote flag (4A.3). A `true`-ish form string coerces to true; absent → false. */
  remote: z
    .enum(["true", "false", "1", "0", "on"])
    .transform((v) => v === "true" || v === "1" || v === "on")
    .optional(),
  companyId: objectIdSchema,
}).strict();

export const jobListQuerySchema = paginationQuerySchema.extend({
  keyword: z.string().trim().max(100).default(""),
  /** 4B: OR-within-facet, AND-across-facets. Comma-joined values; empty → no filter. */
  location: z.string().trim().max(200).default(""),
  jobType: z.string().trim().max(200).default(""),
  department: z.string().trim().max(300).default(""),
  /** Company names are comma-joined so the board can select several employers. */
  company: z.string().trim().max(500).default(""),
  salaryMax: z.coerce.number().int().min(0).optional(),
  experienceMax: z.coerce.number().int().min(0).max(50).optional(),
  /** "?remote=true" → only remotely-flagged jobs. Absent → no constraint. */
  remote: z
    .enum(["true", "false", "1", "0"])
    .transform((v) => v === "true" || v === "1")
    .optional(),
});

/**
 * The recruiter workspace's own job list.
 *
 * Keyword only — no facets. The workspace is "find the role I posted", not a
 * search surface. It exists at all because a client-side filter over a
 * server-paginated list searches only the rows currently on screen while
 * presenting itself as searching everything.
 */
export const ownedJobsQuerySchema = paginationQuerySchema.extend({
  keyword: z.string().trim().max(100).default(""),
});

/**
 * What a recruiter may set on an application.
 *
 * Derived from `RECRUITER_SETTABLE`, so the schema cannot drift from the state
 * machine that enforces the rest of the rules. `applied` is the creation default
 * and `withdrawn` belongs to the candidate, so neither is accepted here — and a
 * request naming one fails validation rather than reaching the service.
 */
export const applicationStatusBodySchema = z.object({
  status: z.enum(RECRUITER_SETTABLE),
}).strict();

export type CompanyCreateBody = z.infer<typeof companyCreateBodySchema>;
export type CompanyUpdateBody = z.infer<typeof companyUpdateBodySchema>;
export type JobCreateBody = z.infer<typeof jobCreateBodySchema>;
export type JobListQuery = z.infer<typeof jobListQuerySchema>;
export type OwnedJobsQuery = z.infer<typeof ownedJobsQuerySchema>;
export type ApplicationStatusBody = z.infer<typeof applicationStatusBodySchema>;

export type CompanyDto = {
  id: string;
  name: string;
  description: string | null;
  website: string | null;
  location: string | null;
  logoUrl: string | null;
  createdAt: string;
};

/**
 * The recruiter who posted a job.
 *
 * Populated from `created_by`, never denormalised onto the job at creation: a
 * recruiter who corrects their phone number must not leave every listing they
 * ever posted carrying the old one.
 */
export type JobPosterDto = {
  fullName: string;
  designation: string | null;
  /**
   * Contact details, for an authenticated seeker only.
   *
   * The job routes are `optionalAuthenticate`, so anything unconditional here is
   * published to every crawler that reaches the board — and a recruiter's
   * address and number are the harvesting target job boards gate behind a
   * session. Absent rather than null for a caller not entitled to them, the
   * same distinction `fit` draws.
   */
  email?: string;
  phone?: string | null;
};

export type JobDto = {
  id: string;
  title: string;
  description: string;
  requirements: string[];
  salary: number;
  experienceLevel: number;
  location: string;
  jobType: string;
  department: string;
  position: string;
  /** 4A.3: whether the role is remote. Drives the fit pipeline's remote factor. */
  remote: boolean;
  company: CompanyDto | null;
  createdAt: string;
  /**
   * Phase 5: how this job scores against the *viewing seeker's* profile.
   *
   * Optional because the field is only meaningful for one kind of caller. The
   * public routes are `optionalAuthenticate`, so a job list is served to
   * anonymous visitors and to recruiters as well, and neither is the subject of
   * a seeker fit — absent is the honest answer, where a `0` would render as
   * "0% fit", a claim about somebody nobody made.
   *
   * It explains an order; it does not set one. `paginate` sorts and pages in
   * Mongo, so a score computed after the query could only rank the rows already
   * on the page while presenting itself as ranking the whole board — the defect
   * already documented for `WorkspaceCompanies`. Fit-ranked ordering needs an
   * aggregation, and is a separate change.
   */
  fit?: ScoreBreakdown;
  /**
   * The posting recruiter, or `null` when that account no longer exists.
   *
   * NOT optional: every path that builds a `JobDto` must populate `created_by`,
   * because an unpopulated reference is indistinguishable from a deleted owner
   * and would silently drop the poster from a job that has one. `toJobDto`
   * checks the populated shape rather than truthiness for that reason.
   */
  postedBy: JobPosterDto | null;
};

/**
 * One transition in an application's life.
 *
 * `byPortal` reuses `Portal` rather than a fresh enum: a status only ever changes
 * because a recruiter decided or a candidate withdrew.
 */
export type ApplicationEventDto = {
  status: ApplicationStatus;
  at: string;
  byPortal: Portal;
};

export type AppliedJobDto = {
  id: string; // application id
  status: ApplicationStatus;
  appliedAt: string;
  job: JobDto | null;
  /** Oldest first, so the client renders a timeline without re-sorting. */
  history: ApplicationEventDto[];
};

/** Everything a recruiter may see about an applicant. Nothing else leaves. */
export type ApplicantDto = {
  applicationId: string;
  status: ApplicationStatus;
  appliedAt: string;
  fullName: string;
  email: string;
  phone: string | null;
  headline: string | null;
  skills: string[];
  resumeUrl: string | null;
  resumeName: string | null;
  /**
   * How this seeker scores against the job whose applicant list is open.
   *
   * `null` is reserved for an orphaned application whose seeker row no longer
   * exists. Inventing an empty profile there would still produce a numeric
   * score because unknown optional factors are deliberately no-penalty.
   */
  fit: ScoreBreakdown | null;
};

/**
 * A numeric profile field a blank form value *clears*.
 *
 * `z.coerce.number()` on its own turns `""` into `0`, because `Number("")` is
 * `0` — so a seeker who emptied the box would store a real zero. That is not a
 * harmless default: `salaryMin: 0` with `salaryMax: 0` puts every real salary
 * outside the band and `salaryFit` scores the factor at 0 for the whole board
 * (25 of 100 points in the `job` direction), and `experienceYears: 0` costs 25%
 * per year a job asks for. `null` is what the pipeline reads as "no constraint".
 *
 * Absent and blank stay distinguishable: absent means "leave it alone" (the form
 * posts only what it renders), blank means "clear it". Whitespace is trimmed
 * first, matching `location` below — without that, a stray space is a zero.
 */
const clearableInt = (max: number) =>
  z
    .preprocess(
      // `.optional()` short-circuits `undefined` before this runs, so the only
      // nullish value reaching here is an explicit JSON `null` — which means
      // "clear it", exactly as a blank form field does. Without this, a body of
      // `{"salaryMin": null}` coerces to `0`.
      (v) => (typeof v === "string" ? v.trim() : (v ?? "")),
      z.union([z.literal(""), z.coerce.number().int().min(0).max(max)]),
    )
    .transform((v) => (v === "" ? null : v))
    .optional();

/**
 * Profile edits arrive as multipart form fields, so every value is a string and
 * every field is optional — the form posts only what changed. `skills` keeps the
 * legacy comma-string shape and is normalized here.
 */
export const profileUpdateBodySchema = z.object({
  fullname: z.string().trim().min(2).max(80).optional(),
  phoneNumber: z.string().trim().max(20).optional(),
  bio: z.string().trim().max(1000).optional(),
  skills: z
    .string()
    .max(500)
    .transform((s) => s.split(",").map((t) => t.trim()).filter(Boolean))
    .optional(),
  /**
   * Phase 5: the two fields the matching pipeline read but nothing could write.
   *
   * Both were added to the model, the profile DTO and `toFitSeekerInput` in
   * 4A.3, and both were absent from this schema — so `updateProfile` had no
   * writer for either, they stayed `null` for every seeker, and the experience
   * and location factors scored as no-penalty unknowns for the whole user base.
   * The factors ran; they just could not discriminate. Surfacing a fit badge
   * without these is a number that is quietly wrong for two of its five inputs.
   *
   * The bounds mirror `seeker.model.ts` (`min: 0, max: 60`), so an out-of-range
   * value is a 400 from validation rather than a 500 from Mongoose.
   */
  experienceYears: clearableInt(60),
  location: z.string().trim().max(120).optional(),
  /**
   * 4A.3: self-reported salary band in `job.salary`'s unit.
   *
   * The bound is deliberately loose. `job.salary` is rendered as "LPA" on the
   * card while `jobCreateBodySchema` accepts any positive number, so rows exist
   * in both readings — a cap tight enough for lakhs would make a rupee-denominated
   * job unreachable by any band a seeker could express, and `salaryFit` would
   * score it 0 rather than "no constraint". This stops garbage, not ambiguity;
   * the unit itself is a known gap.
   */
  salaryMin: clearableInt(100_000_000),
  salaryMax: clearableInt(100_000_000),
  /**
   * 4A.3: drives the pipeline's remote factor — and it is three-valued.
   *
   * `remoteFit` returns 1 for an unknown ("the seeker never said, don't fault
   * the job") and 0 for an explicit `false` against a remote role, so the two
   * are not interchangeable. A plain checkbox posts `false` when untouched,
   * which would turn every saved profile into an active objection to remote work
   * and cost remote listings the factor's full 12 points. `""` is how the form
   * says "no preference", and it has to survive as `null`.
   */
  openToRemote: z
    .enum(["true", "false", "1", "0", "on", ""])
    .transform((v) => (v === "" ? null : v === "true" || v === "1" || v === "on"))
    .optional(),
}).strict();

export type ProfileUpdateBody = z.infer<typeof profileUpdateBodySchema>;
