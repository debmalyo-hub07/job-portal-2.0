import express from "express";
import { authenticate } from "../middleware/authenticate.js";
import { csrfProtection } from "../middleware/csrf.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { requireMailerAvailable } from "../middleware/requireMailerAvailable.js";
import {
  accountEvents,
  listCompanies,
  listFlags,
  listJobs,
  listRecruiters,
  listSeekers,
  reinstateRecruiter,
  reinstateSeeker,
  suspendRecruiter,
  suspendSeeker,
  listPendingRecruiters,
  approveRecruiter,
  denyRecruiter,
  getActivity,
  getInsights,
  getOverview,
  createAdmin,
  setFlag,
} from "../controllers/admin.controller.js";
import { getProfile, updateProfile } from "../controllers/user.controller.js";
import {
  confirmEmailChangeHandler,
  startEmailChangeHandler,
} from "../controllers/emailChange.controller.js";

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
 * Project D's oversight surface. The listings follow the jobs and companies
 * pattern (keyword + pagination, hand-written projections); the actions are
 * four separate mounts with the portal as a route literal — never a :portal
 * parameter the request could steer — and the history validates its :portal
 * segment against the shared enum because that one, unlike these four, is
 * read from the URL.
 */
router.route("/seekers").get(authenticate("admin"), listSeekers);
router.route("/recruiters").get(authenticate("admin"), listRecruiters);
// P3 of the console automation program. The write names its key against the
// registry at the controller, so an unregistered key is a 400 rather than a
// new flag nobody defined.
router.route("/flags").get(authenticate("admin"), listFlags);
router.route("/flags/:key").put(authenticate("admin"), csrfProtection(), setFlag);
router
  .route("/seekers/:id/suspend")
  .post(authenticate("admin"), csrfProtection(), suspendSeeker);
router
  .route("/seekers/:id/reinstate")
  .post(authenticate("admin"), csrfProtection(), reinstateSeeker);
router
  .route("/recruiters/:id/suspend")
  .post(authenticate("admin"), csrfProtection(), suspendRecruiter);
router
  .route("/recruiters/:id/reinstate")
  .post(authenticate("admin"), csrfProtection(), reinstateRecruiter);
router.route("/accounts/:portal/:id/events").get(authenticate("admin"), accountEvents);

/**
 * The admin's email change — the same two controller functions the user mount
 * serves, under the admin gate (ADR-0006), and a deliberately stronger flow:
 * the service runs the two-stage state machine for this portal, password
 * first, code to the CURRENT address, then a second code to the new one.
 *
 * Same rate shape as the user mount: start 3/hour keyed by subject, confirm
 * 10/hour per IP.
 */
router
  .route("/email-change")
  .post(
    authenticate("admin"),
    csrfProtection(),
    rateLimit({
      windowMs: 3_600_000,
      max: 3,
      keyFn: (req) => `subject:${req.auth?.id ?? req.ip ?? "unknown"}`,
    }),
    requireMailerAvailable,
    startEmailChangeHandler,
  );
router
  .route("/email-change/confirm")
  .post(
    authenticate("admin"),
    csrfProtection(),
    rateLimit({ windowMs: 3_600_000, max: 10 }),
    confirmEmailChangeHandler,
  );

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
