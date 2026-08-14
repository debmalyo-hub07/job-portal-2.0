import { createHash, timingSafeEqual } from "node:crypto";

import type { AdminCreateBody } from "@jobportal/shared";

import { env } from "../config/env.js";
import { AppError } from "../lib/AppError.js";
import { Admin } from "../models/admin.model.js";
import { issuePasswordSetupCode } from "./auth.service.js";

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
    throw AppError.conflict("EMAIL_TAKEN", "An admin account already exists for this email address.");
  }

  try {
    const admin = await Admin.create({
      email,
      fullName: input.fullName,
      passwordHash: null,
      emailVerifiedAt: new Date(),
      status: "active",
    });
    await issuePasswordSetupCode("admin", admin);
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      throw AppError.conflict("EMAIL_TAKEN", "An admin account already exists for this email address.");
    }
    throw error;
  }
}
