import type { Request, Response } from "express";
import type { HydratedDocument } from "mongoose";
import { completeProfileBodySchema, isMinor, profileUpdateBodySchema } from "@jobportal/shared";
import { parseBody } from "../lib/validate.js";
import { AppError } from "../lib/AppError.js";
import { findAccountById, type AccountDocument } from "../services/account.service.js";
import { toSessionUser } from "../services/auth.service.js";
import { signedResumeUrl, uploadResume } from "../services/resume.service.js";
import type { SeekerDocument } from "../models/seeker.model.js";
import type { RecruiterDocument } from "../models/recruiter.model.js";
import type { Gender, Portal, ProfileView } from "@jobportal/shared";

/** The recruiter age rule, one implementation for both write paths. */
function assertRecruiterAdult(portal: Portal, dob: Date): void {
  if (portal === "recruiter" && isMinor(dob)) {
    throw AppError.badRequest(
      "RECRUITER_AGE_MINIMUM",
      "Recruiters must be 18 or over. A candidate account can be created with a guardian's OK instead.",
    );
  }
}

function toProfileView(
  portal: Portal,
  account: HydratedDocument<AccountDocument>,
): ProfileView {
  const seeker = portal === "seeker" ? (account as HydratedDocument<SeekerDocument>) : null;
  const recruiter = portal === "recruiter" ? (account as HydratedDocument<RecruiterDocument>) : null;
  return {
    user: toSessionUser(portal, account),
    phone: account.phone ?? null,
    // Date-only, formatted in UTC. `toISOString().slice(0, 10)` rather than any
    // locale formatter: a local formatter shifts the day in every negative-offset
    // zone, which renders a different birthday.
    dob: account.dob ? account.dob.toISOString().slice(0, 10) : null,
    gender: (account.gender as Gender | null) ?? null,
    // Derived here, on the server's clock — the completion step reads this pair
    // to decide whether the guardian stage renders (minor, no consent yet).
    minor: isMinor(account.dob ?? null),
    guardianEmail: account.guardianConsent?.email ?? null,
    seeker: seeker && {
      headline: seeker.profile!.headline ?? null,
      bio: seeker.profile!.bio ?? null,
      skills: seeker.profile!.skills ?? [],
      experienceYears: seeker.profile!.experienceYears ?? null,
      location: seeker.profile!.location ?? null,
      // City and country only — `updatedAt` stays server-side.
      geoLocation: seeker.geoLocation
        ? { city: seeker.geoLocation.city, country: seeker.geoLocation.country }
        : null,
      salaryMin: seeker.profile!.salaryMin ?? null,
      salaryMax: seeker.profile!.salaryMax ?? null,
      openToRemote: seeker.profile!.openToRemote ?? null,
      resumeUrl: signedResumeUrl(seeker.resume!.storageKey),
      resumeName: seeker.resume!.originalName ?? null,
    },
    recruiter: recruiter && { designation: recruiter.designation ?? null },
    admin: portal === "admin" ? {} : null,
  };
}

export const getProfile = async (req: Request, res: Response): Promise<void> => {
  const { portal, id } = req.auth!;
  // `withSecret` selects `+passwordHash` so `toSessionUser` can answer
  // `hasPassword` — the projection is a boolean, never the hash itself.
  const account = await findAccountById(portal, id, { withSecret: true });
  if (!account) throw AppError.unauthorized("SESSION_INVALID", "Sign in to continue.");
  res.status(200).json({ success: true, profile: toProfileView(portal, account) });
};

/**
 * Writes the identity block and nothing else.
 *
 * Deliberately NOT behind `requireProfileComplete` — it is the route that clears
 * the gate. Validation runs before any assignment, so a refused phone number
 * cannot leave a stored `dob` behind and open the gate on a rejected body.
 */
export const completeProfile = async (req: Request, res: Response): Promise<void> => {
  const body = parseBody(completeProfileBodySchema, req.body);
  const { portal, id } = req.auth!;
  const account = await findAccountById(portal, id, { withSecret: true });
  if (!account) throw AppError.unauthorized("SESSION_INVALID", "Sign in to continue.");

  // The `T00:00:00Z` suffix makes the UTC-midnight normalisation explicit.
  // Without it a date-only ISO string still parses as UTC, but the suffix is what
  // stops a later reader "fixing" this into a local parse and moving every stored
  // birthday by a day.
  const dob = new Date(`${body.dob}T00:00:00Z`);
  // Minors are seekers only (Project C's locked rule): a 16-17 recruiter DOB is
  // refused before anything is written, so the refused body leaves no stored DOB
  // behind — the same guarantee the schema ordering gives the other validations.
  assertRecruiterAdult(portal, dob);
  account.dob = dob;
  if (body.phone !== undefined) account.phone = body.phone;
  if (body.gender !== undefined) account.gender = body.gender;
  await account.save();

  res.status(200).json({ success: true, profile: toProfileView(portal, account) });
};

export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  const body = parseBody(profileUpdateBodySchema, req.body);

  const { portal, id } = req.auth!;
  const account = await findAccountById(portal, id, { withSecret: true });
  if (!account) {
    throw AppError.unauthorized("SESSION_INVALID", "Sign in to continue.");
  }

  if (body.fullname !== undefined) account.fullName = body.fullname;
  if (body.phone !== undefined) account.phone = body.phone;
  // The correction path for the identity block. `dob` is validated by the same
  // schema the completion step uses, so an under-age value is a 400 here rather
  // than a silent way back past the gate.
  if (body.dob !== undefined) {
    const dob = new Date(`${body.dob}T00:00:00Z`);
    assertRecruiterAdult(portal, dob);
    account.dob = dob;
  }
  if (body.gender !== undefined) account.gender = body.gender;

  if (portal === "seeker") {
    const seeker = account as SeekerDocument;
    if (body.bio !== undefined) seeker.profile!.bio = body.bio;
    // Already split, trimmed and de-blanked by the schema's transform.
    if (body.skills !== undefined) seeker.profile!.skills = body.skills;
    // Phase 5: both are read by `toFitSeekerInput` and were returned by
    // `toProfileView` above from 4A.3 onward with no writer anywhere, so the
    // pipeline's experience and location factors scored `null` for every seeker.
    if (body.experienceYears !== undefined) seeker.profile!.experienceYears = body.experienceYears;
    if (body.location !== undefined) seeker.profile!.location = body.location;
    if (body.salaryMin !== undefined) seeker.profile!.salaryMin = body.salaryMin;
    if (body.salaryMax !== undefined) seeker.profile!.salaryMax = body.salaryMax;
    if (body.openToRemote !== undefined) seeker.profile!.openToRemote = body.openToRemote;
    // P2: the consented device location — top-level (device observation), not
    // the self-reported `profile.location` above. Absent means "leave alone".
    if (body.geoLocation !== undefined) {
      seeker.geoLocation = { ...body.geoLocation, updatedAt: new Date() };
    }

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

  if (portal === "recruiter") {
    const recruiter = account as RecruiterDocument;
    // Rendered publicly as the job byline since 2B, and until now unwritable by
    // any schema in the repository — recruiters saw it on their own postings with
    // no way to set it.
    if (body.designation !== undefined) recruiter.designation = body.designation;
  }

  await account.save();

  res.status(200).json({
    success: true,
    message: "Profile updated successfully.",
    profile: toProfileView(portal, account),
  });
};
