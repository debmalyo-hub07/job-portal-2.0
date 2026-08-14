import express from "express";
import { authenticate } from "../middleware/authenticate.js";
import { requireApproved } from "../middleware/requireApproved.js";
import {
  applyJob,
  getAppliedJobs,
  getApplicants,
  updateStatus,
} from "../controllers/application.controller.js";
import { csrfProtection } from "../middleware/csrf.js";

const router = express.Router();

// POST, not GET: applying creates an Application. As a GET it was reachable by
// any crawler, prefetch or <img> tag, and forgeable cross-site.
router.route("/apply/:id").post(authenticate("seeker"), csrfProtection, applyJob);
router.route("/get").get(authenticate("seeker"), getAppliedJobs);
// Applicant data is the thing an unapproved recruiter most wants and least
// deserves — a seeker's name, email, phone and resume link.
router.route("/:id/applicants").get(authenticate("recruiter"), requireApproved, getApplicants);
router
  .route("/status/:id/update")
  .post(authenticate("recruiter"), requireApproved, csrfProtection, updateStatus);

export default router;
