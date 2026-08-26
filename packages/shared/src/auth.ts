import { z } from "zod";

export const portalSchema = z.enum(["seeker", "recruiter", "admin"]);
export type Portal = z.infer<typeof portalSchema>;

/**
 * Password policy: length over composition rules. NIST 800-63B advises against
 * mandatory character-class mixing — it pushes users toward "Password1!" and
 * measurably lowers entropy. 12 characters with no composition requirement is
 * stronger in practice.
 */
export const passwordSchema = z
  .string()
  .min(12, "must be at least 12 characters")
  .max(128, "must be at most 128 characters");

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

/**
 * One E.164 definition, now the only one: `profileUpdateBodySchema.phone` and
 * `completeProfileBodySchema.phone` both build on it.
 *
 * It used to be inline in `registerBodySchema` while
 * `profileUpdateBodySchema.phoneNumber` accepted any string up to 20 characters —
 * so the profile could store a number registration would reject, under a
 * different field name.
 */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, "must be E.164, e.g. +919876543210");

export const MIN_AGE_YEARS = 18;
export const MAX_AGE_YEARS = 100;

/**
 * Under-18 is a "not yet", not a refusal: guardian consent and internship-only
 * applications are their own project. Copy agreed with the user.
 */
export const UNDER_AGE_MESSAGE =
  "You need to be 18 or over to join Cairn. We're working on internships for younger candidates.";

/**
 * Whole years from `dob` to `on`, both read in UTC.
 *
 * UTC on both sides deliberately. A birth date is a calendar date, not an
 * instant; mixing a UTC-midnight dob with a local `now` shifts the answer by a
 * day for anyone west of Greenwich, which turns an 18th birthday into 17.
 */
export function ageInYears(dob: string, on: Date): number {
  const parts = dob.split("-").map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  let age = on.getUTCFullYear() - year;
  const monthDelta = on.getUTCMonth() + 1 - month;
  if (monthDelta < 0 || (monthDelta === 0 && on.getUTCDate() < day)) age -= 1;
  return age;
}

/**
 * Whether `v` names a real calendar day.
 *
 * A round-trip, not a NaN check. `Date` does NOT reject an out-of-range day in
 * an ISO string — `new Date("2000-02-31T00:00:00Z")` rolls forward to 2000-03-02
 * and parses perfectly happily — so `Number.isNaN(Date.parse(...))` accepts
 * every impossible date anyone can type. Comparing the parsed value back against
 * the input is the only check that catches February 31st.
 */
function isRealCalendarDate(v: string): boolean {
  const parsed = new Date(v + "T00:00:00Z");
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === v;
}

/**
 * A calendar date on the wire, a `Date` in the model.
 *
 * The future check is separate from the age check so a mistyped year reads
 * "must be a date in the past" rather than the internships message, which
 * would be baffling for someone who typed 2030.
 *
 * Concatenation rather than a template literal on purpose: the UTC suffix is
 * what stops a later reader turning this into a local-time parse.
 */
export const dobSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD")
  .refine(isRealCalendarDate, "must be a real date")
  .refine((v) => ageInYears(v, new Date()) >= 0, "must be a date in the past")
  .refine((v) => ageInYears(v, new Date()) >= MIN_AGE_YEARS, UNDER_AGE_MESSAGE)
  .refine((v) => ageInYears(v, new Date()) <= MAX_AGE_YEARS, "must be a plausible date of birth");

/**
 * Name, address, password.
 *
 * Phone moved to the completion step: a Google registration never reaches this
 * form, so collecting it here only ever covered half the users, and the two
 * paths had nowhere in common to ask. `.strict()` means a stale bundle still
 * posting `phone` gets a 400 — a deliberate one-deploy window, and the reason
 * the form drops the field in the same change.
 */
export const registerBodySchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  email: emailSchema,
  password: passwordSchema,
}).strict();

export const loginBodySchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
}).strict();

export const otpCodeSchema = z.string().trim().regex(/^\d{6}$/, "must be 6 digits");

/**
 * `email` IS present on the redemption bodies, and its role is strictly
 * limited. Because stored codes are hashed bound to a subject id (Task 3),
 * the server cannot even compute the digest to search for without first
 * resolving a candidate account — that is what `email` is for. It selects
 * WHICH HASH TO COMPUTE, never which account to mutate; the mutated account
 * always comes from the matched OTP row's `subjectId`. See the long note in
 * Task 3's otp.ts and the 2026-08-01 spec amendment, finding 1. (The spec
 * body's literal "no email field" wording predates the subject-bound hash;
 * the amendment's actual requirement — never resolve the mutated account
 * from the request body — holds.)
 */
export const verifyEmailBodySchema = z.object({
  email: emailSchema,
  code: otpCodeSchema,
}).strict();

export const resetPasswordBodySchema = z.object({
  email: emailSchema,
  code: otpCodeSchema,
  newPassword: passwordSchema,
}).strict();

export const forgotPasswordBodySchema = z.object({ email: emailSchema }).strict();
export const resendVerificationBodySchema = z.object({ email: emailSchema }).strict();

export const confirmGoogleLinkBodySchema = z.object({
  token: z.string().min(1).max(2048),
}).strict();

/** Google may add harmless fields; only these two security inputs are consumed. */
export const googleCallbackQuerySchema = z
  .object({
    code: z.string().min(1).max(4096).optional(),
    state: z.string().min(1).max(512).optional(),
  })
  .passthrough();

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type ConfirmGoogleLinkBody = z.infer<typeof confirmGoogleLinkBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type VerifyEmailBody = z.infer<typeof verifyEmailBodySchema>;
export type ResetPasswordBody = z.infer<typeof resetPasswordBodySchema>;
export type ForgotPasswordBody = z.infer<typeof forgotPasswordBodySchema>;
