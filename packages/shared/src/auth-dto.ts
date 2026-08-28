import type { Portal } from "./auth.js";
import type { Gender } from "./enums.js";

/**
 * The account status that crosses the wire.
 *
 * `suspended` never does in practice — a suspended session is refused at the
 * identity layer before any DTO is built — but the union matches the schema so
 * the client needs no impossible-case handling.
 */
export type AccountStatus = "pending" | "active" | "suspended";

/** An email change in progress, mirrored to its owner's session projection. */
export interface PendingEmailChange {
  newEmail: string;
  /** ISO instant. A pending older than 24 hours is dead and reads as none. */
  requestedAt: string;
  /**
   * Admin two-stage flow only: set once the code to the CURRENT address has
   * been redeemed, which is when the code to the NEW address is mailed. Always
   * null for seekers and recruiters, whose single code is the whole proof.
   */
  confirmedCurrentAt: string | null;
}

/** The only account shape that ever crosses the wire. */
export interface SessionUser {
  id: string;
  portal: Portal;
  fullName: string;
  email: string;
  emailVerified: boolean;
  avatarUrl: string | null;
  status: AccountStatus;
  /**
   * Whether the account has cleared the identity gate. Derived server-side from
   * `dob`; the client must not recompute it, or there are two sources of truth.
   */
  profileComplete: boolean;
  /**
   * Whether a password is set on the account. The email-change dialog needs it
   * to render the right shape: password accounts re-enter the password, and
   * Google-only accounts do not. A boolean projection — the hash itself never
   * crosses the wire.
   */
  hasPassword: boolean;
  /**
   * Whether the account is in the 16-17 band. Derived server-side from `dob`;
   * the client must not recompute age from the wire DOB, or there are two
   * sources of truth that disagree across timezones. The job detail page's
   * internship-only refusal reads this.
   */
  isMinor: boolean;
  /**
   * The email change awaiting a code, or null. Owner-visible by design: a
   * holder of the session can already see everything else here, and the
   * password step-up is what stops them *completing* a change.
   */
  pendingEmailChange: PendingEmailChange | null;
}

export interface AuthResponse {
  success: true;
  user: SessionUser;
  /**
   * The double-submit CSRF token, echoed by the client in `X-CSRF-Token`.
   *
   * In the body as well as the cookie because the cookie cannot be read back
   * cross-site: with the web app and the API on different registrable domains,
   * the browser stores and sends `__Host-jp_csrf` but withholds it from
   * `document.cookie`, non-httpOnly or not. The client holds this value in
   * memory instead — which no other origin can read at all.
   *
   * Optional so a client built against an older API still typechecks; the
   * cookie fallback covers same-origin development.
   */
  csrfToken?: string;
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
  "EMAIL_UNCHANGED",
  "OTP_INVALID",
  "OTP_BUDGET_EXHAUSTED",
  "PASSWORD_REUSED",
  "PASSWORD_INVALID",
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
  /**
   * `YYYY-MM-DD`, never a serialized instant. The model stores a `Date` at UTC
   * midnight; sending the instant would let a client in a negative-offset zone
   * render the day before.
   */
  dob: string | null;
  /** `null` means never asked; "prefer-not-to-say" means asked and declined. */
  gender: Gender | null;
  /**
   * Whether this account sits in the 16-17 band on the server's clock. Derived,
   * like `SessionUser.isMinor`. The completion step reads it to decide whether
   * the guardian stage renders after the identity block saves.
   */
  minor: boolean;
  /**
   * The guardian whose consent is on file, or null. Owner-visible: it is the
   * account's own record, and re-consent (a new guardian address) is the same
   * flow that set the first one.
   */
  guardianEmail: string | null;
  seeker: {
    headline: string | null;
    bio: string | null;
    skills: string[];
    experienceYears: number | null;
    location: string | null;
    /** 4A.3: self-reported salary band; feeds the fit pipeline's salary factor. */
    salaryMin: number | null;
    salaryMax: number | null;
    /** 4A.3: whether the seeker is open to remote; feeds the fit pipeline's remote factor. */
    openToRemote: boolean | null;
    resumeUrl: string | null;
    resumeName: string | null;
  } | null;
  recruiter: { designation: string | null } | null;
  /**
   * Empty by design. An admin carries no fields beyond the identity block, and a
   * present-but-empty object is what tells the client which page to render — the
   * same discriminator `seeker` and `recruiter` already are.
   */
  admin: Record<string, never> | null;
}

export interface ProfileResponse {
  success: true;
  message?: string;
  profile: ProfileView;
}

/**
 * Both email-change steps. `message` is the human sentence the client surfaces
 * — which code to enter next (admin stage 1) or that every session is dead and
 * the new address is the sign-in (final). The final response returns no
 * session: none survives the swap.
 */
export interface EmailChangeResponse {
  success: true;
  message: string;
}
