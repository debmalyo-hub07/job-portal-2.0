import { z } from "zod";
import { genderSchema, jobDepartmentSchema, jobTypeSchema, type ApplicationStatus, type JobStatus, JOB_STATUSES } from "./enums.js";
import { RECRUITER_SETTABLE } from "./applicationStatus.js";
import { dobSchema, phoneSchema, type Portal } from "./auth.js";
import { seekerLocationSchema, type DistanceBand } from "./location.js";
import type { ScoreBreakdown } from "./matching/weights.js";
import { paginationQuerySchema, type PaginatedResponse } from "./pagination.js";

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
 * What a recruiter may update on a posted job.
 *
 * Every field is optional — the endpoint is PATCH-style, and a caller sends
 * only the changed fields. `companyId` is intentionally absent: changing the
 * company rewrites who each existing applicant applied to and swaps the logo
 * on their record. Sending it is a 400 from `.strict()`, not a silent no-op.
 */
export const jobUpdateBodySchema = z
  .object({
    title: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().min(2).max(5000).optional(),
    requirements: z
      .string()
      .max(2000)
      .transform((s) => s.split(",").map((t) => t.trim()).filter(Boolean))
      .optional(),
    salary: z.coerce.number().positive().optional(),
    experience: z.coerce.number().int().min(0).max(50).optional(),
    location: z.string().trim().min(2).max(120).optional(),
    jobType: jobTypeSchema.optional(),
    department: jobDepartmentSchema.optional(),
    position: z.string().trim().min(1).max(120).optional(),
    remote: z
      .enum(["true", "false", "1", "0", "on"])
      .transform((v) => v === "true" || v === "1" || v === "on")
      .optional(),
  })
  .strict();

/**
 * What a recruiter may set as a job lifecycle status.
 *
 * Mirroring `applicationStatusBodySchema`: derived from the shared enum, so the
 * schema cannot drift from the list of values the model accepts.
 */
export const jobStatusBodySchema = z.object({
  status: z.enum(JOB_STATUSES),
}).strict();

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

/**
 * A bulk status move: one stage, many of one job's applications.
 *
 * The ids are capped at 100 — larger than any page the applicants screen
 * holds, small enough to bound one request's work. Each id is an ObjectId
 * string, so a malformed one fails validation here rather than reaching the
 * service, and the stage rides the same RECRUITER_SETTABLE derivation the
 * single move's schema uses.
 */
export const BULK_STATUS_CAP = 100;

export const bulkStatusBodySchema = z
  .object({
    applicationIds: z.array(objectIdSchema).min(1).max(BULK_STATUS_CAP),
    status: z.enum(RECRUITER_SETTABLE),
  })
  .strict();

export type BulkStatusBody = z.infer<typeof bulkStatusBodySchema>;

/** Why one row of a bulk move did not move. */
export type BulkSkipReason = "TERMINAL" | "SAME_STATUS" | "NOT_FOUND";

/**
 * The bulk move's honest result: how many rows moved, and every row that
 * refused with its reason. Skipped rows are reported, never a veto.
 */
export type BulkStatusResult = {
  moved: number;
  skipped: { id: string; reason: BulkSkipReason }[];
};

export type CompanyCreateBody = z.infer<typeof companyCreateBodySchema>;
export type CompanyUpdateBody = z.infer<typeof companyUpdateBodySchema>;
export type JobCreateBody = z.infer<typeof jobCreateBodySchema>;
export type JobListQuery = z.infer<typeof jobListQuerySchema>;
export type OwnedJobsQuery = z.infer<typeof ownedJobsQuerySchema>;
export type ApplicationStatusBody = z.infer<typeof applicationStatusBodySchema>;
export type JobUpdateBody = z.infer<typeof jobUpdateBodySchema>;
export type JobStatusBody = z.infer<typeof jobStatusBodySchema>;

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
  position: string;  /** 4A.3: whether the role is remote. Drives the fit pipeline's remote factor. */
  remote: boolean;
  company: CompanyDto | null;
  createdAt: string;
  /**
   * Whether the role is still accepting applications.
   *
   * NOT optional: every path that builds a JobDto must set this field, for the
   * same reason `postedBy` is not optional. A missing field is
   * indistinguishable from a legacy row. The board filter is `$ne "closed"`
   * rather than equality on "open", so a row written before this field existed
   * still appears — and this field is what lets the seeker know whether to
   * show the Apply control at all.
   *
   * Legacy rows have no stored status; they read as "open" at `toJobDto` via
   * `doc.status ?? "open"`, matching the board's filter behaviour.
   */
  status: JobStatus;
  /**
   * How many candidates have applied and how many are still mid-pipeline.
   *
   * Optional: set only on the recruiter's own list, exactly as `fit` is set
   * only for a seeker. An applicant count on a public job is competitive
   * information — one of the things `publicJobs.test.ts` guards against.
   *
   * Two numbers, not one, because `total > 0` gates the Delete action while
   * `active` (the non-terminal count) is the limbo figure the workspace shows
   * on a closed role. A job with five rejected applicants has zero active and
   * still must not be deleted.
   */
  applications?: { total: number; active: number };

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
 * P4 of the location-aware phase: a board row as the "near you" rail receives
 * it — the job plus the distance band it was ranked under, so the UI can label
 * honestly ("In Bengaluru", "Remote") rather than imply a measured distance.
 */
