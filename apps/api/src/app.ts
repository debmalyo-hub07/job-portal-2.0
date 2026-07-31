import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";

import applicationRoute from "./routes/application.route.js";
import companyRoute from "./routes/company.route.js";
import { healthRouter } from "./routes/health.js";
import jobRoute from "./routes/job.route.js";
import userRoute from "./routes/user.route.js";
import { notFound } from "./middleware/notFound.js";
import { env } from "./config/env.js";

export function buildApp(): Express {
  const app = express();

  app.use(express.json({ limit: "16mb" }));
  app.use(express.urlencoded({ extended: true, limit: "16mb" }));
  app.use(cookieParser());
  app.use(
    cors({
      origin: env().CLIENT_URLS,
      credentials: true,
    }),
  );

  app.use("/health", healthRouter);
  app.use("/api/v1/user", userRoute);
  app.use("/api/v1/company", companyRoute);
  app.use("/api/v1/job", jobRoute);
  app.use("/api/v1/application", applicationRoute);

  app.use(notFound);

  return app;
}
