import { Schema } from "mongoose";
import { GENDERS } from "@jobportal/shared";

/**
 * NOTE ON QUERY PROJECTION — READ BEFORE QUERYING THESE COLLECTIONS.
 *
 * `mongoose.set("sanitizeFilter", true)` is ON (src/config/db.ts), so an
 * operator-shaped VALUE that reaches a filter through a string field is compared
 * as a literal rather than executed. A query that deliberately wants an operator
 * opts in with `mongoose.trusted({ $gt: … })`; grep for it to see every one.
 *
 * That is a backstop, not the defense. The defense is still Zod at the request
 * boundary plus explicit projection: every query against these collections
 * should project only the fields it reads. Never rely on `select: false` alone.
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
  /**
   * A calendar date stored at UTC midnight. Required of seekers and recruiters
   * by the gate, NOT by this schema — `seed:admin` and `seed:catalog` create
   * accounts with no DOB, and a schema-level `required` breaks both.
   *
   * Never format this without `timeZone: "UTC"`. A local formatter shifts it a
   * day in any negative-offset zone, which is a different birthday.
   */
  dob: { type: Date, default: null },
  /**
   * `null` means never asked; "prefer-not-to-say" means asked and declined.
   * Mongoose 8 accepts null against a String enum that does not list it
   * (verified), so no null entry is needed here.
   */
  gender: { type: String, enum: [...GENDERS], default: null },
  avatarUrl: { type: String, default: null },
  status: { type: String, enum: ["pending", "active", "suspended"], default: "active" },
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
  /**
   * Set while an email change awaits its code(s). Latest attempt wins: a new
   * start overwrites any older pending, the same idiom as `pendingGoogleLink`.
   * `confirmedCurrentAt` is admin-only — it marks the stage-1 (current
   * address) code as redeemed, which is when the stage-2 (new address) code
   * is mailed. Seekers and recruiters leave it null: their single code to the
   * new address is the whole proof.
   */
  pendingEmailChange: {
    newEmail: { type: String, default: null },
    requestedAt: { type: Date, default: null },
    confirmedCurrentAt: { type: Date, default: null },
  },
  /**
   * The guardian whose consent is on file (Project C). `consentedAt` is the
   * proof timestamp; the pair is null for every adult account and every
   * account created before the floor opened. Nothing is backfilled — the old
   * 18+ floor means every existing DOB is an adult's.
   */
  guardianConsent: {
    email: { type: String, default: null },
    consentedAt: { type: Date, default: null },
  },
  /** The address awaiting a consent code, in the `pendingGoogleLink` idiom. */
  pendingGuardian: {
    email: { type: String, default: null },
    requestedAt: { type: Date, default: null },
  },
  /**
   * Why the account is suspended, and by whom (Project D). `status` remains
   * the driver every check reads; this fragment is what the login answer and
   * the console display. Cleared on reinstate.
   */
  suspension: {
    reason: { type: String, default: null },
    suspendedAt: { type: Date, default: null },
    byAdminId: { type: Schema.Types.ObjectId, default: null },
  },
} as const;

/** Indexes every account collection needs. Call with the schema. */
export function applyAuthIndexes(schema: Schema): void {
  // Unique WITHIN the collection — a backstop that makes registry drift fail
  // loudly on the same portal. The cross-portal guarantee is the
  // `emailRegistry` collection's unique index (2026-08-27: one address holds
  // exactly one account, reversing ADR-0001's original dual-account rule).
  schema.index({ email: 1 }, { unique: true });
  // A PARTIAL index, not a sparse one. `sparse` only skips documents where the
  // field is ABSENT, and `googleId` has `default: null`, so every
  // password-registered account stores an explicit null and indexes it. Under
  // `sparse: true` the second such account dies with
  // `E11000 dup key: { googleId: null }` — i.e. nobody after the first can
  // register without Google, and the Task 12 migration (which writes
  // `googleId: null` for every row) fails on its second document.
  // `$type: "string"` indexes only real Google ids. Note `$ne` is not a
  // permitted operator in a partialFilterExpression.
  schema.index(
    { googleId: 1 },
    { unique: true, partialFilterExpression: { googleId: { $type: "string" } } },
  );
  // Drives the unverified-account sweeper. `migratedFromLegacyAt` is left out
  // deliberately — it is a null-check against an already-tiny candidate set, and
  // a third key would only make the index larger for every write.
  schema.index({ emailVerifiedAt: 1, createdAt: 1 });
}
