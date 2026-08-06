import type { Portal } from "./auth.js";

/**
 * The account status that crosses the wire.
 *
 * `suspended` never does in practice — a suspended session is refused at the
 * identity layer before any DTO is built — but the union matches the schema so
 * the client needs no impossible-case handling.
 */
export type AccountStatus = "pending" | "active" | "suspended";

/** The only account shape that ever crosses the wire. */
export interface SessionUser {
  id: string;
  portal: Portal;
  fullName: string;
  email: string;
  emailVerified: boolean;
  avatarUrl: string | null;
  status: AccountStatus;
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

export interface ProfileView {
  user: SessionUser;
  phone: string | null;
  seeker: {
    headline: string | null;
    bio: string | null;
    skills: string[];
    experienceYears: number | null;
    location: string | null;
    resumeUrl: string | null;
    resumeName: string | null;
  } | null;
  recruiter: { designation: string | null } | null;
}

export interface ProfileResponse {
  success: true;
  message?: string;
  profile: ProfileView;
}
