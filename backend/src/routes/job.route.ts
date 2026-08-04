import express from "express";
import { authenticate, optionalAuthenticate } from "../middleware/authenticate.js";
import { postJob, getAllJobs, getJobById, getAdminJobs } from "../controllers/job.controller.js";

const router = express.Router();

router.route("/post").post(authenticate("recruiter"), postJob);
// Public: the job board and a job's detail page are the product's front door.
// The inherited code required a session on both, so an anonymous visitor got a
// 401 and the home page rendered "No Job Available". `optionalAuthenticate`
// still resolves a session when one is present.
router.route("/get").get(optionalAuthenticate(), getAllJobs);
router.route("/get/:id").get(optionalAuthenticate(), getJobById);
router.route("/getadminjobs").get(authenticate("recruiter"), getAdminJobs);

export default router;
