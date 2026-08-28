import express from "express";
import { authenticate } from "../middleware/authenticate.js";
import { requireApproved } from "../middleware/requireApproved.js";
import { requireProfileComplete } from "../middleware/requireProfileComplete.js";
import {
  applyJob,
  getAppliedJobs,
  getApplicants,
  getQueue,
  updateStatus,
  withdraw,
} from "../controllers/application.controller.js";
import { csrfProtection } from "../middleware/csrf.js";

const router = express.Router();

// POST, not GET: applying creates an Application. As a GET it was reachable by
// any crawler, prefetch or <img> tag, and forgeable cross-site.
//
// Gated on identity as well as session: applying is the seeker's consequential
// action, and `/get/:id` is a PUBLIC page, so this is the one place an incomplete
// seeker can reach a write without ever passing the client-side guard.
router
  .route("/apply/:id")
  .post(authenticate("seeker"), requireProfileComplete, csrfProtection(), applyJob);
router.route("/get").get(authenticate("seeker"), getAppliedJobs);
// Applicant data is the thing an unapproved recruiter most wants and least
// deserves — a seeker's name, email, phone and resume link. The queue carries
// exactly the same fields, so it carries exactly the same gate.
router.route("/queue").get(authenticate("recruiter"), requireApproved, getQueue);
router.route("/:id/applicants").get(authenticate("recruiter"), requireApproved, getApplicants);
router
  .route("/status/:id/update")
  .post(authenticate("recruiter"), requireApproved, csrfProtection(), updateStatus);
// The candidate's own exit. Gated on the seeker portal, and the service resolves
// the application by `applicant` so a seeker cannot withdraw somebody else's —
// the job's recruiter has no route to this transition at all.
router.route("/:id/withdraw").post(authenticate("seeker"), csrfProtection(), withdraw);

export default router;
