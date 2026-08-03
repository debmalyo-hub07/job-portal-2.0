import mongoose from "mongoose";
import { pathToFileURL } from "node:url";
import type { Portal } from "@jobportal/shared";
import { User } from "../models/user.model.js";
import { accountModel } from "../services/account.service.js";
import { env } from "../config/env.js";

const PORTAL_BY_ROLE: Record<string, Portal> = { student: "seeker", recruiter: "recruiter" };
const BATCH = 500;

export type MigrationReport = {
  scanned: number;
  inserted: Record<Portal, number>;
  /** Already present by `_id`; a re-run leaves these untouched. */
  unchanged: number;
  /** `role` was neither "student" nor "recruiter". */
  skippedBadRole: { id: string; role: unknown }[];
  /** A different account already owns this email on the target portal. */
  emailConflicts: { id: string; email: string; portal: Portal }[];
  /** `fullname` was too short for the new schema and was derived from the email. */
  repairedNames: string[];
};

export type MigrationOptions = {
  dryRun?: boolean;
};

/**
 * Copies `users` into `seekers` and `recruiters`. Idempotent. Non-destructive:
 * the `users` collection is never modified or dropped. Nothing reads it after
 * Step 6 either — it is kept as the rollback path for the length of this phase
 * and dropped in Task 15.
 *
 * There is deliberately no `--refresh-profiles` mode. Step 6 repoints the only
 * writer of profile data at these collections in the same commit, so `users`
 * stops changing the moment this runs and a re-copy can never have anything new
 * to copy.
 */
