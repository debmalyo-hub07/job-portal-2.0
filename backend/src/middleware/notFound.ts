import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/AppError.js";

/**
 * Terminal 404.
 *
 * Throws rather than responding directly, so every failure envelope in the app
 * is produced by errorHandler alone. When this wrote its own JSON it silently
 * omitted `details` and `requestId`, giving clients two different error shapes
 * to parse depending on which handler answered.
 */
export function notFound(_req: Request, _res: Response, next: NextFunction): void {
  next(AppError.notFound("NOT_FOUND", "Route not found"));
}
