import type { RequestHandler } from "express";

import { assertMailerAvailable } from "../lib/mailer.js";

export const requireMailerAvailable: RequestHandler = async (_req, _res, next) => {
  await assertMailerAvailable();
  next();
};