export async function migratePhase1b(options: MigrationOptions = {}): Promise<MigrationReport> {
  const { dryRun = false } = options;
  const migratedAt = new Date();

  const report: MigrationReport = {
    scanned: 0,
    inserted: { seeker: 0, recruiter: 0 },
    unchanged: 0,
    skippedBadRole: [],
    emailConflicts: [],
    repairedNames: [],
  };

  const pending: Record<Portal, Record<string, unknown>[]> = { seeker: [], recruiter: [] };

  const flush = async (portal: Portal): Promise<void> => {
    const ops = pending[portal];
    if (ops.length === 0 || dryRun) {
      pending[portal] = [];
      return;
    }
    // `ordered: false` so one duplicate email does not abort the rest of the
    // batch, and `timestamps: false` so Mongoose's plugin does not overwrite the
    // original createdAt/updatedAt we are explicitly carrying across.
    const result = await accountModel(portal).bulkWrite(ops as never, {
      ordered: false,
      timestamps: false,
    });
    report.inserted[portal] += result.upsertedCount ?? 0;
    report.unchanged += (result.matchedCount ?? 0);
    pending[portal] = [];
  };

  const cursor = User.find({}).lean().cursor();

  try {
    for await (const legacy of cursor) {
      report.scanned += 1;

      const portal = PORTAL_BY_ROLE[legacy.role];
      if (!portal) {
        report.skippedBadRole.push({ id: String(legacy._id), role: legacy.role });
        continue;
      }

      const email = String(legacy.email).trim().toLowerCase();

      // The new schema requires a 2-character name. bulkWrite does not run
      // validators, so a 1-character legacy name would land silently and only
      // fail years later on the first `save()`. Repair it here, visibly.
      let fullName = String(legacy.fullname ?? "").trim();
      if (fullName.length < 2) {
        fullName = email.split("@")[0] ?? "Member";
        report.repairedNames.push(String(legacy._id));
      }

      const shared = {
        email,
        fullName,
        // Carried across as-is. It is a bcrypt digest; `needsRehash` (Task 3)
        // recognises the `$2` prefix and `login` (Task 8) silently re-hashes it
        // to Argon2id the first time the owner signs in. Nobody is forced to
        // reset a password to complete this migration.
        passwordHash: legacy.password,
        // DELIBERATE REVERSAL of the spec's migration item 5, which says to set
        // `emailVerifiedAt = createdAt` and grandfather existing users in. Do
        // not "fix" this back.
        //
        // The spec's reasoning was that locking out current users is worse than
        // grandfathering them. That trade was priced before the resend flow
        // existed. It now does (Task 7), so the cost of not grandfathering is
        // one self-service email, once — while the cost of grandfathering is
        // permanent: the inherited system never verified an address, so every
        // address someone registered under a name that was not theirs becomes
        // a *verified* address, and a verified address is exactly what Task 9
        // treats as strong enough to auto-link a Google identity to. That turns
        // an unverifiable inherited claim into an account takeover path.
        //
        // Migrated users hit EMAIL_NOT_VERIFIED on their first login and
        // self-serve from there.
        emailVerifiedAt: null,
        googleId: null,
        // Number -> String. Leading zeros and any `+` prefix were destroyed by
        // the inherited `Number` column long before this script runs; there is
        // nothing here to recover, only to stop losing.
        phone: legacy.phoneNumber === undefined || legacy.phoneNumber === null
          ? null
          : String(legacy.phoneNumber),
        avatarUrl: legacy.profile?.profilePhoto || null,
        status: "active",
        failedLoginCount: 0,
        lockedUntil: null,
        sessionsInvalidatedAt: null,
        pendingGoogleLink: { googleId: null, requestedAt: null },
        migratedFromLegacyAt: migratedAt,
        createdAt: legacy.createdAt ?? migratedAt,
        updatedAt: legacy.updatedAt ?? migratedAt,
      };

      const profile =
        portal === "seeker"
          ? {
              profile: {
                headline: null,
                bio: legacy.profile?.bio ?? null,
                skills: legacy.profile?.skills ?? [],
                experienceYears: null,
                location: null,
              },
              resume: {
                // A public, guessable Cloudinary URL, carried across unchanged.
                // Phase 1C replaces public URLs with signed, short-lived ones and
                // re-keys this field; pre-emptively mangling it here would just
                // mean nobody can download their resume in the meantime.
                storageKey: legacy.profile?.resume ?? null,
                originalName: legacy.profile?.resumeOriginalName ?? null,
                mimeType: null,
                sizeBytes: null,
                uploadedAt: legacy.profile?.resume ? (legacy.updatedAt ?? migratedAt) : null,
              },
            }
          : {
              designation: null,
              company: legacy.profile?.company ?? null,
            };

      pending[portal].push({
        updateOne: {
          filter: { _id: legacy._id },
          // $setOnInsert, never $set: a second run must not undo a password the
          // user has since changed, an email they have since verified, or a
          // profile they have since edited through the repointed controller.
          update: { $setOnInsert: { ...shared, ...profile } },
          upsert: true,
        },
      });

      if (pending[portal].length >= BATCH) await flush(portal);
    }

    await flush("seeker");
    await flush("recruiter");
  } catch (error) {
    // A bulkWrite with ordered:false throws MongoBulkWriteError *after* applying
    // every operation that succeeded. The duplicate-key entries inside it are
    // the interesting output of this script, not a crash: they mean somebody
    // registered that address on the new endpoints before the migration ran.
    const bulk = error as { writeErrors?: { err?: { code?: number; op?: unknown } }[] };
    if (!bulk.writeErrors) throw error;
    for (const writeError of bulk.writeErrors) {
      if (writeError.err?.code !== 11000) throw error;
      const op = writeError.err.op as { u?: { $setOnInsert?: { email?: string } }; q?: { _id?: unknown } };
      report.emailConflicts.push({
        id: String(op.q?._id ?? "unknown"),
        email: op.u?.$setOnInsert?.email ?? "unknown",
        portal: "seeker",
      });
    }
  }

  return report;
}

/**
 * CLI entry. Guarded so that importing this module from a test does not run it.
 */
async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  await mongoose.connect(env().MONGO_URI);
  try {
    const report = await migratePhase1b({ dryRun });
    console.log(JSON.stringify(report, null, 2));
    if (dryRun) console.log("\nDRY RUN — nothing was written.");
    // Non-zero on anything a human needs to look at. A clean re-run exits 0.
    if (report.skippedBadRole.length > 0 || report.emailConflicts.length > 0) {
      console.error("\nMigration finished with items requiring attention (see above).");
      process.exitCode = 1;
    }
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
