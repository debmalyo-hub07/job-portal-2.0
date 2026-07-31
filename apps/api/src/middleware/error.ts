import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/AppError.js";

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = req.id;

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      code: err.code,
      message: err.message,
      details: err.details,
      requestId,
    });
    return;
  }

  console.error("Unhandled error", { requestId, err });

  res.status(500).json({
    success: false,
    code: "INTERNAL_ERROR",
    message: "Internal server error",
    details: [],
    requestId,
  });
}
