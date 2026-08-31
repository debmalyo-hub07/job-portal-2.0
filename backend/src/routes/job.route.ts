import express from "express";
import { authenticate, optionalAuthenticate } from "../middleware/authenticate.js";
import { requireApproved } from "../middleware/requireApproved.js";
import { requireProfileComplete } from "../middleware/requireProfileComplete.js";
import {
  postJob,
  getAllJobs,
  getJobById,
  getNearMeJobs,
  getAdminJobs,
  updateJob,
  updateJobStatus,
  deleteJob,
} from "../controllers/job.controller.js";
import { csrfProtection } from "../middleware/csrf.js";

const router = express.Router();

// Posting is the whole point of a recruiter account, so it is the gate that
// matters most. Every write below carries the same chain, and each names its
// portal individually rather than mounting the middleware once on the router —
// more typing, and it is what stops a route added later from being public by
// omission.
router
  .route("/post")
  .post(authenticate("recruiter"), requireApproved, requireProfileComplete, csrfProtection(), postJob);
// Partial update on PUT, matching /company/update/:id — the client already
// speaks that shape. Ownership is resolved in the service, which answers 404 for
// a foreign job so probing cannot distinguish it from a missing one.
router
  .route("/update/:id")
  .put(authenticate("recruiter"), requireApproved, requireProfileComplete, csrfProtection(), updateJob);
// Close a filled role, or reopen one. Mirrors /application/status/:id/update.
router
  .route("/status/:id/update")
  .post(authenticate("recruiter"), requireApproved, requireProfileComplete, csrfProtection(), updateJobStatus);
// Only ever succeeds for a posting nobody applied to; the service refuses the
// rest with 409 rather than erasing what a candidate applied to.
router
  .route("/delete/:id")
  .delete(authenticate("recruiter"), requireApproved, requireProfileComplete, csrfProtection(), deleteJob);
// Public: the job board and a job's detail page are the product's front door.
// The inherited code required a session on both, so an anonymous visitor got a
// 401 and the home page rendered "No Job Available". `optionalAuthenticate`
// still resolves a session when one is present.
router.route("/get").get(optionalAuthenticate(), getAllJobs);
router.route("/get/:id").get(optionalAuthenticate(), getJobById);
// P4: the area-ranked board, seeker-only. Deliberately NOT behind
// `requireProfileComplete` — the board is the product's front door and an
// incomplete seeker simply gets the no-location 400 the rail prompts on, not
// a wall. The ranking reads the consented geoLocation or the self-reported
// city, neither of which needs the identity gate.
router.route("/near-me").get(authenticate("seeker"), getNearMeJobs);
// Ungated: reads only the caller's own jobs, which for a pending recruiter is
// the empty set.
router.route("/getadminjobs").get(authenticate("recruiter"), getAdminJobs);

export default router;
