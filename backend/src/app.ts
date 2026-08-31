import cookieParser from "cookie-parser";
import express, { type Express } from "express";

import applicationRoute from "./routes/application.route.js";
import companyRoute from "./routes/company.route.js";
import adminRoute from "./routes/admin.route.js";
import { healthRouter } from "./routes/health.js";
import jobRoute from "./routes/job.route.js";
import userRoute from "./routes/user.route.js";
import locationRoute from "./routes/location.route.js";
import { buildAuthRouter } from "./routes/auth.route.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/error.js";
import { requestId } from "./middleware/requestId.js";
import { trustedClientIp } from "./middleware/clientIp.js";
import { applySecurity } from "./middleware/security.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { buildHttpLogger, resolveLogHttpMode } from "./lib/httpLogger.js";

export function buildApp(): Express {
  const app = express();

  // First, so every subsequent log line and error carries the correlation id.
  app.use(requestId);
  // Before the logger and before any rate limiter, both of which read req.ip:
  // this is what makes that address the browser's rather than the web origin
  // proxy's. Inert unless PROXY_SHARED_SECRET is set on both hosts.
  app.use(trustedClientIp());
  // Reads process.env directly rather than env(): buildApp() is called at module
  // scope by the test harness, before tests/setup.ts assigns MONGO_URI in
  // beforeAll, so calling env() here fails full config validation on 16 suites.
  // Same bootstrap exception as lib/logger.ts, for the same reason.
  app.use(buildHttpLogger(undefined, resolveLogHttpMode()));

  applySecurity(app);
  app.use(cookieParser());
  app.use(rateLimit({ windowMs: 60_000, max: 100 }));

  // Twice, deliberately. render.yaml health-checks `/health` at the root, and
  // that path sits outside the `/api/*` prefix the web origin's proxy forwards,
  // so it is unreachable from the browser in the proxied topology. The versioned
  // mount is the one the sign-in pages call to wake a sleeping free-tier
  // instance before someone's first real request pays for it.
  app.use("/health", healthRouter);
  app.use("/api/v1/health", healthRouter);
  app.use("/api/v1/user", userRoute);
  app.use("/api/v1/seeker/auth", buildAuthRouter("seeker"));
  app.use("/api/v1/recruiter/auth", buildAuthRouter("recruiter"));
  app.use("/api/v1/admin/auth", buildAuthRouter("admin"));
  // After the auth mount: Express matches in registration order, and this
  // router must not shadow /api/v1/admin/auth/*.
  app.use("/api/v1/admin", adminRoute);
  app.use("/api/v1/company", companyRoute);
  app.use("/api/v1/job", jobRoute);
  app.use("/api/v1/application", applicationRoute);
  app.use("/api/v1/location", locationRoute);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
