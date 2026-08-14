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

export const registerBodySchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  email: emailSchema,
  password: passwordSchema,
  phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, "must be E.164, e.g. +919876543210").optional(),
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
