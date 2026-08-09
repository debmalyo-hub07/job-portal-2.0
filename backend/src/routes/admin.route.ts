import express from "express";
import { authenticate } from "../middleware/authenticate.js";
import {
  listPendingRecruiters,
  approveRecruiter,
  denyRecruiter,
  getOverview,
  listJobs,
  listCompanies,
} from "../controllers/admin.controller.js";

const router = express.Router();

/**
 * Admin-only domain routes.
 *
 * `authenticate("admin")` is a route literal, so a seeker or recruiter token
 * fails SIGNATURE verification here rather than a claim comparison — the key is
 * HKDF-derived from "access:admin". There is no `requireApproved` equivalent:
 * an admin row only exists because `seed:admin` or another admin created it.
 *
 * Every route names its portal individually rather than mounting the middleware
 * once on the router. It is more typing, and it is what makes a new route
 * missing its gate visible on the line that adds it.
 */
router.route("/overview").get(authenticate("admin"), getOverview);
// Under /review/* rather than /jobs and /companies, matching the client route
// names: those bare prefixes still belong to the pre-3A recruiter workspace
// redirects, and one vocabulary across client and API is worth more than two
// characters saved.
router.route("/review/jobs").get(authenticate("admin"), listJobs);
router.route("/review/companies").get(authenticate("admin"), listCompanies);
router.route("/recruiters/pending").get(authenticate("admin"), listPendingRecruiters);
router.route("/recruiters/:id/approve").post(authenticate("admin"), approveRecruiter);
router.route("/recruiters/:id/deny").post(authenticate("admin"), denyRecruiter);

export default router;
