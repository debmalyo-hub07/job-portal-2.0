import express from "express";
import { getProfile, login, logout, register, updateProfile } from "../controllers/user.controller.js";
import { bridgeAuth } from "../middleware/bridgeAuth.js";
import { singleUpload } from "../middleware/multer.js";

const router = express.Router();

router.route("/register").post(singleUpload, register);
router.route("/login").post(login);
router.route("/logout").get(logout);
router.route("/profile/update").post(bridgeAuth("any"), singleUpload, updateProfile);
router.route("/profile").get(bridgeAuth("any"), getProfile);

export default router;
