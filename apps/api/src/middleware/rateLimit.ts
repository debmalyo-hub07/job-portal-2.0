import type { NextFunction, Request, RequestHandler, Response } from "express";
import { AppError } from "../lib/AppError.js";
import { defaultRateLimitStore, type RateLimitStore } from "../lib/rateLimitStore.js";

export type RateLimitOptions = {
  windowMs: number;
  max: number;
  keyFn?: (req: Request) => string;
  code?: string;
  message?: string;
  store?: RateLimitStore;
};

export function rateLimit(options: RateLimitOptions): RequestHandler {
  const {
    windowMs,
    max,
    keyFn = (req) => req.ip ?? "unknown",
    code = "RATE_LIMITED",
    message = "Too many requests. Please try again later.",
    store = defaultRateLimitStore,
  } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const key = `${req.method}:${req.route?.path ?? req.path}:${keyFn(req)}`;
      const { count, resetAt } = await store.increment(key, windowMs);

      res.setHeader("RateLimit-Limit", max);
      res.setHeader("RateLimit-Remaining", Math.max(0, max - count));

      if (count > max) {
        res.setHeader("Retry-After", Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)));
        throw AppError.tooManyRequests(code, message);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
