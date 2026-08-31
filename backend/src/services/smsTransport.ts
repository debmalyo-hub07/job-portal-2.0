import { env } from "../config/env.js";
import { AppError } from "../lib/AppError.js";

/**
 * The SMS transport — the ONE file the phone-verification activation path
 * replaces. P3 of the location-aware phase shipped the whole flow (purpose,
 * budget, redemption, routes) dormant: no provider is configured, so nothing
 * here can send. When one is chosen, implement `deliver` against it.
 *
 * Keyed on `SMS_PROVIDER_KEY` exactly like TURNSTILE_SECRET_KEY: present, the
 * phone-verification routes mount and this transport is expected to work;
 * absent, the routes do not exist and this module is never reached. The
 * checks below are belt to that mount's braces.
 */

export async function sendSms(_to: string, _body: string): Promise<void> {
  if (!env().SMS_PROVIDER_KEY) {
    throw AppError.serviceUnavailable("SMS_NOT_CONFIGURED", "Phone verification is not enabled.");
  }
  // The activation seam: one function, one provider call. Loud rather than
  // silent — a key without a transport is a half-finished activation.
  throw new AppError(
    501,
    "SMS_TRANSPORT_NOT_IMPLEMENTED",
    "An SMS provider key is set but no transport is implemented. See the deployment runbook.",
  );
}

/** The message a code travels in. Deterministic so the flow is testable. */
export function smsBody(code: string): string {
  return `Your Cairn verification code is ${code}. It expires in 10 minutes.`;
}
