import express from "express";
import { bridgeAuth } from "../middleware/bridgeAuth.js";
import {
  postJob,
  getAllJobs,
  getJobById,
  getAdminJobs,
} from "../controllers/job.controller.js";

const router = express.Router();

router.route("/post").post(bridgeAuth("recruiter"), postJob);
router.route("/get").get(bridgeAuth("any"), getAllJobs);
router.route("/get/:id").get(bridgeAuth("any"), getJobById);
router.route("/getadminjobs").get(bridgeAuth("recruiter"), getAdminJobs);

export default router;
