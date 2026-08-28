import mongoose, { type Types } from "mongoose";
import { PORTALS, type Portal } from "@jobportal/shared";
import { mongoDatabaseName, env } from "../config/env.js";
import { EmailRegistry } from "../models/emailRegistry.model.js";
import { accountModel } from "../services/account.service.js";
import { isDuplicateKeyError } from "../services/emailRegistry.service.js";

export interface BackfillResult {
  inserted: Record<Portal, number>;
  total: number;
}

const BATCH = 500;

/**
 * Writes one registry row per existing account, across all three collections.
 *
 * Run BEFORE enforcement is trusted: the registry is only a guarantee once
 * populated, and an empty registry reads every existing address as free.
 *
 * The unique email index exists first — this script boots the model into an
 * already-created empty collection — so a collision during the backfill fails
 * loudly with E11000. That failure IS the re-verification of zero
 * cross-portal collisions, run at ship time rather than trusted from the
 * 2026-08-26 count.
 *
 * Re-runnable: an account that already has its correct row is skipped, so an
 * interrupted run resumes where it left off.
 */
export async function backfillEmailRegistry(): Promise<BackfillResult> {
  const inserted = Object.fromEntries(PORTALS.map((p) => [p, 0])) as Record<Portal, number>;

  for (const portal of PORTALS) {
    let cursor: Types.ObjectId | null = null;
    for (;;) {
      const query = accountModel(portal)
        .find({})
        .select({ _id: 1, email: 1 })
        .sort({ _id: 1 })
        .limit(BATCH);
      if (cursor) query.where({ _id: mongoose.trusted({ $gt: cursor }) });
      const batch = await query.lean();
      if (batch.length === 0) break;

      for (const account of batch) {
        const existing = await EmailRegistry.findOne({ subjectId: account._id }).lean();
        if (existing && existing.email === account.email) continue;
        if (existing) {
          // A subject with a row naming the wrong address: the account's email
          // is authoritative. Replace the row rather than skip it, or a crash
          // mid-email-change would leave the old address squatted forever.
          await EmailRegistry.deleteMany({ subjectId: account._id });
        }
        await EmailRegistry.create({ email: account.email, portal, subjectId: account._id });
        inserted[portal] += 1;
      }

      if (batch.length < BATCH) break;
      cursor = batch[batch.length - 1]!._id;
    }
  }

  return { inserted, total: Object.values(inserted).reduce((sum, n) => sum + n, 0) };
}

// Run directly (`npm run registry:backfill`), not when imported by a test.
const invokedDirectly = /backfill-email-registry\.(ts|js)$/.test(process.argv[1] ?? "");
if (invokedDirectly) {
  // Same bootstrap rule as the other scripts: dotenv only on a direct run, so
  // a test process never reads the developer's real .env.
  await import("dotenv/config");
  const config = env();
  const database = mongoDatabaseName(config.MONGO_URI) ?? "test";
  const confirmationIndex = process.argv.indexOf("--confirm-database");
  const confirmedDatabase =
    confirmationIndex === -1 ? undefined : process.argv[confirmationIndex + 1];
  if (confirmedDatabase !== database) {
    console.error(
      `Refusing to backfill. Re-run with --confirm-database ${database} after verifying that database is the intended target.`,
    );
    process.exit(1);
  }

  await mongoose.connect(config.MONGO_URI);
  try {
    // The unique index must exist before any insert, or the first duplicate
    // sails through unchecked. init() awaits index creation; autoIndex
    // otherwise races the first insert.
    await EmailRegistry.init();
    const result = await backfillEmailRegistry();
    console.log(
      `registry backfilled: ${result.total} row(s) written ` +
        `(${PORTALS.map((p) => `${p}: ${result.inserted[p]}`).join(", ")})`,
    );
  } catch (error) {
    // A loud E11000 here is the pre-flight finding a real collision, not a
    // crash: name the address and exit non-zero so the deployment gate holds.
    if (isDuplicateKeyError(error)) {
      const key = (error as { keyValue?: Record<string, unknown> }).keyValue?.email;
      console.error(
        `Collision: the address ${String(key)} is claimed by more than one account. ` +
          `Resolve it before enforcement can ship.`,
      );
      process.exitCode = 1;
    } else {
      throw error;
    }
  } finally {
    await mongoose.disconnect();
  }
}
