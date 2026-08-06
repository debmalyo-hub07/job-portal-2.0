import express from "express";
import { authenticate } from "../middleware/authenticate.js";
import { listPendingRecruiters, approveRecruiter } from "../controllers/admin.controller.js";

const router = express.Router();

/**
 * Admin-only domain routes.
 *
 * `authenticate("admin")` is a route literal, so a seeker or recruiter token
 * fails SIGNATURE verification here rather than a claim comparison — the key is
 * HKDF-derived from "access:admin". There is no `requireApproved` equivalent:
 * an admin row only exists because `seed:admin` or another admin created it.
 */
router.route("/recruiters/pending").get(authenticate("admin"), listPendingRecruiters);
router.route("/recruiters/:id/approve").post(authenticate("admin"), approveRecruiter);

export default router;
