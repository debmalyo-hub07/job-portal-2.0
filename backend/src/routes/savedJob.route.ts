import express from "express";

import { authenticate } from "../middleware/authenticate.js";
import { csrfProtection } from "../middleware/csrf.js";
import { check, list, save, unsave } from "../controllers/savedJob.controller.js";

const router = express.Router();

// The seeker's shortlist. Session-gated only, deliberately NOT behind
// requireProfileComplete: applying is the consequential action that
// justifies the profile gate, and saving is a bookmark.
router.route("/").get(authenticate("seeker"), list);
router.route("/:jobId").get(authenticate("seeker"), check);
router.route("/:jobId").post(authenticate("seeker"), csrfProtection(), save);
router.route("/:jobId").delete(authenticate("seeker"), csrfProtection(), unsave);

export default router;
