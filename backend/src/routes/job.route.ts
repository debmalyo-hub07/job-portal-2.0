import express from "express";
import { bridgeAuth, optionalBridgeAuth } from "../middleware/bridgeAuth.js";
import {
  postJob,
  getAllJobs,
  getJobById,
  getAdminJobs,
} from "../controllers/job.controller.js";

const router = express.Router();

router.route("/post").post(bridgeAuth("recruiter"), postJob);
// Public. The job board and a job's detail page are the product's front door —
// the inherited code put isAuthenticated on both, so an anonymous visitor got a
// 401 and the home page rendered "No Job Available". Neither handler reads
// req.id. `optionalBridgeAuth` still resolves a session when one is present.
router.route("/get").get(optionalBridgeAuth(), getAllJobs);
router.route("/get/:id").get(optionalBridgeAuth(), getJobById);
router.route("/getadminjobs").get(bridgeAuth("recruiter"), getAdminJobs);

export default router;
