import { BrevoClient } from "@getbrevo/brevo";
import { env } from "../config/env.js";
import { AppError } from "./AppError.js";
import { logger } from "./logger.js";
import type { OtpPurpose, OtpStage } from "../models/otpCode.model.js";
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
  verify?(): Promise<void>;
}

export type MailerErrorDetails = {
  reason: string;
  statusCode?: number;
  code?: string;
  message?: string;
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

/** Reduces provider errors to fields that cannot contain API keys or message bodies. */
export function describeMailerError(error: unknown): MailerErrorDetails {
  const value = record(error);
  const body = record(value?.body);
  const reason =
    (typeof value?.reason === "string" && value.reason) ||
    (error instanceof Error ? error.name : "unknown");
  const details: MailerErrorDetails = { reason };

  if (typeof value?.statusCode === "number") details.statusCode = value.statusCode;
  if (typeof body?.code === "string") details.code = body.code;
  if (typeof body?.message === "string") details.message = body.message;
  else if (typeof value?.errorMessage === "string") details.message = value.errorMessage;
  else if (error instanceof Error) details.message = error.message;

  return details;
}

const brevoMailer: Mailer = {
  async verify() {
    const { senders = [] } = await brevo().senders.getSenders();
    const configured = senders.find(
      (sender) => sender.email.toLowerCase() === env().BREVO_SENDER_EMAIL.toLowerCase(),
    );
    if (!configured?.active) {
      throw new Error("Configured Brevo sender is missing or inactive.");
    }
  },
  async send(to, subject, html, text) {
    const accepted = await brevo().transactionalEmails.sendTransacEmail({
      sender: { email: env().BREVO_SENDER_EMAIL, name: env().BREVO_SENDER_NAME },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    });
    logger.info(
      { providerMessageId: accepted.messageId ?? accepted.messageIds?.[0] ?? null },
      "transactional email accepted",
    );
  },
};

let active: Mailer = brevoMailer;

type MailerAvailability = "unchecked" | "ready" | "unavailable";

const MAILER_RECHECK_INTERVAL_MS = 60_000;
let availability: { state: MailerAvailability; checkedAt: number } = {
  state: "unchecked",
  checkedAt: 0,
};
let verificationInFlight: Promise<boolean> | undefined;

function markMailerReady(): void {
  availability = { state: "ready", checkedAt: Date.now() };
}

function markMailerUnavailable(): void {
  availability = { state: "unavailable", checkedAt: Date.now() };
}

export function setMailer(next: Mailer): void {
  active = next;
  availability = next.verify
    ? { state: "unchecked", checkedAt: 0 }
    : { state: "ready", checkedAt: Date.now() };
  verificationInFlight = undefined;
}
export function resetMailer(): void {
  active = brevoMailer;
  availability = { state: "unchecked", checkedAt: 0 };
  verificationInFlight = undefined;
}

/** Authenticates with Brevo and verifies that the configured sender is active. */
export async function verifyMailerConfiguration(): Promise<void> {
  try {
    await active.verify?.();
    markMailerReady();
  } catch (error) {
    markMailerUnavailable();
    throw error;
  }
}

/**
 * Cached provider readiness check used before any operation that must mail a
 * code. A failed check opens the circuit briefly; one request after the retry
 * interval probes Brevo again, so recovery needs no process restart.
 */
export async function isMailerAvailable(): Promise<boolean> {
  if (availability.state === "ready") return true;

  const unavailableCheckIsFresh =
    availability.state === "unavailable" &&
    Date.now() - availability.checkedAt < MAILER_RECHECK_INTERVAL_MS;
  if (unavailableCheckIsFresh) {
    return false;
  }

  verificationInFlight ??= (async () => {
    try {
      await verifyMailerConfiguration();
      return true;
    } catch (error) {
      logger.warn(
        { mailError: describeMailerError(error) },
        "transactional email readiness check failed",
      );
      return false;
    } finally {
      verificationInFlight = undefined;
    }
  })();

  return verificationInFlight;
}

export async function assertMailerAvailable(): Promise<void> {
  if (!(await isMailerAvailable())) {
    throw AppError.serviceUnavailable(
      "EMAIL_UNAVAILABLE",
      "Email delivery is temporarily unavailable. Please try again shortly.",
    );
  }
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
 * 2. Race tolerance. Routes check provider readiness before writing, but the
 *    provider can fail between that check and this send. The current request
 *    remains enumeration-safe; the rejection opens the circuit so later code
 *    requests return 503 instead of claiming another message was sent.
 */
export function dispatch(work: Promise<void>): void {
  // NOTE: never add the OTP code to this log line. A live credential in the log
  // store is exactly the exposure the peppered hash in Task 3 exists to prevent.
  void work.then(markMailerReady).catch((error: unknown) => {
    markMailerUnavailable();
    logger.error({ mailError: describeMailerError(error) }, "transactional email failed");
  });
}

export async function sendOtpEmail(
  to: string,
  code: string,
  purpose: OtpPurpose,
  stage: OtpStage | null = null,
): Promise<void> {
  const { subject, html, text } = renderOtpEmail(code, purpose, env().OTP_TTL_MINUTES, stage);
  await active.send(to, subject, html, text);
}

export async function sendRendered(
  to: string,
  r: { subject: string; html: string; text: string },
): Promise<void> {
  await active.send(to, r.subject, r.html, r.text);
}
