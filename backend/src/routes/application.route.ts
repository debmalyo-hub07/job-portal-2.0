import express from "express";
import { authenticate } from "../middleware/authenticate.js";
import { requireApproved } from "../middleware/requireApproved.js";
import {
  applyJob,
  getAppliedJobs,
  getApplicants,
  updateStatus,
  withdraw,
} from "../controllers/application.controller.js";
import { csrfProtection } from "../middleware/csrf.js";

const router = express.Router();

// POST, not GET: applying creates an Application. As a GET it was reachable by
// any crawler, prefetch or <img> tag, and forgeable cross-site.
router.route("/apply/:id").post(authenticate("seeker"), csrfProtection(), applyJob);
router.route("/get").get(authenticate("seeker"), getAppliedJobs);
// Applicant data is the thing an unapproved recruiter most wants and least
// deserves — a seeker's name, email, phone and resume link.
router.route("/:id/applicants").get(authenticate("recruiter"), requireApproved, getApplicants);
router
  .route("/status/:id/update")
  .post(authenticate("recruiter"), requireApproved, csrfProtection(), updateStatus);
// The candidate's own exit. Gated on the seeker portal, and the service resolves
// the application by `applicant` so a seeker cannot withdraw somebody else's —
// the job's recruiter has no route to this transition at all.
router.route("/:id/withdraw").post(authenticate("seeker"), csrfProtection(), withdraw);

export default router;
