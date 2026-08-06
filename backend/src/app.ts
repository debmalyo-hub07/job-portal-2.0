import cookieParser from "cookie-parser";
import express, { type Express } from "express";

import applicationRoute from "./routes/application.route.js";
import companyRoute from "./routes/company.route.js";
import { healthRouter } from "./routes/health.js";
import jobRoute from "./routes/job.route.js";
import userRoute from "./routes/user.route.js";
import { buildAuthRouter } from "./routes/auth.route.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/error.js";
import { requestId } from "./middleware/requestId.js";
import { applySecurity } from "./middleware/security.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { logger } from "./lib/logger.js";
import { pinoHttp } from "pino-http";

export function buildApp(): Express {
  const app = express();

  // First, so every subsequent log line and error carries the correlation id.
  app.use(requestId);
  app.use(pinoHttp({ logger, genReqId: (req) => (req as express.Request).requestId ?? "" }));

  applySecurity(app);
  app.use(cookieParser());
  app.use(rateLimit({ windowMs: 60_000, max: 100 }));

  app.use("/health", healthRouter);
  app.use("/api/v1/user", userRoute);
  app.use("/api/v1/seeker/auth", buildAuthRouter("seeker"));
  app.use("/api/v1/recruiter/auth", buildAuthRouter("recruiter"));
  app.use("/api/v1/admin/auth", buildAuthRouter("admin"));
  app.use("/api/v1/company", companyRoute);
  app.use("/api/v1/job", jobRoute);
  app.use("/api/v1/application", applicationRoute);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
