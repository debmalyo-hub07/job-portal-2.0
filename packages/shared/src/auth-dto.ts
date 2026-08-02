import type { Portal } from "./auth.js";

/** The only account shape that ever crosses the wire. */
export interface SessionUser {
  id: string;
  portal: Portal;
  fullName: string;
  email: string;
  emailVerified: boolean;
  avatarUrl: string | null;
}

export interface AuthResponse {
  success: true;
  user: SessionUser;
}

/**
 * Exactly the codes the API emits — nothing aspirational. A locked account
 * and an expired OTP deliberately do NOT get their own codes: the lock hides
 * behind INVALID_CREDENTIALS (a distinct code would be an existence-and-state
 * oracle) and an expired code is indistinguishable from a wrong one on
 * purpose. RATE_LIMITED and VALIDATION_ERROR also appear on these endpoints
 * but are platform-wide codes, not auth-specific ones.
 */
export const AUTH_ERROR_CODES = [
  "INVALID_CREDENTIALS",
  "EMAIL_NOT_VERIFIED",
  "EMAIL_TAKEN",
  "OTP_INVALID",
  "OTP_BUDGET_EXHAUSTED",
  "PASSWORD_REUSED",
  "SESSION_MISSING",
  "SESSION_INVALID",
  "CSRF_INVALID",
  "GOOGLE_AUTH_FAILED",
  "GOOGLE_LINK_INVALID",
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];
