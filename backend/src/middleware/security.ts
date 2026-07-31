import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import hpp from "hpp";
import { env } from "../config/env.js";
import { AppError } from "../lib/AppError.js";

export function applySecurity(app: Express): void {
  app.disable("x-powered-by");
  // Required for req.ip to hold the real client address behind a reverse proxy.
  // Without it every request appears to come from the proxy and rate limiting
  // throttles all users as one.
  app.set("trust proxy", 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

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
      allowedHeaders: ["Content-Type", "X-CSRF-Token", "X-Request-Id"],
    }),
  );

  // 1mb, down from 16mb. Uploads go through multer, not the JSON parser, so
  // nothing legitimate needs that headroom.
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use(hpp());
}
