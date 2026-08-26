import express from "express";
import { authenticate } from "../middleware/authenticate.js";
import { csrfProtection } from "../middleware/csrf.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { requireMailerAvailable } from "../middleware/requireMailerAvailable.js";
import {
  listPendingRecruiters,
  approveRecruiter,
  denyRecruiter,
  getActivity,
  getInsights,
  getOverview,
  listJobs,
  listCompanies,
  createAdmin,
} from "../controllers/admin.controller.js";
import { getProfile, updateProfile } from "../controllers/user.controller.js";

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
// The dashboard's aggregations, split from /overview by how fast they go stale:
// the counters move on every approval, the activity feed on every write anywhere.
// One endpoint would force the slowest cache policy on all three.
router.route("/insights").get(authenticate("admin"), getInsights);
router.route("/activity").get(authenticate("admin"), getActivity);
router
  .route("/admins")
  .post(
    authenticate("admin"),
    csrfProtection(),
    rateLimit({ windowMs: 3_600_000, max: 5 }),
    requireMailerAvailable,
    createAdmin,
  );
// Under /review/* rather than /jobs and /companies, matching the client route
// names: those bare prefixes still belong to the pre-3A recruiter workspace
// redirects, and one vocabulary across client and API is worth more than two
// characters saved.
router.route("/review/jobs").get(authenticate("admin"), listJobs);
router.route("/review/companies").get(authenticate("admin"), listCompanies);
router.route("/recruiters/pending").get(authenticate("admin"), listPendingRecruiters);
router
  .route("/recruiters/:id/approve")
  .post(authenticate("admin"), csrfProtection(), approveRecruiter);
router
  .route("/recruiters/:id/deny")
  .post(authenticate("admin"), csrfProtection(), denyRecruiter);

/**
 * The same two controller functions `/user/profile` uses, under a different gate.
 * They read `req.auth.portal`, which is correct under either middleware.
 *
 * A second mount rather than widening `authenticateAny`: ADR-0006 requires that
 * an admin cookie must never silently satisfy a route that meant "some signed-in
 * user".
 *
 * No `resumeUpload`, because there is no file path into an admin row — which
 * makes this mount JSON-only, unlike `/user/profile/update`. A multipart body
 * here is a 400 rather than a silent no-op, which is asserted.
 *
 * No `requireProfileComplete` either: admin is ungated by decision.
 */
router.route("/profile").get(authenticate("admin"), getProfile);
router.route("/profile/update").post(authenticate("admin"), csrfProtection(), updateProfile);

export default router;
