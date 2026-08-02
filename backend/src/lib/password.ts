import { hash, verify, Algorithm } from "@node-rs/argon2";
import bcrypt from "bcryptjs";

/**
 * OWASP Password Storage baseline for Argon2id: m=19 MiB, t=2, p=1.
 *
 * These are a floor, not a target. Benchmark on the deploy host and raise
 * memoryCost until a hash costs 100-300 ms; @node-rs/argon2 is fast enough that
 * 64 MiB is usually affordable. Do not raise them past what your smallest
 * instance can serve concurrently — Argon2 is memory-hard by design, so N
 * simultaneous logins want N × memoryCost resident, and an under-provisioned
 * box turns its own password hashing into a denial of service.
 */
const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456, // KiB
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * A real Argon2id hash of a value nobody knows, used to burn equivalent CPU
 * when there is no account or no password to check. Computed once at module
 * load: the point is to spend the same time on the absent branch as the present
 * one, and a fresh hash per request would spend twice that.
 */
let dummyHashPromise: Promise<string> | undefined;
function dummyHash(): Promise<string> {
  dummyHashPromise ??= hash("dummy-password-for-timing-equalisation", ARGON2_OPTIONS);
  return dummyHashPromise;
}

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTIONS);
}

/**
 * Verifies `plain` against `stored`, which may be Argon2id (new) or bcrypt
 * (inherited). Pass `null` for an account with no password and it still does
 * the work before returning false — absence of a password must not be faster
 * than a wrong one, or it becomes an oracle for "this account is Google-only".
 *
 * Note the argument order: @node-rs/argon2's `verify(hash, password)` takes the
 * hash FIRST, the opposite of `bcrypt.compare(password, hash)`. Getting this
 * backwards fails every login with no error message worth reading.
 */
export async function verifyPassword(plain: string, stored: string | null): Promise<boolean> {
  if (stored === null) {
    await verify(await dummyHash(), plain).catch(() => false);
    return false;
  }
  if (stored.startsWith("$2a$") || stored.startsWith("$2b$") || stored.startsWith("$2y$")) {
    return bcrypt.compare(plain, stored);
  }
  // A malformed hash throws rather than returning false; treat it as a failure
  // but do not leak the distinction to the caller.
  return verify(stored, plain).catch(() => false);
}

/** True when the stored hash is bcrypt and should be upgraded on next login. */
export function needsRehash(stored: string | null): boolean {
  return stored !== null && stored.startsWith("$2");
}

/** Burns a verify's worth of CPU when no account exists at all. */
export async function burnPasswordTime(plain: string): Promise<void> {
  await verify(await dummyHash(), plain).catch(() => false);
}
