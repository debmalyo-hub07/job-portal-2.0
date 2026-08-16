import express from "express";
import { authenticate, optionalAuthenticate } from "../middleware/authenticate.js";
import { requireApproved } from "../middleware/requireApproved.js";
import { postJob, getAllJobs, getJobById, getAdminJobs } from "../controllers/job.controller.js";
import { csrfProtection } from "../middleware/csrf.js";

const router = express.Router();

// Posting is the whole point of a recruiter account, so it is the gate that
// matters most. There are no job update or delete routes to gate.
router
  .route("/post")
  .post(authenticate("recruiter"), requireApproved, csrfProtection(), postJob);
// Public: the job board and a job's detail page are the product's front door.
// The inherited code required a session on both, so an anonymous visitor got a
// 401 and the home page rendered "No Job Available". `optionalAuthenticate`
// still resolves a session when one is present.
router.route("/get").get(optionalAuthenticate(), getAllJobs);
router.route("/get/:id").get(optionalAuthenticate(), getJobById);
// Ungated: reads only the caller's own jobs, which for a pending recruiter is
// the empty set.
router.route("/getadminjobs").get(authenticate("recruiter"), getAdminJobs);

export default router;
