import express from "express";

import { resolvedFlags } from "../services/flags.service.js";

/**
 * The public flag read — P3 of the console automation program. Unauthenticated
 * on purpose (flag state is not a secret, and the client needs it to branch
 * UI); answers resolved values only, never who flipped what.
 */
const router = express.Router();

router.get("/", async (_req, res) => {
  res.status(200).json({ success: true, flags: await resolvedFlags() });
});

export default router;
