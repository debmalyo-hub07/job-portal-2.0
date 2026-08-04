import express from "express";
import { authenticate } from "../middleware/authenticate.js";
import {
  applyJob,
  getAppliedJobs,
  getApplicants,
  updateStatus,
} from "../controllers/application.controller.js";

const router = express.Router();

// POST, not GET: applying creates an Application. As a GET it was reachable by
// any crawler, prefetch or <img> tag, and forgeable cross-site.
router.route("/apply/:id").post(authenticate("seeker"), applyJob);
router.route("/get").get(authenticate("seeker"), getAppliedJobs);
router.route("/:id/applicants").get(authenticate("recruiter"), getApplicants);
router.route("/status/:id/update").post(authenticate("recruiter"), updateStatus);

export default router;
