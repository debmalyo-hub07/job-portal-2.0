import { createHmac, randomInt } from "node:crypto";
import type { Types } from "mongoose";
import { env } from "../config/env.js";

/**
 * `randomInt` is cryptographically secure and, critically, unbiased —
 * `Math.floor(Math.random() * 900000) + 100000` is neither, and modulo-reducing
 * a random byte string skews the distribution toward low digits.
 */
export function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Peppered, subject-bound hash. See otpCode.model.ts for why a bare digest is
 * not acceptable over a six-digit space.
 */
export function hashOtp(code: string, subjectId: Types.ObjectId | string): string {
  return createHmac("sha256", env().OTP_PEPPER).update(`${String(subjectId)}:${code}`).digest("hex");
}
