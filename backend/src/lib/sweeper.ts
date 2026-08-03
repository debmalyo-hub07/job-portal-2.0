import type { Portal } from "@jobportal/shared";
import { env } from "../config/env.js";
import { logger } from "./logger.js";
import { accountModel } from "../services/account.service.js";
import { OtpCode } from "../models/otpCode.model.js";
import { OtpBudget } from "../models/otpBudget.model.js";
import { RefreshToken } from "../models/refreshToken.model.js";

const PORTALS: readonly Portal[] = ["seeker", "recruiter"];
const BATCH = 500;

/**
 * Deletes accounts that registered and never confirmed their email.
 *
 * The reason is not tidiness. An unverified registration holds the unique index
 * on that email address, so anyone can permanently deny an address to its real
 * owner by registering it first and walking away — for free, with no
 * verification, at whatever rate the registration limiter allows. Expiring the
 * squat is the only thing that gives the address back.
 *
 * Returns per-portal counts so the caller can log something meaningful.
 */
export async function sweepUnverifiedAccounts(): Promise<Record<Portal, number>> {
  const cutoff = new Date(Date.now() - env().UNVERIFIED_ACCOUNT_TTL_HOURS * 3_600_000);
  const deleted: Record<Portal, number> = { seeker: 0, recruiter: 0 };

  for (const portal of PORTALS) {
    // Batched rather than one unbounded deleteMany: the first run after a long
    // outage could match a very large set, and a single delete of that size
    // holds locks and blows out the oplog. Loop until a short batch comes back.
    for (;;) {
      const doomed = await accountModel(portal)
        .find({
          emailVerifiedAt: null,
          // THE line. Migrated accounts are unverified by design and carry a
          // createdAt from the inherited system, so they match every other
          // clause here. Remove this and the first tick after the migration
          // deletes the entire userbase. `sweeper.test.ts` guards it.
          migratedFromLegacyAt: null,
          createdAt: { $lt: cutoff },
        })
        .select({ _id: 1 })
        .limit(BATCH)
        .lean();

      if (doomed.length === 0) break;

      const ids = doomed.map((doc) => doc._id);

      // Children first. If this half succeeds and the next half fails, the
      // leftovers are an account with no codes — harmless, and the next tick
      // finishes the job. The other order leaves rows pointing at an account
      // that no longer exists, which is the state every "who owns this?" query
      // in Phase 1C would have to defend against.
      await Promise.all([
        OtpCode.deleteMany({ subjectId: { $in: ids }, subjectType: portal }),
        OtpBudget.deleteMany({ subjectId: { $in: ids }, subjectType: portal }),
        // An unverified account cannot hold a session today. This is here so
        // that stays true if some future flow issues one before verification.
        RefreshToken.deleteMany({ subjectId: { $in: ids }, subjectType: portal }),
      ]);

      const result = await accountModel(portal).deleteMany({ _id: { $in: ids } });
      deleted[portal] += result.deletedCount ?? 0;

      if (doomed.length < BATCH) break;
    }
  }

  return deleted;
}

/**
 * Starts the sweeper on an interval and returns a stop function.
 *
 * Called from `server.ts`, never from `buildApp()`. A timer created inside
 * `buildApp()` would be created once per test file that mounts the app, keep
 * the Vitest worker alive after the suite finished, and run deletes against a
 * database the next test is still using.
 *
 * Two instances sweeping concurrently is fine: the query is a filter over
 * immutable-by-then rows and the deletes are idempotent. No lock needed.
 */
export function startSweeper(): () => void {
  const period = env().SWEEP_INTERVAL_MINUTES * 60_000;

  const tick = (): void => {
    void sweepUnverifiedAccounts()
      .then((deleted) => {
        if (deleted.seeker + deleted.recruiter > 0) {
          logger.info({ deleted }, "swept unverified accounts");
        }
      })
      .catch((error: unknown) => {
        // Never let a sweep failure take the process down. It is best-effort
        // maintenance; the next tick tries again.
        logger.error({ err: error }, "unverified-account sweep failed");
      });
  };

  const timer = setInterval(tick, period);
  // Do not hold the event loop open on shutdown.
  timer.unref();
  return () => clearInterval(timer);
}
