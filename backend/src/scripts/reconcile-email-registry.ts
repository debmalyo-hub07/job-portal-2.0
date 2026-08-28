import mongoose, { type Types } from "mongoose";
import { PORTALS, type Portal } from "@jobportal/shared";
import { mongoDatabaseName, env } from "../config/env.js";
import { EmailRegistry } from "../models/emailRegistry.model.js";
import { accountModel } from "../services/account.service.js";
import { registryDisagreements } from "../services/emailRegistry.service.js";

export interface ReconcileResult {
  rowsRewritten: number;
  orphansRemoved: number;
  disagreementsRemaining: number;
}

const BATCH = 500;

/**
 * Applies the reconciliation rule exactly: *per subject, exactly one registry
 * row, matching that account's email.*
 *
 * Two crash shapes converge here. A crash between the registry insert and the
 * account create leaves an orphan — a row whose subjectId resolves to no
 * account in its portal. A crash mid-email-change leaves a stale row — one
 * whose subject exists but under a different address. Accounts are the
 * authority: every account's row is rewritten from the account itself, then
 * every row left pointing at nothing (or at the wrong address) is deleted.
 *
 * A cross-subject collision during the rewrite — two accounts claiming one
 * address — fails loudly on the unique index, exactly like the backfill. This
 * script doubles as the pre-flight scan before the unique index is trusted:
 * run it after the backfill and require zero disagreements remaining.
 */
export async function reconcileEmailRegistry(): Promise<ReconcileResult> {
  let rowsRewritten = 0;

  // Pass 1: every account gets exactly one row, naming its own email.
  // deleteMany-then-create per subject, not an updateOne: an account caught
  // mid-email-change can hold two rows (old address and new), and updating
  // either one onto the other's email trips the unique index on our own data.
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
        const current = await EmailRegistry.find({ subjectId: account._id }).lean();
        const correct = current.length === 1 && current[0]!.email === account.email;
        if (correct) continue;
        await EmailRegistry.deleteMany({ subjectId: account._id });
        await EmailRegistry.create({ email: account.email, portal, subjectId: account._id });
        rowsRewritten += 1;
      }

      if (batch.length < BATCH) break;
      cursor = batch[batch.length - 1]!._id;
    }
  }

  // Pass 2: orphan rows — no account behind them, in the row's own portal.
  // Stale rows were already handled in pass 1 (the subject's rewrite deleted
  // every row that did not name the account's actual email).
  let orphansRemoved = 0;
  let registryCursor: Types.ObjectId | null = null;
  for (;;) {
    const query = EmailRegistry.find({})
      .select({ _id: 1, portal: 1, subjectId: 1 })
      .sort({ _id: 1 })
      .limit(BATCH);
    if (registryCursor) query.where({ _id: mongoose.trusted({ $gt: registryCursor }) });
    const batch = await query.lean();
    if (batch.length === 0) break;

    for (const row of batch) {
      const account = await accountModel(row.portal as Portal)
        .findOne({ _id: row.subjectId })
        .select({ _id: 1 })
        .lean();
      if (!account) {
        await EmailRegistry.deleteOne({ _id: row._id });
        orphansRemoved += 1;
      }
    }

    if (batch.length < BATCH) break;
    registryCursor = batch[batch.length - 1]!._id;
  }

  const disagreementsRemaining = (await registryDisagreements()).length;
  return { rowsRewritten, orphansRemoved, disagreementsRemaining };
}

// Run directly (`npm run registry:reconcile`), not when imported by a test.
const invokedDirectly = /reconcile-email-registry\.(ts|js)$/.test(process.argv[1] ?? "");
if (invokedDirectly) {
  await import("dotenv/config");
  const config = env();
  const database = mongoDatabaseName(config.MONGO_URI) ?? "test";
  const confirmationIndex = process.argv.indexOf("--confirm-database");
  const confirmedDatabase =
    confirmationIndex === -1 ? undefined : process.argv[confirmationIndex + 1];
  if (confirmedDatabase !== database) {
    console.error(
      `Refusing to reconcile. Re-run with --confirm-database ${database} after verifying that database is the intended target.`,
    );
    process.exit(1);
  }

  await mongoose.connect(config.MONGO_URI);
  try {
    await EmailRegistry.init();
    const result = await reconcileEmailRegistry();
    console.log(
      `registry reconciled: ${result.rowsRewritten} row(s) rewritten, ` +
        `${result.orphansRemoved} orphan(s) removed, ` +
        `${result.disagreementsRemaining} disagreement(s) remaining`,
    );
    if (result.disagreementsRemaining > 0) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