export type NearMeJobDto = JobDto & { band: DistanceBand };

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
 * One row of the recruiter's cross-job queue (Project D): the per-job
 * `ApplicantDto` fields plus the posting the application belongs to, because
 * the queue's whole point is that the rows no longer share one. `jobId` is
 * `""` rather than null when the job was deleted after the application was
 * filed — the row stays in the queue (it is the recruiter's record), with no
 * link to follow.
 */
export type QueuedApplicantDto = ApplicantDto & {
  jobId: string;
  jobTitle: string;
  companyName: string | null;
};

/**
 * The per-job applicants page (P5): the ranked, paginated list plus the
 * pipeline funnel — a zero-filled count per status across ALL of the job's
 * applications, computed server-side, so the strip a recruiter reads is the
 * whole picture rather than whatever slice the current page happens to hold.
 */
export type ApplicantsPageDto = PaginatedResponse<ApplicantDto> & {
  funnel: Record<ApplicationStatus, number>;
  health: PostingHealthDto;
};

/** One day of a dense daily series. `date` is a UTC `YYYY-MM-DD`. */
export type DailySeriesPoint = { date: string; count: number };

/**
 * Posting health: how a role is doing at attracting applicants, derived from
 * the application records the platform already keeps — nothing is tracked,
 * nothing is stored, nothing new reaches the privacy page.
 * `firstApplicationAt` is the raw fact (null when nobody has applied);
 * time-to-first is the client's subtraction of the job's `createdAt`, not a
 * server opinion.
 */
export type PostingHealthDto = {
  /**
   * Dense and ascending, the console's jobsPostedSeries shape: every day of
   * the window present, zero-filled, so the client never infers a gap.
   */
  series: DailySeriesPoint[];
  firstApplicationAt: string | null;
  total: number;
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
  /**
   * Renamed from `phoneNumber` and now validated exactly as registration does —
   * the old `max(20)` meant the profile could store a number registration would
   * have refused, under a different field name.
   *
   * Clearable, unlike `dob` and `gender` below. The model's `phone` is nullable,
   * and the edit dialog posts the box whether or not it holds anything, so a
   * blank has to mean "clear it" rather than 400 an unrelated bio edit. Same
   * shape as `clearableInt` above.
   */
  phone: z
    .preprocess(
      (v) => (typeof v === "string" ? v.trim() : (v ?? "")),
      z.union([z.literal(""), phoneSchema]),
    )
    .transform((v) => (v === "" ? null : v))
    .optional(),
  /**
   * Correctable, never clearable. Absent means "leave alone"; there is
   * deliberately no `""`-clears branch, because blanking a `dob` would re-gate
   * the account and blanking a `gender` would erase the difference between
   * "declined to say" and "never asked".
   *
   * `dobSchema` carries the age floor, so the correction path cannot walk an
   * under-age date past the gate that reads this field.
   */
  dob: dobSchema.optional(),
  gender: genderSchema.optional(),
  /**
   * The field rendered publicly as the job poster's byline that no schema in
   * this repository could write. Applied only on the recruiter branch of
   * `updateProfile`, the same way the seeker fields are.
   */
  designation: z.string().trim().max(80).optional(),
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
   * P2 of the location-aware phase: the CONSENTED device location, from the
   * reverse-geocode flow — city-level only, never coordinates.
   *
   * Distinct from the self-reported free-text `location` above, which 4A.3
   * added for the matching pipeline: that one is what the seeker typed, this
   * one is where their browser said they are. Absent means "leave alone" —
   * there is deliberately no clearable form, because P2 has no surface that
   * needs to withdraw a consented city yet.
   *
   * The edit path is multipart, so this arrives as a JSON string; the
   * preprocess turns it back into the object before validation. Anything that
   * is neither valid JSON nor a valid location fails with the schema's own
   * message rather than a parse crash.
   */
  geoLocation: z
    .preprocess(
      (v) => {
        if (typeof v !== "string") return v;
        try {
          return JSON.parse(v);
        } catch {
          return v;
        }
      },
      seekerLocationSchema,
    )
    .optional(),
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

/**
 * The first-run identity step. `dob` is REQUIRED here, which is the whole reason
 * this is not `profileUpdateBodySchema`: every field there is optional, so an
 * empty body would succeed and return the user to the gate with nothing to show
 * them.
 *
 * JSON, not multipart — there is no file on this path, so the values arrive with
 * their real types rather than as strings.
 */
export const completeProfileBodySchema = z
  .object({
    dob: dobSchema,
    phone: phoneSchema.optional(),
    gender: genderSchema.optional(),
  })
  .strict();

export type CompleteProfileBody = z.infer<typeof completeProfileBodySchema>;
