import type { ZodType } from "zod";
import { AppError } from "./AppError.js";

/**
 * safeParse + AppError instead of letting a ZodError fly: the error middleware
 * only speaks AppError, so a raw ZodError would surface as a 500 with schema
 * internals in the log, where a 400 envelope belongs.
 */
export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw AppError.badRequest("VALIDATION_ERROR", "Request validation failed.", result.error.issues);
  }
  return result.data;
}
