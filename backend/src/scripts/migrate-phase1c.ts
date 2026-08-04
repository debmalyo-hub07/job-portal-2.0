import mongoose from "mongoose";
import { env } from "../config/env.js";
import { Company } from "../models/company.model.js";

/**
 * Phase 1C teardown: the legacy `users` collection lost its model and its last
 * reader in 1B. This removes the data.
 */
export async function dropLegacyUsersCollection(): Promise<{ dropped: boolean }> {
  const db = mongoose.connection.db;
  if (!db) throw new Error("connect to Mongo before calling this");
  const exists = (await db.listCollections({ name: "users" }).toArray()).length > 0;
  if (!exists) return { dropped: false };
  await db.dropCollection("users");
  return { dropped: true };
}

/**
 * Company names became unique *per recruiter* in 1C. Dropping `unique: true`
 * from the field does not remove the `name_1` index Mongo already built, so on
 * any database that predates 1C the global constraint survives and a second
 * recruiter still cannot register a company that shares a name.
 */
export async function dropGlobalCompanyNameIndex(): Promise<{ dropped: boolean }> {
  const indexes = await Company.collection.indexes();
  if (!indexes.some((i) => i.name === "name_1")) return { dropped: false };
  await Company.collection.dropIndex("name_1");
  return { dropped: true };
}

export async function runPhase1cMigration(): Promise<void> {
  const users = await dropLegacyUsersCollection();
  console.log(users.dropped ? "dropped legacy users collection" : "no legacy users collection");

  const index = await dropGlobalCompanyNameIndex();
  console.log(index.dropped ? "dropped global company name_1 index" : "no global name_1 index");

  // Builds anything the schemas declare that this database is missing —
  // {userId, name} on companies, {job, applicant} on applications.
  await Company.syncIndexes();
}

// Run directly (`npm run migrate:phase1c`), not when imported by a test.
const invokedDirectly = /migrate-phase1c\.(ts|js)$/.test(process.argv[1] ?? "");
if (invokedDirectly) {
  await mongoose.connect(env().MONGO_URI);
  await runPhase1cMigration();
  await mongoose.disconnect();
}
