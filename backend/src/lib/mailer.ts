import { BrevoClient } from "@getbrevo/brevo";
import { env } from "../config/env.js";
import { logger } from "./logger.js";
import type { OtpPurpose } from "../models/otpCode.model.js";
import { renderOtpEmail } from "./emailTemplates.js";

/**
 * Lazy, for the same reason getCloudinary() is lazy: constructing this at module
 * scope calls env() at import time, which forces full config validation before
 * tests/setup.ts has populated process.env. That broke the health tests once
 * already — see the cloudinary fix in Phase 1A.
 */
let client: BrevoClient | undefined;
function brevo(): BrevoClient {
  client ??= new BrevoClient({ apiKey: env().BREVO_API_KEY, maxRetries: 2 });
  return client;
}

/** Test seam. Replaced wholesale in tests so no test ever opens a socket. */
export interface Mailer {
  send(to: string, subject: string, html: string, text: string): Promise<void>;
}

const brevoMailer: Mailer = {
  async send(to, subject, html, text) {
    await brevo().transactionalEmails.sendTransacEmail({
      sender: { email: env().BREVO_SENDER_EMAIL, name: env().BREVO_SENDER_NAME },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    });
  },
};

let active: Mailer = brevoMailer;
export function setMailer(next: Mailer): void {
  active = next;
}
export function resetMailer(): void {
  active = brevoMailer;
}

/**
 * Fire-and-forget with logged failure.
 *
 * Deliberate, and load-bearing for two separate reasons:
 *
 * 1. Timing. forgot-password must take the same wall-clock time whether or not
 *    the address exists. Awaiting a 50-300ms Brevo call on the exists branch and
 *    returning immediately on the absent branch reproduces the enumeration oracle
 *    that the uniform 200 was meant to close.
 * 2. Availability. A Brevo outage must not fail registration. The account persists
 *    unverified and the user can request another code.
 */
export function dispatch(work: Promise<void>): void {
  // NOTE: never add the OTP code to this log line. A live credential in the log
  // store is exactly the exposure the peppered hash in Task 3 exists to prevent.
  void work.catch((error: unknown) => {
    logger.error({ err: error }, "transactional email failed");
  });
}

export async function sendOtpEmail(to: string, code: string, purpose: OtpPurpose): Promise<void> {
  const { subject, html, text } = renderOtpEmail(code, purpose, env().OTP_TTL_MINUTES);
  await active.send(to, subject, html, text);
}

export async function sendRendered(
  to: string,
  r: { subject: string; html: string; text: string },
): Promise<void> {
  await active.send(to, r.subject, r.html, r.text);
}
