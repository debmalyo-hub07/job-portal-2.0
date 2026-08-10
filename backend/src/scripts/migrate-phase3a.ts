import mongoose from "mongoose";
import { Recruiter } from "../models/recruiter.model.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

/**
 * One-shot, idempotent, run once per database.
 *
 * Task 2 made recruiters register as `pending`. Recruiters that existed BEFORE
 * that change were legitimate — they were created when registration alone
 * conferred access — so gating them retroactively would lock real accounts out
 * of their own companies and jobs.
 *
 * Only VERIFIED ones are grandfathered. An unverified pre-existing row is
 * indistinguishable from an abandoned signup, and handing it an approved
 * account would turn every stale registration into a live recruiter.
 *
 * Suspended rows are untouched: the filter matches `status: "pending"` only, so
 * a moderation decision can never be undone by running a migration.
 *
 * Also drops the legacy `users` collection, which Phase 1C's migration never
 * ran against on every database.
 */
export async function migratePhase3a(): Promise<{
  grandfathered: number;
  droppedUsers: boolean;
}> {
  const result = await Recruiter.updateMany(
    // `mongoose.trusted` is required: sanitizeFilter is global, so a bare
    // { $ne: null } would be compared as a literal value rather than executed.
    { status: "pending", emailVerifiedAt: mongoose.trusted({ $ne: null }) },
    { $set: { status: "active" } },
  );

  const db = mongoose.connection.db;
  if (!db) throw new Error("no database connection");
  const exists = (await db.listCollections({ name: "users" }).toArray()).length > 0;
  let droppedUsers = false;
  if (exists) {
    await db.dropCollection("users");
    droppedUsers = true;
  }

  logger.info(
    { grandfathered: result.modifiedCount, droppedUsers },
    "phase 3a migration complete",
  );
  return { grandfathered: result.modifiedCount, droppedUsers };
}

// Run directly (`npm run migrate:phase3a`), not when imported by a test.
const invokedDirectly = /migrate-phase3a\.(ts|js)$/.test(process.argv[1] ?? "");
if (invokedDirectly) {
  // See seed-admin.ts: only server.ts loaded dotenv, so a direct run read no
  // .env and env() failed naming every required variable. Inside the guard, so
  // it never reaches the test that imports this module.
  await import("dotenv/config");
  await mongoose.connect(env().MONGO_URI);
  try {
    const r = await migratePhase3a();
    console.log(
      `grandfathered ${r.grandfathered} recruiter(s); users collection ${r.droppedUsers ? "dropped" : "absent"}`,
    );
  } finally {
    await mongoose.disconnect();
  }
}
