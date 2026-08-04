import express from "express";
import { authenticate } from "../middleware/authenticate.js";
import {
  registerCompany,
  getCompany,
  getCompanyById,
  updateCompany,
} from "../controllers/company.controller.js";
import { logoUpload } from "../middleware/multer.js";

const router = express.Router();

router.route("/register").post(authenticate("recruiter"), registerCompany);
router.route("/get").get(authenticate("recruiter"), getCompany);
router.route("/get/:id").get(authenticate("recruiter"), getCompanyById);
router.route("/update/:id").put(authenticate("recruiter"), logoUpload, updateCompany);

export default router;
