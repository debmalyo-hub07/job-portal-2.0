import mongoose from "mongoose";
import { Admin } from "../models/admin.model.js";
import { issuePasswordSetupCode } from "../services/auth.service.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

export interface SeedAdminInput {
  email: string;
  fullName: string;
  force?: boolean;
}

/**
 * Creates the first admin.
 *
 * No password is accepted as an argument — a CLI argument lands in shell
 * history, process listings and CI logs. The account is created with
 * `passwordHash: null` and a set-password code is mailed, which is the same
 * path forgot-password already uses.
 *
 * Created pre-verified: there is no registration flow to confirm an admin
 * mailbox through, and the admin router mounts no Google routes, so nothing
 * else would ever set `emailVerifiedAt`. An unverified admin would also be
 * swept by the unverified-account sweeper.
 *
 * Refuses when any admin already exists unless forced, so a stray re-run during
 * deployment cannot quietly mint a second authority.
 */
export async function seedAdmin(input: SeedAdminInput): Promise<{ created: boolean }> {
  // Normalised the same way the schema does, or a capitalised re-run creates a
  // second admin that the unique index would then reject confusingly.
  const email = input.email.trim().toLowerCase();

  const existing = await Admin.findOne({ email });
  if (existing) {
    logger.info({ email }, "admin already exists; nothing to do");
    return { created: false };
  }

  const count = await Admin.countDocuments();
  if (count > 0 && !input.force) {
    throw new Error(`An admin already exists (${count}). Re-run with --force to create another.`);
  }

  const admin = await Admin.create({
    email,
    fullName: input.fullName,
    passwordHash: null,
    emailVerifiedAt: new Date(),
    status: "active",
  });

  await issuePasswordSetupCode("admin", admin);
  // Never the code itself — the same rule as every other OTP path.
  logger.info({ email }, "admin created; set-password code mailed");
  return { created: true };
}

// Run directly (`npm run seed:admin`), not when imported by a test.
const invokedDirectly = /seed-admin\.(ts|js)$/.test(process.argv[1] ?? "");
if (invokedDirectly) {
  const arg = (flag: string): string | undefined => {
    const i = process.argv.indexOf(flag);
    return i === -1 ? undefined : process.argv[i + 1];
  };
  const email = arg("--email");
  const fullName = arg("--name");
  if (!email || !fullName) {
    console.error('Usage: npm run seed:admin -- --email <address> --name "<full name>" [--force]');
    process.exit(1);
  }
  await mongoose.connect(env().MONGO_URI);
  try {
    const result = await seedAdmin({
      email,
      fullName,
      force: process.argv.includes("--force"),
    });
    console.log(
      result.created
        ? "Admin created. Check the mailbox for a set-password code, then sign in at /admin/login."
        : "Admin already existed; nothing to do.",
    );
  } finally {
    await mongoose.disconnect();
  }
}
