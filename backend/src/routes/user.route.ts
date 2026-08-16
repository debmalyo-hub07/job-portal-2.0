import express from "express";
import { getProfile, updateProfile } from "../controllers/user.controller.js";
import { authenticateAny } from "../middleware/authenticate.js";
import { resumeUpload } from "../middleware/multer.js";
import { csrfProtection } from "../middleware/csrf.js";

const router = express.Router();

// Authentication lives on /api/v1/{seeker,recruiter}/auth/*. What remains here
// is the profile pair, which serves both portals — hence `authenticateAny`,
// which resolves whichever portal session the browser holds.
router.route("/profile").get(authenticateAny(), getProfile);
router
  .route("/profile/update")
  .post(authenticateAny(), csrfProtection(), resumeUpload, updateProfile);

export default router;
