import express from "express";
import { getProfile, updateProfile } from "../controllers/user.controller.js";
import { bridgeAuth } from "../middleware/bridgeAuth.js";
import { resumeUpload } from "../middleware/multer.js";

const router = express.Router();

// Authentication lives on /api/v1/{seeker,recruiter}/auth/*. What remains here
// is the profile pair, which Phase 1C rebuilds as a proper module.
router.route("/profile").get(bridgeAuth("any"), getProfile);
router.route("/profile/update").post(bridgeAuth("any"), resumeUpload, updateProfile);

export default router;
