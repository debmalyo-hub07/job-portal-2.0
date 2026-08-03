import express from "express";
import { bridgeAuth } from "../middleware/bridgeAuth.js";
import {
  registerCompany,
  getCompany,
  getCompanyById,
  updateCompany,
} from "../controllers/company.controller.js";
import { singleUpload } from "../middleware/multer.js";

const router = express.Router();

router.route("/register").post(bridgeAuth("recruiter"), registerCompany);
router.route("/get").get(bridgeAuth("recruiter"), getCompany);
router.route("/get/:id").get(bridgeAuth("recruiter"), getCompanyById);
router.route("/update/:id").put(bridgeAuth("recruiter"), singleUpload, updateCompany);

export default router;
