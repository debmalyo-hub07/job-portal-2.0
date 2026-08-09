import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/AppError.js";
import { logger } from "../lib/logger.js";

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = req.requestId;

  if (err instanceof AppError) {
    // Handed to the http logger, which sees the response but never the thrown
    // error. Without it a 403 logs as a bare status with no indication of which
    // rule refused — RECRUITER_PENDING_APPROVAL and an ownership 404 look
    // identical in the log.
    res.locals.errorCode = err.code;

    res.status(err.statusCode).json({
      success: false,
      code: err.code,
      message: err.message,
      details: err.details,
      requestId,
    });
    return;
  }

  logger.error({ requestId, err }, "Unhandled error");

  res.status(500).json({
    success: false,
    code: "INTERNAL_ERROR",
    message: "Internal server error",
    details: [],
    requestId,
  });
}
