import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";
import getDataUri from "../utils/datauri.js";
import { getCloudinary } from "../utils/cloudinary.js";
import { AppError } from "../lib/AppError.js";
import { env } from "../config/env.js";

export const register = async (req: Request, res: Response): Promise<void> => {
  const { fullname, email, phoneNumber, password, role } = req.body;

  if (!fullname || !email || !phoneNumber || !password || !role) {
    throw AppError.badRequest("MISSING_FIELDS", "Something is missing");
  }
  const file = req.file as Express.Multer.File;
  const fileUri = getDataUri(file);
  const cloudResponse = await getCloudinary().uploader.upload(fileUri.content as string);

  const user = await User.findOne({ email });
  if (user) {
    throw AppError.conflict("EMAIL_TAKEN", "User already exist with this email.");
  }
  const hashedPassword = await bcrypt.hash(password, 10);

  await User.create({
    fullname,
    email,
    phoneNumber,
    password: hashedPassword,
    role,
    profile: {
      profilePhoto: cloudResponse.secure_url,
    },
  });

  res.status(201).json({
    message: "Account created successfully.",
    success: true,
  });
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password, role } = req.body;

  if (!email || !password || !role) {
    throw AppError.badRequest("MISSING_FIELDS", "Something is missing");
  }
  const foundUser = await User.findOne({ email });
  if (!foundUser) {
    throw AppError.badRequest("INVALID_CREDENTIALS", "Incorrect email or password.");
  }
  const isPasswordMatch = await bcrypt.compare(password, foundUser.password);
  if (!isPasswordMatch) {
    throw AppError.badRequest("INVALID_CREDENTIALS", "Incorrect email or password.");
  }
  // check role is correct or not
  if (role !== foundUser.role) {
    throw AppError.badRequest("ROLE_MISMATCH", "Account doesn't exist with current role.");
  }

  const tokenData = {
    userId: foundUser._id,
  };
  const token = jwt.sign(tokenData, env().JWT_ACCESS_SECRET, {
    expiresIn: "1d",
  });

  const user = {
    _id: foundUser._id,
    fullname: foundUser.fullname,
    email: foundUser.email,
    phoneNumber: foundUser.phoneNumber,
    role: foundUser.role,
    profile: foundUser.profile,
  };

  res
    .status(200)
    .cookie("token", token, {
      maxAge: 1 * 24 * 60 * 60 * 1000,
      httpsOnly: true,
      sameSite: "strict",
    } as never)
    .json({
      message: `Welcome back ${user.fullname}`,
      user,
      success: true,
    });
};

import { findAccountById, type AccountDocument } from "../services/account.service.js";
import { toSessionUser } from "../services/auth.service.js";
import type { SeekerDocument } from "../models/seeker.model.js";
import type { RecruiterDocument } from "../models/recruiter.model.js";
import type { Portal, ProfileView } from "@jobportal/shared";

export const logout = async (_req: Request, res: Response): Promise<void> => {
  res.status(200).cookie("token", "", { maxAge: 0 }).json({
    message: "Logged out successfully.",
    success: true,
  });
};

function toProfileView(portal: Portal, account: AccountDocument): ProfileView {
  const seeker = portal === "seeker" ? (account as SeekerDocument) : null;
  const recruiter = portal === "recruiter" ? (account as RecruiterDocument) : null;
  return {
    user: toSessionUser(portal, account as any),
    phone: account.phone ?? null,
    seeker: seeker && {
      headline: seeker.profile!.headline ?? null,
      bio: seeker.profile!.bio ?? null,
      skills: seeker.profile!.skills ?? [],
      experienceYears: seeker.profile!.experienceYears ?? null,
      location: seeker.profile!.location ?? null,
      resumeUrl: seeker.resume!.storageKey ?? null,
      resumeName: seeker.resume!.originalName ?? null,
    },
    recruiter: recruiter && { designation: recruiter.designation ?? null },
  };
}

export const getProfile = async (req: Request, res: Response): Promise<void> => {
  const { portal, id } = req.auth!;
  const account = await findAccountById(portal, id);
  if (!account) throw AppError.unauthorized("SESSION_INVALID", "Sign in to continue.");
  res.status(200).json({ success: true, profile: toProfileView(portal, account) });
};

export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  const { fullname, phoneNumber, bio, skills } = req.body;

  const { portal, id } = req.auth!;
  const account = await findAccountById(portal, id);
  if (!account) {
    throw AppError.unauthorized("SESSION_INVALID", "Sign in to continue.");
  }

  if (fullname) account.fullName = fullname;
  if (phoneNumber) account.phone = String(phoneNumber);

  if (portal === "seeker") {
    const seeker = account as SeekerDocument;
    if (bio) seeker.profile!.bio = bio;
    if (skills) {
      seeker.profile!.skills = String(skills)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }

    const file = req.file as Express.Multer.File | undefined;
    if (file) {
      const upload = await getCloudinary().uploader.upload(getDataUri(file).content as string);
      seeker.resume!.storageKey = upload.secure_url;
      seeker.resume!.originalName = file.originalname;
      seeker.resume!.mimeType = file.mimetype;
      seeker.resume!.sizeBytes = file.size;
      seeker.resume!.uploadedAt = new Date();
    }
  }

  await account.save();

  res.status(200).json({
    success: true,
    message: "Profile updated successfully.",
    profile: toProfileView(portal, account),
  });
};
