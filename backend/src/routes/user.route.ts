import express from "express";
import { completeProfile, getProfile, updateProfile } from "../controllers/user.controller.js";
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
// Deliberately NOT behind `requireProfileComplete`: this is the route that clears
// it. Same exemption `requireVerified` grants the resend-code route, and the same
// trap — a gate mounted here would be an unrecoverable lockout.
//
// No `resumeUpload`: this path is JSON, and there is no file on it.
router.route("/profile/complete").post(authenticateAny(), csrfProtection(), completeProfile);

export default router;
