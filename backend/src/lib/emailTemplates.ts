import type { OtpPurpose, OtpStage } from "../models/otpCode.model.js";

interface Rendered {
  subject: string;
  html: string;
  text: string;
}

const WRAPPER = (body: string): string =>
  `<div style="font-family:system-ui,sans-serif;max-width:32rem;margin:0 auto;padding:2rem;color:#1a1a1a">${body}<p style="margin-top:2rem;font-size:.75rem;color:#6b6b6b">If you did not request this, you can ignore this email. Nobody can access your account with this message alone.</p></div>`;

const CODE = (code: string): string =>
  `<p style="font-size:2rem;letter-spacing:.35em;font-weight:600;margin:1.5rem 0">${code}</p>`;

/**
 * `stage` is meaningful only for `change_email`: it distinguishes the admin
 * stage-1 code (prove the CURRENT mailbox) from the code every portal's final
 * step uses (prove the NEW one). Every other purpose renders identically
 * whatever is passed.
 */
export function renderOtpEmail(
  code: string,
  purpose: OtpPurpose,
  minutes: number,
  stage: OtpStage | null = null,
): Rendered {
  if (purpose === "verify_email") {
    return {
      subject: "Confirm your email address",
      html: WRAPPER(`<h1 style="font-size:1.25rem">Confirm your email</h1><p>Enter this code to finish setting up your account. It expires in ${minutes} minutes.</p>${CODE(code)}`),
      text: `Confirm your email\n\nCode: ${code}\nExpires in ${minutes} minutes.\n\nIf you did not request this, ignore this email.`,
    };
  }
  if (purpose === "change_email") {
    if (stage === "confirm-current") {
      return {
        subject: "Confirm the change to your admin account's email",
        html: WRAPPER(`<h1 style="font-size:1.25rem">A new email address was requested</h1><p>Someone — hopefully you — asked to change this admin account's email address. Enter this code to allow the change to continue. It expires in ${minutes} minutes.</p>${CODE(code)}<p style="font-size:.8125rem;color:#6b6b6b">If this was not you, your admin session may be compromised — change your password.</p>`),
        text: `A new email address was requested\n\nEnter this code to allow the change to continue. It expires in ${minutes} minutes.\n\nCode: ${code}\n\nIf this was not you, your admin session may be compromised — change your password.`,
      };
    }
    return {
      subject: "Confirm your new email address",
      html: WRAPPER(`<h1 style="font-size:1.25rem">Confirm your new email</h1><p>Enter this code to finish changing your account's email address. After it is confirmed, the new address is the one you sign in with. It expires in ${minutes} minutes.</p>${CODE(code)}`),
      text: `Confirm your new email\n\nCode: ${code}\nExpires in ${minutes} minutes.\n\nAfter it is confirmed, the new address is the one you sign in with.`,
    };
  }
  if (purpose === "guardian_consent") {
    return {
      subject: "Confirm guardian consent",
      html: WRAPPER(`<h1 style="font-size:1.25rem">Confirm guardian consent</h1><p>A 16- or 17-year-old candidate named you as their guardian to join Cairn. Enter this code on their screen to allow the account. It expires in ${minutes} minutes.</p>${CODE(code)}<p style="font-size:.8125rem;color:#6b6b6b">Until the account turns 18, it can apply to internship roles only.</p>`),
      text: `Confirm guardian consent\n\nA 16- or 17-year-old candidate named you as their guardian to join Cairn. Enter this code on their screen to allow the account. It expires in ${minutes} minutes.\n\nCode: ${code}\n\nUntil the account turns 18, it can apply to internship roles only.`,
    };
  }
  return {
    subject: "Reset your password",
    html: WRAPPER(`<h1 style="font-size:1.25rem">Reset your password</h1><p>Enter this code to choose a new password. It expires in ${minutes} minutes. Your current password stays active until you do.</p>${CODE(code)}`),
    text: `Reset your password\n\nCode: ${code}\nExpires in ${minutes} minutes.\n\nIf you did not request this, ignore this email — your password has not changed.`,
  };
}

/**
 * The warning a seeker/recruiter email-change START sends to the address being
 * left. The code goes to the NEW address; the OLD one hears that a change was
 * requested and what to do if it was not the owner asking — a stolen session
 * must not silently redirect recovery mail to an attacker's mailbox.
 *
 * Admins need no separate warning: their stage-1 code IS mailed to the current
 * address, so the mail that carries the code is the warning.
 */
