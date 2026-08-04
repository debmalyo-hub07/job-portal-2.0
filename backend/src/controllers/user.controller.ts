import type { Request, Response } from "express";
import type { HydratedDocument } from "mongoose";
import { profileUpdateBodySchema } from "@jobportal/shared";
import { parseBody } from "../lib/validate.js";
import { AppError } from "../lib/AppError.js";
import { findAccountById, type AccountDocument } from "../services/account.service.js";
import { toSessionUser } from "../services/auth.service.js";
import { signedResumeUrl, uploadResume } from "../services/resume.service.js";
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
      resumeUrl: signedResumeUrl(seeker.resume!.storageKey),
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
  const body = parseBody(profileUpdateBodySchema, req.body);

  const { portal, id } = req.auth!;
  const account = await findAccountById(portal, id);
  if (!account) {
    throw AppError.unauthorized("SESSION_INVALID", "Sign in to continue.");
  }

  if (body.fullname !== undefined) account.fullName = body.fullname;
  if (body.phoneNumber !== undefined) account.phone = body.phoneNumber;

  if (portal === "seeker") {
    const seeker = account as SeekerDocument;
    if (body.bio !== undefined) seeker.profile!.bio = body.bio;
    // Already split, trimmed and de-blanked by the schema's transform.
    if (body.skills !== undefined) seeker.profile!.skills = body.skills;

    const file = req.file as Express.Multer.File | undefined;
    if (file) {
      const { storageKey } = await uploadResume(file);
      seeker.resume!.storageKey = storageKey;
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
