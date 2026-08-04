import type { Request, Response } from "express";
import type { HydratedDocument } from "mongoose";
import getDataUri from "../utils/datauri.js";
import { getCloudinary } from "../utils/cloudinary.js";
import { AppError } from "../lib/AppError.js";
import { findAccountById, type AccountDocument } from "../services/account.service.js";
import { toSessionUser } from "../services/auth.service.js";
import type { SeekerDocument } from "../models/seeker.model.js";
import type { RecruiterDocument } from "../models/recruiter.model.js";
import type { Portal, ProfileView } from "@jobportal/shared";

function toProfileView(
  portal: Portal,
  account: HydratedDocument<AccountDocument>,
): ProfileView {
  const seeker = portal === "seeker" ? (account as HydratedDocument<SeekerDocument>) : null;
  const recruiter = portal === "recruiter" ? (account as HydratedDocument<RecruiterDocument>) : null;
  return {
    user: toSessionUser(portal, account),
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