export function renderEmailChangeWarningEmail(newEmail: string): Rendered {
  return {
    subject: "An email change was requested on your account",
    html: WRAPPER(
      `<h1 style="font-size:1.25rem">Email change requested</h1><p>Someone — hopefully you — asked to change this account's email address to <strong>${escapeHtml(newEmail)}</strong>. A confirmation code was sent to that address; nothing changes until it is entered.</p><p>If this was not you, your session may be compromised — change your password.</p>`,
    ),
    text: `Email change requested\n\nSomeone asked to change this account's email address to ${newEmail}. A confirmation code was sent to that address; nothing changes until it is entered.\n\nIf this was not you, your session may be compromised — change your password.`,
  };
}

/**
 * The invite email. `setupUrl` is built by the caller from `WEB_BASE_URL` so
 * this module stays free of `env()` — a module-scope config read here would run
 * at import time, before the test setup has an environment to read.
 *
 * The URL is navigation, never authentication: it carries the address so the
 * form can prefill it, and never the code. A link that authenticated on click
 * would be a magic link into the highest-privilege portal, and links leak
 * through mail scanners, referrer headers and browser history in a way a typed
 * code does not.
 */
export function renderPasswordSetupEmail(
  code: string,
  minutes: number,
  setupUrl: string,
): Rendered {
  return {
    subject: "Set up your Cairn admin password",
    html: WRAPPER(`<h1 style="font-size:1.25rem">Your admin account is ready</h1><p>Open the setup screen and enter this code to choose your password. It expires in ${minutes} minutes.</p>${CODE(code)}<p><a href="${setupUrl}" style="color:#1a1a1a;font-weight:600">Set your password</a></p><p style="font-size:.8125rem;color:#6b6b6b">Or paste this address into your browser:<br>${setupUrl}</p>`),
    text: `Your admin account is ready

Code: ${code}
Expires in ${minutes} minutes.

Open ${setupUrl} and enter the code to choose your password.`,
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

/**
 * P1 of the console automation program: the work notification sent to every
 * active admin when a pending recruiter verifies their email.
 *
 * Owns a wrapper rather than sharing WRAPPER, because that one closes with
 * "if you did not request this, you can ignore this email" — the footer of a
 * security transaction. This is the opposite kind of mail: a notification to
 * the platform's operator that work is waiting. A footer telling the admin
 * to ignore the email is the one sentence guaranteed to be read.
 *
 * `consoleUrl` is built by the caller from `WEB_BASE_URL` so this module
 * stays free of `env()` — a module-scope config read would run at import
 * time, before the test setup has an environment to read (the same reason
 * as `renderPasswordSetupEmail`).
 */
export function renderAdminPendingEmail(
  fullName: string,
  email: string,
  pendingCount: number,
  consoleUrl: string,
): Rendered {
  const waiting = pendingCount === 1 ? "is 1 recruiter" : `are ${pendingCount} recruiters`;
  return {
    subject: "New recruiter waiting for review",
    html: NOTICE_WRAPPER(
      `<h1 style="font-size:1.25rem">New recruiter waiting for review</h1><p><strong>${escapeHtml(fullName)}</strong> (${escapeHtml(email)}) just verified their email and is waiting for approval.</p><p>There ${waiting} in the queue.</p><p><a href="${consoleUrl}" style="color:#1a1a1a;font-weight:600">Review the queue</a></p><p style="font-size:.8125rem;color:#6b6b6b">Or paste this address into your browser:<br>${consoleUrl}</p>`,
    ),
    text: `New recruiter waiting for review\n\n${fullName} (${email}) just verified their email and is waiting for approval.\n\nThere ${waiting} in the queue.\n\nReview the queue: ${consoleUrl}\n`,
  };
}

const NOTICE_WRAPPER = (body: string): string =>
  `<div style="font-family:system-ui,sans-serif;max-width:32rem;margin:0 auto;padding:2rem;color:#1a1a1a">${body}</div>`;

/**
 * P5 of the console automation program: the work notification sent to a job's
 * owner the moment someone applies.
 *
 * Shares the notice wrapper (no "ignore this email" footer) with the admin
 * alert for the same reason — this is a notification about work, not a
 * security transaction. `applicantsUrl` is built by the caller from
 * `WEB_BASE_URL`, keeping this module free of `env()` like every other
 * template.
 */
export function renderApplicantAlertEmail(
  applicantName: string,
  jobTitle: string,
  applicantsUrl: string,
): Rendered {
  return {
    subject: `New applicant for ${jobTitle}`,
    html: NOTICE_WRAPPER(
      `<h1 style="font-size:1.25rem">New applicant for ${escapeHtml(jobTitle)}</h1><p><strong>${escapeHtml(applicantName)}</strong> just applied for this role.</p><p><a href="${applicantsUrl}" style="color:#1a1a1a;font-weight:600">Review the applicant</a></p><p style="font-size:.8125rem;color:#6b6b6b">Or paste this address into your browser:<br>${applicantsUrl}</p>`,
    ),
    text: `New applicant for ${jobTitle}\n\n${applicantName} just applied for this role.\n\nReview the applicant: ${applicantsUrl}\n`,
  };
}

/**
 * Project D: sent when an admin suspends an account (seeker or recruiter).
 *
 * The reason rides in the mail AND in the login refusal — the owner cannot
 * sign in, so the mail is the channel that reaches them without a password,
 * and the login answer is the one they see first if they try.
 */
export function renderAccountSuspendedEmail(reason: string): Rendered {
  return {
    subject: "Your Cairn account has been suspended",
    html: WRAPPER(
      `<h1 style="font-size:1.25rem">Your account has been suspended</h1><p>An admin has suspended your account, which means you cannot sign in for now.</p><p style="padding:1rem;background:#f5f5f4;border-radius:.5rem"><strong>Reason:</strong> ${escapeHtml(reason)}</p><p>If you believe this is a mistake, reply to this email.</p>`,
    ),
    text: `Your account has been suspended\n\nAn admin has suspended your account, which means you cannot sign in for now.\n\nReason: ${reason}\n\nIf you believe this is a mistake, reply to this email.`,
  };
}

/** Project D: sent when an admin reinstates a suspended account. */
export function renderAccountReinstatedEmail(): Rendered {
  return {
    subject: "Your Cairn account is active again",
    html: WRAPPER(
      `<h1 style="font-size:1.25rem">Your account is active again</h1><p>An admin has reinstated your account. You can sign in with your usual email and password.</p>`,
    ),
    text: `Your account is active again\n\nAn admin has reinstated your account. You can sign in with your usual email and password.`,
  };
}

/**
 * Sent to a candidate when their application reaches a stage worth hearing about.
 *
 * The stage is spelled out in plain language rather than echoing the enum: a
 * candidate reading "interview" as a bare word cannot tell whether one is being
 * offered or has already happened. `notifiesSeeker` decides *whether* this goes
 * out; this only decides how it reads.
 */
const STATUS_COPY: Record<
  "shortlisted" | "interview" | "offered" | "rejected",
  { subject: (role: string) => string; heading: string; body: string }
> = {
  shortlisted: {
    subject: (role) => `You have been shortlisted for ${role}`,
    heading: "You have been shortlisted",
    body: "The hiring team has shortlisted your application and is reviewing it in more detail. No action is needed from you right now.",
  },
  interview: {
    subject: (role) => `Interview stage for ${role}`,
    heading: "Your application has moved to interview",
    body: "The hiring team wants to interview you. They will be in touch with times and details directly.",
  },
  offered: {
    subject: (role) => `An offer for ${role}`,
    heading: "You have an offer",
    body: "The hiring team has made you an offer for this role. They will follow up with the details.",
  },
  rejected: {
    subject: (role) => `Update on your application for ${role}`,
    heading: "This application will not move forward",
    body: "The hiring team has decided not to move forward with your application for this role. This decision applies to this role only — you are welcome to apply for others.",
  },
};

export function renderApplicationStatusEmail(
  status: "shortlisted" | "interview" | "offered" | "rejected",
  role: string,
  company: string | null,
): Rendered {
  const copy = STATUS_COPY[status];
  const at = company ? `${role} at ${company}` : role;
  return {
    subject: copy.subject(at),
    html: WRAPPER(
      `<h1 style="font-size:1.25rem">${escapeHtml(copy.heading)}</h1><p>${escapeHtml(copy.body)}</p><p style="padding:1rem;background:#f5f5f4;border-radius:.5rem"><strong>Role:</strong> ${escapeHtml(at)}</p>`,
    ),
    text: `${copy.heading}

${copy.body}

Role: ${at}`,
  };
}

/**
 * Sent to the recruiter when a candidate withdraws.
 *
 * The recruiter is the one who needs this: an application that silently stopped
 * being live would otherwise sit in their pipeline as a candidate still waiting
 * on them.
 */
export function renderApplicationWithdrawnEmail(candidate: string, role: string): Rendered {
  return {
    subject: `A candidate withdrew from ${role}`,
    html: WRAPPER(
      `<h1 style="font-size:1.25rem">A candidate withdrew</h1><p>${escapeHtml(candidate)} has withdrawn their application for <strong>${escapeHtml(role)}</strong>. No action is needed — the application is closed and will no longer appear as awaiting your decision.</p>`,
    ),
    text: `A candidate withdrew

${candidate} has withdrawn their application for ${role}. No action is needed - the application is closed.`,
  };
}
