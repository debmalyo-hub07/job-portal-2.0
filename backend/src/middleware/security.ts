import cors from "cors";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import hpp from "hpp";
import { env } from "../config/env.js";
import { AppError } from "../lib/AppError.js";

export function enforceHttps(enabled: boolean) {
  return function enforceHttpsMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): void {
    if (!enabled || req.secure) {
      next();
      return;
    }
    next(new AppError(426, "HTTPS_REQUIRED", "HTTPS is required."));
  };
}

export function applySecurity(app: Express): void {
  app.disable("x-powered-by");
  // Required for req.ip to hold the real client address behind a reverse proxy.
  // Without it every request appears to come from the proxy and rate limiting
  // throttles all users as one.
  app.set("trust proxy", 1);

  // buildApp() is imported by the test harness before MONGO_URI is assigned;
  // NODE_ENV is the one low-risk bootstrap value that can be read directly.
  const production = process.env.NODE_ENV === "production";
  app.use(enforceHttps(production));

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      strictTransportSecurity: production
        ? { maxAge: 31_536_000, includeSubDomains: true }
        : false,
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header: same-origin navigation, curl, or a server-to-server
        // call. Browsers always send it for cross-origin requests.
        if (!origin || env().CLIENT_URLS.includes(origin)) {
          callback(null, true);
          return;
        }
        // An AppError rather than a plain Error, so the handler renders a 403
        // envelope instead of masking a policy decision as an internal fault.
        callback(AppError.forbidden("ORIGIN_NOT_ALLOWED", `Origin ${origin} is not allowed`));
      },
      credentials: true,
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "X-CSRF-Token",
        "X-Request-Id",
        "X-Turnstile-Token",
      ],
    }),
  );

  // 1mb, down from 16mb. Uploads go through multer, not the JSON parser, so
  // nothing legitimate needs that headroom.
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use(hpp());
}
