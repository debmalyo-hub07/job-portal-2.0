import { Schema } from "mongoose";

/**
 * NOTE ON QUERY PROJECTION — READ BEFORE QUERYING THESE COLLECTIONS.
 *
 * `mongoose.set("sanitizeFilter", true)` is deliberately OFF: it strips the
 * legitimate `$or` / `$lt` operators the Task 12 bridge and sweeper depend on.
 * The actual defense is Zod validation at the request boundary, which means
 * every query against these collections MUST explicitly project only the fields
 * it reads — a `findOne({ email }, {}, { fields: { passwordHash: 1 } })` that
 * receives a string shaped like an operator matches nothing. Never rely on
 * `select: false` alone. This stays off until the last unvalidated query path
 * (the domain routes behind bridgeAuth) is validated in Phase 1C.
 */

/**
 * Auth fields shared by both account collections.
 *
 * A fragment rather than a base model or a discriminator: the two collections
 * must stay physically separate (ADR-0001), but the auth service operates on
 * either through one interface, and duplicating these definitions is how the
 * two drift apart — a lockout field added to one and forgotten on the other is
 * a security hole that typechecks.
 */
export const authFields = {
  email: { type: String, required: true, lowercase: true, trim: true },
  emailVerifiedAt: { type: Date, default: null },
  passwordHash: { type: String, default: null, select: false },
  googleId: { type: String, default: null },
  fullName: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  phone: { type: String, default: null },
  avatarUrl: { type: String, default: null },
  status: { type: String, enum: ["active", "suspended"], default: "active" },
  failedLoginCount: { type: Number, default: 0 },
  lockedUntil: { type: Date, default: null },
  /**
   * Set only by the Task 12 migration; `null` on every account that registered
   * through the new endpoints.
   *
   * This exists for one reason: the unverified-account sweeper deletes accounts
   * with `emailVerifiedAt: null` older than a cutoff, and every migrated account
   * arrives unverified with its *original* `createdAt` — months old. A sweeper
   * keyed on age alone deletes the entire inherited userbase on its first tick.
   * The sweeper excludes rows where this field is set.
   *
   * It is also the flag Phase 1C uses to find accounts still carrying a bcrypt
   * hash and a legacy Cloudinary resume URL.
   */
  migratedFromLegacyAt: { type: Date, default: null },
  /**
   * Cutoff for access tokens. Any access token whose `iat` is at or before this
   * instant is refused by `authenticate`, even though its signature is valid and
   * it has not expired.
   *
   * Revoking refresh families ends a session's ability to *continue*, but it does
   * nothing about the access token already in the attacker's hands, which stays
   * valid for up to ACCESS_TOKEN_TTL_MINUTES. On a password reset that is exactly
   * the window the legitimate owner is trying to close. Set this on reset, on
   * Google takeover-in-place, and on logout-everywhere.
   */
  sessionsInvalidatedAt: { type: Date, default: null },
  /** Set when a Google link is pending mailbox confirmation. */
  pendingGoogleLink: {
    googleId: { type: String, default: null },
    requestedAt: { type: Date, default: null },
  },
} as const;

/** Indexes every account collection needs. Call with the schema. */
export function applyAuthIndexes(schema: Schema): void {
  // Unique WITHIN the collection, not globally — one person may be both a
  // seeker and a recruiter, which is normal on Naukri and Internshala.
  schema.index({ email: 1 }, { unique: true });
  schema.index({ googleId: 1 }, { unique: true, sparse: true });
  // Drives the unverified-account sweeper. `migratedFromLegacyAt` is left out
  // deliberately — it is a null-check against an already-tiny candidate set, and
  // a third key would only make the index larger for every write.
  schema.index({ emailVerifiedAt: 1, createdAt: 1 });
}
