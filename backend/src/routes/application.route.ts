import express from "express";
import { bridgeAuth } from "../middleware/bridgeAuth.js";
import {
  applyJob,
  getAppliedJobs,
  getApplicants,
  updateStatus,
} from "../controllers/application.controller.js";

const router = express.Router();

router.route("/apply/:id").get(bridgeAuth("seeker"), applyJob);
router.route("/get").get(bridgeAuth("seeker"), getAppliedJobs);
router.route("/:id/applicants").get(bridgeAuth("recruiter"), getApplicants);
router.route("/status/:id/update").post(bridgeAuth("recruiter"), updateStatus);

export default router;
