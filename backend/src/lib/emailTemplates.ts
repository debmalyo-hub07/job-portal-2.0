import type { OtpPurpose } from "../models/otpCode.model.js";

interface Rendered {
  subject: string;
  html: string;
  text: string;
}

const WRAPPER = (body: string): string =>
  `<div style="font-family:system-ui,sans-serif;max-width:32rem;margin:0 auto;padding:2rem;color:#1a1a1a">${body}<p style="margin-top:2rem;font-size:.75rem;color:#6b6b6b">If you did not request this, you can ignore this email. Nobody can access your account with this message alone.</p></div>`;

const CODE = (code: string): string =>
  `<p style="font-size:2rem;letter-spacing:.35em;font-weight:600;margin:1.5rem 0">${code}</p>`;

export function renderOtpEmail(code: string, purpose: OtpPurpose, minutes: number): Rendered {
  if (purpose === "verify_email") {
    return {
      subject: "Confirm your email address",
      html: WRAPPER(`<h1 style="font-size:1.25rem">Confirm your email</h1><p>Enter this code to finish setting up your account. It expires in ${minutes} minutes.</p>${CODE(code)}`),
      text: `Confirm your email\n\nCode: ${code}\nExpires in ${minutes} minutes.\n\nIf you did not request this, ignore this email.`,
    };
  }
  return {
    subject: "Reset your password",
    html: WRAPPER(`<h1 style="font-size:1.25rem">Reset your password</h1><p>Enter this code to choose a new password. It expires in ${minutes} minutes. Your current password stays active until you do.</p>${CODE(code)}`),
    text: `Reset your password\n\nCode: ${code}\nExpires in ${minutes} minutes.\n\nIf you did not request this, ignore this email — your password has not changed.`,
  };
}

/** Sent when a Google sign-in takes over an unverified account (Task 9, resolution branch 2c). */
export function renderAccountClaimedEmail(): Rendered {
  return {
    subject: "Your account is now linked to Google",
    html: WRAPPER(`<h1 style="font-size:1.25rem">Sign-in method changed</h1><p>Someone signed in to this account with Google. Because the email address had never been confirmed, the previous password was removed and all existing sessions were ended.</p><p>If this was you, nothing further is needed — sign in with Google from now on. If it was not, reset the password to take the account back.</p>`),
    text: `Sign-in method changed\n\nThis account was linked to Google, the previous password was removed, and all sessions were ended.\n\nIf this was not you, reset the password to take the account back.`,
  };
}

/** Step-up mail for linking Google to a VERIFIED password account (Task 9, branch 2b). */
export function renderGoogleLinkEmail(confirmUrl: string, hours: number): Rendered {
  return {
    subject: "Confirm linking Google sign-in",
    html: WRAPPER(
      `<h1 style="font-size:1.25rem">Link Google sign-in?</h1><p>Someone — hopefully you — asked to sign in to this account with Google. If that was you, confirm below within ${hours} hours. If it was not, do nothing: your password keeps working and nothing changes.</p><p style="margin:1.5rem 0"><a href="${confirmUrl}" style="display:inline-block;padding:.6rem 1.2rem;background:#1a1a1a;color:#ffffff;border-radius:.375rem;text-decoration:none">Link Google sign-in</a></p>`,
    ),
    text: `Link Google sign-in?\n\nConfirm within ${hours} hours:\n${confirmUrl}\n\nIf this wasn't you, do nothing — your password keeps working and nothing changes.`,
  };
}

/** Sent when the cumulative OTP failure budget trips, so a lockout is never silent. */
export function renderOtpBudgetEmail(hours: number): Rendered {
  return {
    subject: "Too many incorrect codes",
    html: WRAPPER(`<h1 style="font-size:1.25rem">Code entry paused</h1><p>There have been too many incorrect codes entered for this account, so entering codes is paused for ${hours} hours. Signing in with your password still works normally.</p>`),
    text: `Code entry paused for ${hours} hours after too many incorrect codes. Password sign-in is unaffected.`,
  };
}

/**
 * Escapes text destined for an HTML email body.
 *
 * Every other template in this file interpolates only values this codebase
 * generated (a 6-digit code, an hour count). The denial reason is the first
 * piece of free text a human types that lands in an email, so it is escaped at
 * the point of interpolation rather than trusted because "an admin wrote it".
 */
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Sent when an admin approves a pending recruiter (Phase 3A). */
export function renderRecruiterApprovedEmail(): Rendered {
  return {
    subject: "Your recruiter account is approved",
    html: WRAPPER(
      `<h1 style="font-size:1.25rem">You're approved</h1><p>An admin has approved your recruiter account. You can now create a company profile and post roles.</p>`,
    ),
    text: `You're approved\n\nAn admin has approved your recruiter account. You can now create a company profile and post roles.`,
  };
}

/**
 * Sent when an admin denies a pending recruiter (Phase 3B).
 *
 * The reason is included because a denial the recruiter cannot interpret is
 * indistinguishable from the queue being broken, and support then pays for it.
 */
export function renderRecruiterDeniedEmail(reason: string): Rendered {
  return {
    subject: "About your recruiter account",
    html: WRAPPER(
      `<h1 style="font-size:1.25rem">We could not approve your account</h1><p>An admin reviewed your recruiter account and could not approve it for now.</p><p style="padding:1rem;background:#f5f5f4;border-radius:.5rem"><strong>Reason:</strong> ${escapeHtml(reason)}</p><p>If you believe this is a mistake, reply to this email with more detail about your company.</p>`,
    ),
    text: `We could not approve your account\n\nAn admin reviewed your recruiter account and could not approve it for now.\n\nReason: ${reason}\n\nIf you believe this is a mistake, reply to this email with more detail about your company.`,
  };
}
