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

/** Sent when the cumulative OTP failure budget trips, so a lockout is never silent. */
export function renderOtpBudgetEmail(hours: number): Rendered {
  return {
    subject: "Too many incorrect codes",
    html: WRAPPER(`<h1 style="font-size:1.25rem">Code entry paused</h1><p>There have been too many incorrect codes entered for this account, so entering codes is paused for ${hours} hours. Signing in with your password still works normally.</p>`),
    text: `Code entry paused for ${hours} hours after too many incorrect codes. Password sign-in is unaffected.`,
  };
}
