import express from "express";
import { authenticate } from "../middleware/authenticate.js";
import { requireApproved } from "../middleware/requireApproved.js";
import {
  registerCompany,
  getCompany,
  getCompanyById,
  updateCompany,
} from "../controllers/company.controller.js";
import { logoUpload } from "../middleware/multer.js";

const router = express.Router();

// The two mutations are gated; the two reads are not. A pending recruiter owns
// no rows, so a read returns the empty set — gating it would turn an ordinary
// empty workspace into an error screen with nothing to explain it.
router.route("/register").post(authenticate("recruiter"), requireApproved, registerCompany);
router.route("/get").get(authenticate("recruiter"), getCompany);
router.route("/get/:id").get(authenticate("recruiter"), getCompanyById);
router
  .route("/update/:id")
  .put(authenticate("recruiter"), requireApproved, logoUpload, updateCompany);

export default router;
