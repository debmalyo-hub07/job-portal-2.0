import { createHash, timingSafeEqual } from "node:crypto";

import type { AdminCreateBody } from "@jobportal/shared";

import { env } from "../config/env.js";
import { AppError } from "../lib/AppError.js";
import { Admin } from "../models/admin.model.js";
import { issuePasswordSetupCode } from "./auth.service.js";
import {
  EMAIL_TAKEN,
  isDuplicateKeyError,
  releaseEmail,
  reserveEmail,
} from "./emailRegistry.service.js";

function secretMatches(presented: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(presented), digest(env().ADMIN_PROVISIONING_SECRET));
}

export async function createAdmin(input: AdminCreateBody): Promise<void> {
  if (!secretMatches(input.provisioningKey)) {
    throw AppError.forbidden("ADMIN_PROVISIONING_DENIED", "The admin provisioning key is invalid.");
  }

  const email = input.email.trim().toLowerCase();
  const existing = await Admin.findOne({ email }).select("_id");
  if (existing) {
    throw EMAIL_TAKEN();
  }

  // Registry-first, like register(): the claim is cross-portal. An address
  // already held by a seeker or a recruiter cannot become an admin, which is
  // the 2026-08-27 one-address-one-account rule made real at this site.
  const subjectId = await reserveEmail("admin", email);

  try {
    const admin = await Admin.create({
      _id: subjectId,
      email,
      fullName: input.fullName,
      passwordHash: null,
      emailVerifiedAt: new Date(),
      status: "active",
    });
    await issuePasswordSetupCode("admin", admin);
  } catch (error) {
    // The invite was not minted: free the address before answering, so a
    // failed invitation cannot squat it.
    await releaseEmail(subjectId);
    if (isDuplicateKeyError(error)) {
      throw EMAIL_TAKEN();
    }
    throw error;
  }
}
