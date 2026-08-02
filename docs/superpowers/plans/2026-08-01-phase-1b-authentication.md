# Phase 1B — Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inherited single-collection, client-asserts-its-own-role authentication with two portal-scoped account collections, Argon2id passwords, Brevo OTP email verification, Google OAuth with PKCE, and rotating refresh-token sessions in `__Host-` cookies — closing every finding from the 2026-08-01 adversarial review of the design.

**Architecture:** One auth implementation parameterized by portal, mounted twice at `/api/v1/seeker/auth/*` and `/api/v1/recruiter/auth/*`. The mount is a server-side literal, never a route param, so no request can select its own portal. Cryptographic material is derived per portal, so a token minted for one collection fails *signature verification* against the other rather than merely failing a claim comparison. Credential redemption (OTP, refresh) resolves the target account exclusively from the server-side record it just matched, never from a field in the request body.

**Tech Stack:** Node 20.19+, TypeScript 5.9 (NodeNext), Express 5.1, Mongoose 8, Zod 4, `@node-rs/argon2` 2.0.2, `@getbrevo/brevo` 6.0.2, `google-auth-library` ^10.9.1, `jsonwebtoken` 9, Vitest 3, Supertest 7, `mongodb-memory-server` 10.

**Reference documents:**
- Design: `docs/superpowers/specs/2026-07-31-secure-foundation-design.md` (as amended 2026-08-01 — read the amendment section first, it overrides the body where they disagree)
- Cookie decisions: `docs/adr/0005-cookie-sessions.md` (as amended 2026-08-01)
- Collection split rationale: `docs/adr/0001-two-account-collections.md`
- Why no Redis: `docs/adr/0004-no-redis-phase-1.md`

---

## Global Constraints

- **Every new env variable must be added to `backend/tests/setup.ts`** in the same commit. That file sets `process.env` before any import runs; a required variable missing from it fails *every* test at import time, not just the new ones. This is the single most common way to break the suite in this repository.
- **`.js` extensions on every relative import**, even from `.ts` files — `backend` and `packages/shared` use `moduleResolution: NodeNext`. Bare package specifiers (`@node-rs/argon2`) take no extension. `frontend` uses `Bundler` resolution and needs none.
- **Build `packages/shared` before typechecking `backend`.** The API compiles against `packages/shared/dist/*.d.ts`; a stale build produces type errors that describe the previous state of the world.
- **Failures throw `AppError`.** Never `res.status(4xx).json(...)` for a failure — the error middleware owns every failure envelope. Never `catch` without rethrowing; Express 5 forwards async rejections automatically, so no `asyncHandler` wrapper is needed.
- **Never serialize a Mongoose document into a response.** Build an explicit DTO. This is how the inherited `getApplicants` leaks bcrypt hashes.
- **Config through `env()` only.** No direct `process.env` reads outside `src/config/env.ts` (the one documented exception is `src/lib/logger.ts`).
- **The legacy `/api/v1/user/*` auth routes keep working until Task 15.** New routes are built alongside them; the frontend switches in Task 13; the legacy *auth surface* (register/login/logout, `isAuthenticated`) is deleted in Task 15. This ordering means the app is never broken mid-phase, and it means the `httpsOnly` typo survives in the tree slightly longer than instinct wants — do not "fix" it in place, it is deleted wholesale. `updateProfile` is the one handler in `user.controller.ts` that survives Task 15: Task 12 repoints it (and the three `ref: "User"` fields) at the account collections, because leaving one writer on `users` while every reader moved would lose profile edits silently. It keeps its inherited path and body until 1C — see the scope boundary below. `user.model.ts` stays through the phase as the migration's rollback path.
- **Uniform failure messaging on all auth endpoints.** "Incorrect email or password" regardless of which check failed. Distinct machine codes are permitted only where the amended spec says so, and `EMAIL_NOT_VERIFIED` only *after* a correct password.
- **Commit after every task** in Conventional Commits format. Push directly to `main` (project instruction). Stage by explicit path — never `git add -A`, which has twice swept scratch directories into the repository.
- **Every task must leave `npm run typecheck` and `npm test` green** at the repository root.

### Security invariants no task may violate

These are the review findings in imperative form. A reviewer should be able to check each one mechanically.

1. No OTP or refresh handler resolves an account from `req.body.email`. The account comes from the matched record's `subjectId`.
2. Every OTP redemption filter includes `purpose` **and** `subjectType`, and increments `attempts` in the same atomic operation that matches it.
3. OTP codes are stored as `HMAC-SHA256(pepper, subjectId ‖ code)`. No bare digest, no plaintext email on the same document.
4. Refresh rotation is one `findOneAndUpdate` on `{ tokenHash, revokedAt: null, replacedBy: null }`. Never read-then-write.
5. The refresh handler takes the portal from the stored row's `subjectType`, never from the URL.
6. Access tokens are signed with a per-portal derived key.
7. Google `email_verified` alone never links a Google identity to a verified password-bearing account.
8. The Google callback's portal is the mount's literal, and the transaction's portal comes from a signed `httpOnly` cookie — never from `state` or a query parameter.
9. Account lockout is reachable only for the account's own password login, capped, and never keyed by IP.
10. `EMAIL_NOT_VERIFIED` is returned only after the submitted password verifies.

### Scope boundary with Phase 1C

The design spec covers all of Phase 1; this plan implements its
*authentication* half. The following spec items are **deliberately not in any
task below** and belong to Phase 1C — listing them here so their absence reads
as a decision, not an omission:

- Ownership checks (`requireOwnership`) and the authorization test matrix on domain routes. *Role* gating does arrive in Task 12 — not as authorization work brought forward, but because the bridge cannot populate `req.id` without deciding which of two possible sessions to read, and deciding that per-route is the only option that does not corrupt `created_by`. Ownership stays entirely unchecked until 1C.
- Explicit DTOs for domain responses (the `getApplicants` projection fix)
- `$regex` search → `jobs` text index; pagination on list endpoints
- Signed, short-lived resume URLs; upload magic-byte checks
- CSRF on the *domain* mutation routes (they gain it when they move behind `authenticate(portal)` in 1C; until then `sameSite=strict` is the interim control)
- CAPTCHA / proof-of-work on registration (needs a provider decision; the per-IP registration limit in Task 10 is the interim control)
- Rebuilding the profile module properly. Task 12 repoints `updateProfile` at the account collections so that 1B does not lose profile edits, but it stays at its inherited path, with its inherited `multipart/form-data` body, and with `email` demoted to read-only because there is no verified email-change flow to hang it on. 1C gives it a real home, a JSON contract, and that flow
- Retiring `user.model.ts` (kept through 1B as the migration's rollback path) and the Task 12 bridge

---

## File Structure

```
packages/shared/src/
  auth.ts                      Zod schemas: register, login, verify, reset, portal (Task 1)
  auth-dto.ts                  SessionUser, AuthResponse, AUTH_ERROR_CODES (Task 1)

backend/src/
  config/
    env.ts                     + OTP_PEPPER, CSRF_SECRET, API_BASE_URL, WEB_BASE_URL, … (Task 1;
                               + LEGACY_AUTH_FALLBACK, UNVERIFIED_ACCOUNT_TTL_HOURS,
                                 SWEEP_INTERVAL_MINUTES in Task 12)
    db.ts                      + sanitizeFilter (Task 2)
  models/
    authFields.ts              shared auth schema fragment (email, password, lockout, …) (Task 2)
    seeker.model.ts            (Task 2)
    recruiter.model.ts         (Task 2)
    refreshToken.model.ts      (Task 2)
    otpCode.model.ts           + OtpPurpose type (Task 2)
    otpBudget.model.ts         cumulative per-account per-purpose failure budget (Task 2)
  lib/
    password.ts                Argon2id hash/verify + legacy bcrypt detection (Task 3)
    keys.ts                    per-portal HKDF key derivation (Task 3; + googleTxnKey in Task 9)
    otp.ts                     generate, HMAC, constant-time compare (Task 3)
    csrfToken.ts               mint/verify HMAC-bound double-submit token (Task 3)
    mailer.ts                  Brevo transactional send behind a test seam (Task 4)
    emailTemplates.ts          rendered subjects/bodies, no template engine (Task 4; +Task 9)
    cookies.ts                 name/attribute helpers, __Host- prefixing (Task 5)
    validate.ts                parseBody(schema) → AppError VALIDATION_ERROR (Task 7)
    googleOAuth.ts             OAuth2Client wrapper behind a test seam (Task 9)
    sweeper.ts                 unverified-account expiry (Task 12)
  services/
    account.service.ts         portal-parameterized account reads (Task 6)
    session.service.ts         issue / rotate / revoke, reuse detection (Task 5)
    auth.service.ts            register/verify (Task 7), login/lockout/reset (Task 8)
    googleAuth.service.ts      PKCE start + callback, identity resolution (Task 9)
  controllers/
    auth.controller.ts         HTTP only; *Handler(portal) factories (Tasks 7-9)
  middleware/
    authenticate.ts            authenticate(portal), requireVerified (Task 6)
    csrf.ts                    double-submit verification (Task 6)
    bridgeAuth.ts              transitional: new-session → legacy req.id (Task 12; slimmed Task 15)
  routes/
    auth.route.ts              buildAuthRouter(portal) + per-route rate limits (Task 10)
  scripts/
    migrate-phase1b.ts         users → seekers + recruiters, idempotent (Task 12)

backend/tests/auth/
  helpers.ts                   harness app, capture mailer, cookie utils (Task 7)
  crypto.test.ts (3)   mailer.test.ts (4)   session.test.ts (5)     csrf.test.ts (6)
  register.test.ts (7) otp.test.ts (7)      login.test.ts (8)       reset.test.ts (8)
  google.test.ts (9)   integration.test.ts (10)  portalIsolation.test.ts (11)
  concurrency.test.ts (11)  bridge.test.ts (12)  migration.test.ts (12)  sweeper.test.ts (12)

frontend/src/
  lib/apiClient.ts             + CSRF header + single-flight refresh-on-401 retry (Task 13)
  features/auth/               portal-aware pages wired to the new endpoints (Task 13)
```

---

### Task 1: Environment and shared contracts

Nothing else compiles without these. Pure additive work — no behavior change.

**Files:**
- Create: `packages/shared/src/auth.ts`, `packages/shared/src/auth-dto.ts`
- Modify: `packages/shared/src/index.ts`, `backend/src/config/env.ts`, `backend/tests/setup.ts`, `.env.example`

**Interfaces:**
- Consumes: nothing
- Produces: `env()` with the new keys; `@jobportal/shared` exporting every auth schema both ends will use

- [ ] **Step 1: Add the new environment variables**

In `backend/src/config/env.ts`, add to `envSchema`:

```ts
  OTP_PEPPER: z.string().min(32, "must be at least 32 characters"),
  CSRF_SECRET: z.string().min(32, "must be at least 32 characters"),
  OTP_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  OTP_BUDGET_MAX_FAILURES: z.coerce.number().int().positive().default(20),
  OTP_BUDGET_WINDOW_HOURS: z.coerce.number().int().positive().default(24),
  UNVERIFIED_ACCOUNT_TTL_HOURS: z.coerce.number().int().positive().default(72),
  LOGIN_LOCK_THRESHOLD: z.coerce.number().int().positive().default(5),
  LOGIN_LOCK_MAX_MINUTES: z.coerce.number().int().positive().default(15),
  GOOGLE_LINK_CONFIRM_TTL_HOURS: z.coerce.number().int().positive().default(24),
  API_BASE_URL: z.string().url(),
  WEB_BASE_URL: z.string().url(),
```

Also **replace** `ACCESS_TOKEN_TTL: z.string().default("15m")` with a numeric
minute count:

```ts
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
```

The string form was fine while the only consumer was `jsonwebtoken`, which parses
`"15m"` itself. Cookie `maxAge` needs milliseconds, and two representations of one
lifetime is how an access cookie ends up outliving the token inside it. One number,
converted at each use site.

`LOGIN_LOCK_MAX_MINUTES` **caps** the exponential backoff rather than letting it
grow without bound. An uncapped lock is a denial-of-service primitive: anyone who
knows an email address can keep an account locked indefinitely by submitting wrong
passwords, and the legitimate owner has no way to shorten it.

And **remove** `GOOGLE_REDIRECT_URI`. The callback is portal-pinned, so there are two redirect URIs, and deriving them from `API_BASE_URL` keeps them from drifting apart:

```ts
export function googleRedirectUri(portal: "seeker" | "recruiter"): string {
  return `${env().API_BASE_URL}/api/v1/${portal}/auth/google/callback`;
}
```

Both derived URIs must be registered on the Google OAuth client. Google matches `redirect_uri` byte-for-byte — scheme, case, and trailing slash all count — so a mismatch surfaces as `redirect_uri_mismatch` at consent time, not at boot.

Add a boot-time assertion that all four secrets are distinct:

```ts
const secrets = [parsed.JWT_ACCESS_SECRET, parsed.JWT_REFRESH_PEPPER, parsed.OTP_PEPPER, parsed.CSRF_SECRET];
if (new Set(secrets).size !== secrets.length) {
  throw new Error("Invalid environment configuration:\n  JWT_ACCESS_SECRET, JWT_REFRESH_PEPPER, OTP_PEPPER and CSRF_SECRET must all differ");
}
```

Reusing one value across four purposes means a leak of any one compromises all four, and it defeats the point of deriving per-portal keys from a dedicated secret.

- [ ] **Step 2: Add the same variables to `backend/tests/setup.ts`**

Do this in the same commit or every test fails at import.

```ts
process.env.OTP_PEPPER = "test-otp-pepper-at-least-32-characters!!";
process.env.CSRF_SECRET = "test-csrf-secret-at-least-32-characters";
process.env.API_BASE_URL = "http://localhost:8000";
process.env.WEB_BASE_URL = "http://localhost:5173";
```

Delete the `GOOGLE_REDIRECT_URI` line. Keep the four distinct — the boot assertion from Step 1 will otherwise reject the test config.

- [ ] **Step 3: Write `packages/shared/src/auth.ts`**

```ts
import { z } from "zod";

export const portalSchema = z.enum(["seeker", "recruiter"]);
export type Portal = z.infer<typeof portalSchema>;

/**
 * Password policy: length over composition rules. NIST 800-63B advises against
 * mandatory character-class mixing — it pushes users toward "Password1!" and
 * measurably lowers entropy. 12 characters with no composition requirement is
 * stronger in practice.
 */
export const passwordSchema = z
  .string()
  .min(12, "must be at least 12 characters")
  .max(128, "must be at most 128 characters");

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const registerBodySchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  email: emailSchema,
  password: passwordSchema,
  phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, "must be E.164, e.g. +919876543210").optional(),
});

export const loginBodySchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const otpCodeSchema = z.string().trim().regex(/^\d{6}$/, "must be 6 digits");

/**
 * `email` IS present on the redemption bodies, and its role is strictly
 * limited. Because stored codes are hashed bound to a subject id (Task 3),
 * the server cannot even compute the digest to search for without first
 * resolving a candidate account — that is what `email` is for. It selects
 * WHICH HASH TO COMPUTE, never which account to mutate; the mutated account
 * always comes from the matched OTP row's `subjectId`. See the long note in
 * Task 3's otp.ts and the 2026-08-01 spec amendment, finding 1. (The spec
 * body's literal "no email field" wording predates the subject-bound hash;
 * the amendment's actual requirement — never resolve the mutated account
 * from the request body — holds.)
 */
export const verifyEmailBodySchema = z.object({
  email: emailSchema,
  code: otpCodeSchema,
});

export const resetPasswordBodySchema = z.object({
  email: emailSchema,
  code: otpCodeSchema,
  newPassword: passwordSchema,
});

export const forgotPasswordBodySchema = z.object({ email: emailSchema });
export const resendVerificationBodySchema = z.object({ email: emailSchema });

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type VerifyEmailBody = z.infer<typeof verifyEmailBodySchema>;
export type ResetPasswordBody = z.infer<typeof resetPasswordBodySchema>;
export type ForgotPasswordBody = z.infer<typeof forgotPasswordBodySchema>;
```

`emailSchema` lowercases and trims *in the schema*, so every downstream lookup sees the canonical form and no handler can forget to normalize. `max(254)` is the RFC 5321 limit and stops a multi-megabyte string reaching the database index.

- [ ] **Step 4: Write `packages/shared/src/auth-dto.ts`**

```ts
import type { Portal } from "./auth.js";

/** The only account shape that ever crosses the wire. */
export interface SessionUser {
  id: string;
  portal: Portal;
  fullName: string;
  email: string;
  emailVerified: boolean;
  avatarUrl: string | null;
}

export interface AuthResponse {
  success: true;
  user: SessionUser;
}

/**
 * Exactly the codes the API emits — nothing aspirational. A locked account
 * and an expired OTP deliberately do NOT get their own codes: the lock hides
 * behind INVALID_CREDENTIALS (a distinct code would be an existence-and-state
 * oracle) and an expired code is indistinguishable from a wrong one on
 * purpose. RATE_LIMITED and VALIDATION_ERROR also appear on these endpoints
 * but are platform-wide codes, not auth-specific ones.
 */
export const AUTH_ERROR_CODES = [
  "INVALID_CREDENTIALS",
  "EMAIL_NOT_VERIFIED",
  "EMAIL_TAKEN",
  "OTP_INVALID",
  "OTP_BUDGET_EXHAUSTED",
  "PASSWORD_REUSED",
  "SESSION_MISSING",
  "SESSION_INVALID",
  "CSRF_INVALID",
  "GOOGLE_AUTH_FAILED",
  "GOOGLE_LINK_INVALID",
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];
```

Note what is *absent*: no `role`, no `passwordHash`, no `googleId`, no lockout counters. `SessionUser` is the whole contract, and because the frontend imports it, adding a field to a model cannot leak it by accident.

- [ ] **Step 5: Export from the barrel**

In `packages/shared/src/index.ts`:

```ts
export * from "./auth.js";
export * from "./auth-dto.js";
```

`portalSchema` may now collide with the `Portal` already exported from `enums.ts`. If it does, delete the one in `enums.ts` and re-export from `auth.ts` — one definition, not two.

- [ ] **Step 6: Update `.env.example`**

Add every new name with an empty value and a comment on how to generate it. Note that `openssl rand -base64 48` is the recommended generator for all four secrets, and that they must differ.

- [ ] **Step 7: Verify and commit**

```bash
npm run build --workspace @jobportal/shared
npm run typecheck
npm test
```

Expected: green. The env change is additive at runtime because tests set the new variables, but if `npm test` fails with a config error naming a variable, Step 2 was skipped.

```bash
git add packages/shared backend/src/config/env.ts backend/tests/setup.ts .env.example
git commit -m "feat(shared): add auth schemas and DTOs; feat(api): add auth config"
```

---

### Task 2: Account collections and credential records

Five models, one shared fragment. No routes yet.

**Files:**
- Create: `backend/src/models/authFields.ts`, `seeker.model.ts`, `recruiter.model.ts`, `refreshToken.model.ts`, `otpCode.model.ts`, `otpBudget.model.ts`
- Modify: `backend/src/config/db.ts`

**Interfaces:**
- Consumes: `@jobportal/shared` (Portal)
- Produces: models importable by services; `sanitizeFilter` on globally

- [ ] **Step 1: Turn on `sanitizeFilter` globally — conditionally**

Setting `mongoose.set("sanitizeFilter", true)` strips every query key that begins with `$` —
including the legitimate operators (`$or`, `$lt`, `$gte`, `$and`) the bridge and sweeper
depend on. It is not usable as a blanket setting in a codebase that still has unvalidated
query paths.

The actual defense is validation at the request boundary, which every auth endpoint in
this phase gets from Zod: any string that passes `emailSchema` is already a valid email,
not a query operator, and Mongoose's type coercion is the only remaining hole — a number
field that receives a string. So:

1. Every `findOne`/`findById` call site in the new auth services explicitly projects
   only the fields it reads, rather than relying on `select: false` alone. A
   `findOne({ email }, {}, { fields: { passwordHash: 1, lockedUntil: 1, ... } })` that
   gets a string for `email` returns null — the query matches nothing, no injection.
2. `sanitizeFilter` goes on when the last unvalidated query path (the domain routes
   behind `bridgeAuth`) is validated — which is Phase 1C.

This step therefore adds nothing new to `db.ts`. Instead add a short comment at the top
of `authFields.ts` stating that every query MUST project, because `sanitizeFilter` is
off until the domain routes are validated.

- [ ] **Step 2: Write `backend/src/models/authFields.ts`**

```ts
import { Schema } from "mongoose";

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
  // A PARTIAL index, not a sparse one. `sparse` only skips documents where the
  // field is ABSENT, and `googleId` has `default: null`, so every
  // password-registered account stores an explicit null and indexes it. Under
  // `sparse: true` the second such account dies with
  // `E11000 dup key: { googleId: null }` — nobody after the first can register
  // without Google, and the Task 12 migration (which writes `googleId: null`
  // for every row) fails on its second document. `$type: "string"` indexes only
  // real Google ids. Note `$ne` is not a permitted operator in a
  // partialFilterExpression.
  schema.index(
    { googleId: 1 },
    { unique: true, partialFilterExpression: { googleId: { $type: "string" } } },
  );
  // Drives the unverified-account sweeper. `migratedFromLegacyAt` is left out
  // deliberately — it is a null-check against an already-tiny candidate set, and
  // a third key would only make the index larger for every write.
  schema.index({ emailVerifiedAt: 1, createdAt: 1 });
}
```

`phone` is a **string**. The inherited model typed it `Number`, which drops leading zeros and cannot hold `+91`.

`passwordHash` defaults to `null` because a Google-only account has no password — and `null` is meaningfully different from a hash nobody knows. Any verify path must treat `null` as "no password set" and still burn a dummy Argon2 verify, or absence of a password becomes a timing oracle.

`select: false` is the other half of "never serialize a Mongoose document". That
rule is currently enforced by discipline, and the inherited `getApplicants` is
the proof that discipline loses: it `populate()`s an applicant and returns the
document whole, bcrypt hash included. Task 12 repoints that populate at these
collections, so without this flag Task 12 would be the commit that starts
leaking Argon2 hashes instead. With it, the field is absent from every query,
projection and populate in the codebase unless a caller asks for it by name —
and the three callers that legitimately need it (`login`, `resetPassword`,
Google identity resolution) pass `{ withSecret: true }`, which is greppable in a
way "remember to project" never is.

The cost is real and worth naming: read an account without the flag and
`account.passwordHash` is `undefined`, so `verifyPassword` takes the dummy-burn
branch and every login fails. That is a loud, immediate, test-covered failure,
not a silent one.

- [ ] **Step 3: Write the two account models**

`backend/src/models/seeker.model.ts`:

```ts
import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { authFields, applyAuthIndexes } from "./authFields.js";

const seekerSchema = new Schema(
  {
    ...authFields,
    profile: {
      headline: { type: String, default: null, maxlength: 120 },
      bio: { type: String, default: null, maxlength: 2000 },
      skills: { type: [String], default: [] },
      experienceYears: { type: Number, default: null, min: 0, max: 60 },
      location: { type: String, default: null },
    },
    resume: {
      storageKey: { type: String, default: null },
      originalName: { type: String, default: null },
      mimeType: { type: String, default: null },
      sizeBytes: { type: Number, default: null },
      uploadedAt: { type: Date, default: null },
    },
  },
  { timestamps: true },
);

applyAuthIndexes(seekerSchema);

export type SeekerDocument = InferSchemaType<typeof seekerSchema>;
export const Seeker: Model<SeekerDocument> = mongoose.model<SeekerDocument>("Seeker", seekerSchema);
```

`backend/src/models/recruiter.model.ts` — same fragment plus `designation: String | null` and `company: { type: Schema.Types.ObjectId, ref: "Company", default: null }`.

- [ ] **Step 4: Write `backend/src/models/refreshToken.model.ts`**

```ts
import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const refreshTokenSchema = new Schema(
  {
    /** HMAC-SHA256(JWT_REFRESH_PEPPER, token). Never the token itself. */
    tokenHash: { type: String, required: true, unique: true },
    subjectId: { type: Schema.Types.ObjectId, required: true },
    /** The authoritative portal for this session. The refresh handler reads it
     *  from here — never from the request URL. See spec amendment, finding 5. */
    subjectType: { type: String, enum: ["seeker", "recruiter"], required: true },
    familyId: { type: String, required: true },
    userAgent: { type: String, default: null },
    ip: { type: String, default: null },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedBy: { type: String, default: null },
    /** Set when this token was successfully exchanged, for grace-window logic. */
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
refreshTokenSchema.index({ familyId: 1 });
refreshTokenSchema.index({ subjectId: 1, subjectType: 1 });

export type RefreshTokenDocument = InferSchemaType<typeof refreshTokenSchema>;
export const RefreshToken: Model<RefreshTokenDocument> =
  mongoose.model<RefreshTokenDocument>("RefreshToken", refreshTokenSchema);
```

The TTL index on `expiresAt` is what lets us skip Redis (ADR-0004). Mongo's TTL monitor runs about once a minute, so expiry is eventually-consistent — every read path must still check `expiresAt` itself rather than trusting the row's absence.

- [ ] **Step 5: Write `backend/src/models/otpCode.model.ts`**

```ts
import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const otpCodeSchema = new Schema(
  {
    /**
     * HMAC-SHA256(OTP_PEPPER, `${subjectId}:${code}`).
     *
     * Not a bare SHA-256: the space is a million values, so the full rainbow
     * table is 32 MB and any read of this collection — a dump, a staging copy,
     * a log line — converts directly into sessions. Keying with a pepper that
     * lives only in env means a database read alone yields nothing, and binding
     * the subject into the input means a recovered code cannot be replayed
     * against a different account even with the pepper.
     */
    codeHash: { type: String, required: true },
    purpose: { type: String, enum: ["verify_email", "reset_password"], required: true },
    subjectId: { type: Schema.Types.ObjectId, required: true },
    subjectType: { type: String, enum: ["seeker", "recruiter"], required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// The redemption query. Order matters: equality fields first, then range.
otpCodeSchema.index({ codeHash: 1, purpose: 1, subjectType: 1 });
otpCodeSchema.index({ subjectId: 1, purpose: 1 });
otpCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type OtpCodeDocument = InferSchemaType<typeof otpCodeSchema>;
export const OtpCode: Model<OtpCodeDocument> =
  mongoose.model<OtpCodeDocument>("OtpCode", otpCodeSchema);

/** Exported for the mailer and the services; keep in sync with the enum above. */
export type OtpPurpose = "verify_email" | "reset_password";
```

**There is deliberately no `email` field.** The approved design had one; it was both redundant (`subjectId` locates the account) and harmful — it told anyone reading the collection exactly which account and portal each captured code unlocked.

- [ ] **Step 6: Write `backend/src/models/otpBudget.model.ts`**

```ts
import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Cumulative failure budget per (account, purpose), independent of any one code.
 *
 * The 5-attempts-per-code cap is not a brute-force defense on its own: a new
 * code arrives with attempts:0, so re-requesting resets the budget. That works
 * out to 15-20 guesses per account per hour indefinitely — about 0.25% per
 * account-week, which against a 10,000-address list is roughly 25 takeovers a
 * week with nothing per-account ever tripping. This document is what survives
 * a new code.
 */
const otpBudgetSchema = new Schema(
  {
    subjectId: { type: Schema.Types.ObjectId, required: true },
    subjectType: { type: String, enum: ["seeker", "recruiter"], required: true },
    purpose: { type: String, enum: ["verify_email", "reset_password"], required: true },
    failures: { type: Number, default: 0 },
    windowStartedAt: { type: Date, required: true },
    lockedUntil: { type: Date, default: null },
    /** TTL: the document is worthless once the window is well past. */
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

otpBudgetSchema.index({ subjectId: 1, subjectType: 1, purpose: 1 }, { unique: true });
otpBudgetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type OtpBudgetDocument = InferSchemaType<typeof otpBudgetSchema>;
export const OtpBudget: Model<OtpBudgetDocument> =
  mongoose.model<OtpBudgetDocument>("OtpBudget", otpBudgetSchema);
```

- [ ] **Step 7: Verify and commit**

```bash
npm run typecheck
npm test
git add backend/src/models backend/src/config/db.ts
git commit -m "feat(api): add account, refresh-token and OTP models"
```

---

### Task 3: Cryptographic primitives

Small, pure, heavily tested. Every later task depends on these being right, and they are the easiest place in the phase to write a subtle bug that no integration test catches.

**Files:**
- Create: `backend/src/lib/password.ts`, `keys.ts`, `otp.ts`, `csrfToken.ts`
- Create: `backend/tests/auth/crypto.test.ts`

**Interfaces:**
- Consumes: `env()`
- Produces: `hashPassword`, `verifyPassword`, `accessTokenKey`, `hashRefreshToken`, `generateOtp`, `hashOtp`, `mintCsrfToken`, `verifyCsrfToken`

- [ ] **Step 1: Install Argon2**

```bash
npm install --workspace @jobportal/api @node-rs/argon2@2.0.2
```

`@node-rs/argon2` over `argon2`: prebuilt N-API binaries for every platform we deploy to, so there is no `node-gyp` in CI and no build toolchain in the Docker image; roughly 2× faster per hash than the C++ binding at identical parameters; and `engines: >= 10`, comfortably inside our Node 20 floor. The spec's original worry about Argon2 being "a native module that complicates deploys" applies to the C++ binding, not this one.

Verify the import before writing code against it:

```bash
node -e "import('@node-rs/argon2').then(m=>console.log(Object.keys(m)))"
```

Expect `hash`, `verify`, `Algorithm` among the exports. If `Algorithm` is absent the major version changed — stop and check the README rather than guessing.

- [ ] **Step 2: Write `backend/src/lib/password.ts`**

```ts
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
```

`bcryptjs` stays a dependency for exactly this: existing users' hashes are bcrypt, and the migration deliberately does not rewrite them (it cannot — it has no plaintext). They upgrade transparently on next successful login.

Note the argument order: `@node-rs/argon2`'s `verify(hash, password)` takes the hash **first**, the opposite of `bcrypt.compare(password, hash)`. Getting this backwards fails every login with no error message worth reading.

- [ ] **Step 3: Write `backend/src/lib/keys.ts`**

```ts
import { createHmac, hkdfSync } from "node:crypto";
import type { Portal } from "@jobportal/shared";
import { env } from "../config/env.js";

/**
 * Per-portal access-token signing key.
 *
 * A shared key plus a `type === portal` claim check is correct but fragile: the
 * entire portal boundary rests on one comparison, and a refactor that drops it
 * has no cryptographic backstop. Deriving separate keys makes a seeker token
 * presented to a recruiter route fail *signature verification*. The claim check
 * stays too — they are independent defenses, and the claim is what catches a
 * token that was minted for the right portal but the wrong subject type.
 */
export function accessTokenKey(portal: Portal): Buffer {
  return Buffer.from(hkdfSync("sha256", env().JWT_ACCESS_SECRET, "", `access:${portal}`, 32));
}

/** Keyed hash of an opaque refresh token. A dump alone must not be replayable. */
export function hashRefreshToken(token: string): string {
  return createHmac("sha256", env().JWT_REFRESH_PEPPER).update(token).digest("hex");
}
```

`hkdfSync` returns an `ArrayBuffer`; `jsonwebtoken` wants a `Buffer` or string, hence the wrap. The empty salt is intentional — HKDF's salt is optional and the `info` parameter is what separates the two portals.

- [ ] **Step 4: Write `backend/src/lib/otp.ts`**

```ts
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { Types } from "mongoose";
import { env } from "../config/env.js";

/**
 * `randomInt` is cryptographically secure and, critically, unbiased —
 * `Math.floor(Math.random() * 900000) + 100000` is neither, and modulo-reducing
 * a random byte string skews the distribution toward low digits.
 */
export function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Peppered, subject-bound hash. See otpCode.model.ts for why a bare digest is
 * not acceptable over a six-digit space.
 */
export function hashOtp(code: string, subjectId: Types.ObjectId | string): string {
  return createHmac("sha256", env().OTP_PEPPER).update(`${String(subjectId)}:${code}`).digest("hex");
}

/** Constant-time comparison of two hex digests of equal length. */
export function digestsEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
```

Because the hash is subject-bound, redemption cannot look a code up by hash alone — it must know the subject before it can compute the digest to search for. This resolves a tension that looks, at first, like a conflict with the design spec's rule that redemption must not trust `req.body.email`.

**Both hold at once, and the mechanism is worth understanding before you write Task 8.** The request carries `{ email, code }`. The handler uses `email` for *one* purpose: to locate a candidate account and obtain its `_id`. It then computes `hashOtp(code, candidate._id)` and matches on that digest. The account it finally mutates is `doc.subjectId` from the matched row.

The original attack — present your own valid code with the victim's email — now fails arithmetically rather than by policy. The attacker's stored row holds `HMAC(pepper, attackerId ‖ code)`. Submitting that same code under the victim's email makes the handler search for `HMAC(pepper, victimId ‖ code)`, a digest that exists nowhere. There is no row to match, so there is nothing to redeem. Cross-account redemption stops being a rule the code must remember to enforce and becomes a hash that cannot collide.

That is why the email may be accepted here even though the spec forbids *resolving* the account from it. The distinction is exact and load-bearing:

- **Permitted:** `email` selects which subject's digest to compute, and the code must be valid *for that subject*.
- **Forbidden:** `email` selects which account to mutate. That account always comes from `doc.subjectId`.

The payoff is that redemption stays a single atomic, fully-indexed `findOneAndUpdate` on `{ codeHash, purpose, subjectType, subjectId, consumedAt: null, expiresAt: { $gt: now }, attempts: { $lt: max } }` with `$inc: { attempts: 1 }` — no scan, no race, and the attempt counter cannot be defeated by concurrency.

It also keeps the flow usable across devices. A session-bound alternative (a signed "pending verification" cookie set at registration) would remove `email` from the body entirely, but it breaks the ordinary case of registering on a laptop and reading the code on a phone. Correctness that forces users into one device is not correctness.

**When the email matches no account,** perform the same work anyway — hash the code against a throwaway ObjectId, run the same query shape — and return the identical error. Skipping the work turns redemption into a timing oracle for which addresses are registered.

> **Note on the budget interaction — a real trade, not a solved problem.** Failed attempts increment the cumulative budget belonging to the *email-resolved* subject. A stranger can therefore burn a victim's redemption budget with deliberately wrong guesses, and no amount of hashing changes that: the whole purpose of a budget that survives new codes is that it cannot be reset by the person spending it.
>
> Both horns are real. Without a cumulative budget, per-code caps are cosmetic — request three codes an hour, fifteen guesses an hour, forever, which the review priced at roughly one takeover per four hundred targeted accounts per week. With one, an unauthenticated stranger can degrade a specific account's recovery.
>
> The parameters are chosen so the second harm stays small while the first is removed. **20 failures per 24 hours** is far above what mistyping produces (two or three) and far below what brute force needs (thousands). Exhaustion blocks *redemption* only — never password login, never the account itself — so a user with a working password is unaffected. It clears immediately on any successful redemption. The account owner is emailed when it trips, which converts a silent lockout into a visible signal and gives a support path. Layered under it, the per-IP limit on redemption endpoints means burning someone's budget takes twenty requests from an address that gets throttled long before it can do this at scale.
>
> What we deliberately do **not** do: lock the account, extend the window on further failures, or key the budget by IP. Each of those hands the attacker leverage rather than taking it away.

- [ ] **Step 5: Write `backend/src/lib/csrfToken.ts`**

```ts
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

/**
 * Double-submit CSRF token as `nonce.HMAC(secret, nonce)`.
 *
 * Plain double-submit assumes only our origin can write the cookie. That is the
 * exact assumption `__Host-` exists because we cannot make: an insecure sibling
 * origin or a compromised subdomain can write cookies for the parent domain, and
 * an attacker who can write the cookie can also send the matching header. Binding
 * the two halves with a MAC means a forged pair does not validate.
 */
export function mintCsrfToken(): string {
  const nonce = randomBytes(24).toString("base64url");
  const mac = createHmac("sha256", env().CSRF_SECRET).update(nonce).digest("base64url");
  return `${nonce}.${mac}`;
}

export function verifyCsrfToken(token: string | undefined): boolean {
  if (!token) return false;
  const [nonce, mac] = token.split(".");
  if (!nonce || !mac) return false;
  const expected = createHmac("sha256", env().CSRF_SECRET).update(nonce).digest("base64url");
  if (expected.length !== mac.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(mac));
}
```

- [ ] **Step 6: Write the tests first if you have not already**

`backend/tests/auth/crypto.test.ts` — these are the assertions that matter:

```ts
// Password
- hashPassword produces a string starting "$argon2id$"
- verifyPassword(correct, hash) === true; (wrong, hash) === false
- verifyPassword(anything, null) === false and takes >20ms (dummy work happened)
- a known bcrypt hash of "hunter2hunter2" verifies true (legacy path)
- needsRehash("$2b$...") === true; needsRehash("$argon2id$...") === false

// Keys
- accessTokenKey("seeker") !== accessTokenKey("recruiter")
- accessTokenKey("seeker") is stable across calls
- a JWT signed with the seeker key FAILS jwt.verify with the recruiter key

// OTP
- generateOtp matches /^\d{6}$/ over 1000 iterations, and produces at least
  900 distinct values (catches a constant or a badly-seeded generator)
- hashOtp(code, A) !== hashOtp(code, B)  ← subject binding
- hashOtp is stable for the same inputs

// CSRF
- verifyCsrfToken(mintCsrfToken()) === true
- a token with a tampered nonce fails
- a token with a tampered MAC fails
- "nonce-with-no-dot" fails, "" fails, undefined fails
```

The cross-portal JWT assertion is the highest-value test in this task — it is the one that would catch a future refactor collapsing the two keys back into one.

- [ ] **Step 7: Verify and commit**

```bash
npm test --workspace @jobportal/api -- crypto
npm run typecheck
git add backend/src/lib backend/tests/auth backend/package.json package-lock.json
git commit -m "feat(api): add password, key-derivation, OTP and CSRF primitives"
```

---

### Task 4: Transactional email

Brevo is the only external dependency in the signup path. It is wrapped behind a
narrow interface so tests never touch the network and a provider swap is one file.

**Files:**
- Create: `backend/src/lib/mailer.ts`, `backend/src/lib/emailTemplates.ts`
- Create: `backend/tests/auth/mailer.test.ts`
- Modify: `backend/package.json`

**Interfaces:**
- Consumes: `env()` from Task 1
- Produces: `sendOtpEmail(to, code, purpose)`, `dispatch(promise)`

- [ ] **Step 1: Install the SDK**

```bash
npm install --workspace @jobportal/api @getbrevo/brevo@^6.0.2
```

Verified on this machine: `@getbrevo/brevo@6.0.2` declares `engines.node >= 18.0.0`,
so it runs on the Node 20 floor. The older `sib-api-v3-sdk` package is deprecated
and the v3 `@getbrevo/brevo` line is maintenance-only — use the v6 `BrevoClient`.

- [ ] **Step 2: Write `backend/src/lib/emailTemplates.ts`**

Templates are plain functions returning `{ subject, html, text }`. No template
engine: two emails do not justify one, and a function is typed and testable.

```ts
import type { OtpPurpose } from "../models/otpCode.model.js";

interface Rendered {
  subject: string;
  html: string;
  text: string;
}

const WRAPPER = (body: string): string =>
  `<div style="font-family:system-ui,sans-serif;max-width:32rem;margin:0 auto;padding:2rem;color:#1a1a1a">${body}<p style="margin-top:2rem;font-size:.75rem;color:#6b6b6b">If you did not request this, you can ignore this email. Nobody can access your account with this message alone.</p></div>`;

const CODE = (code: string): string =>
  `<p style="font-size:2rem;letter-spacing:.35em;font-weight:600;margin:1.5rem 0">${code}</p>`;

export function renderOtpEmail(code: string, purpose: OtpPurpose, minutes: number): Rendered {
  if (purpose === "verify_email") {
    return {
      subject: "Confirm your email address",
      html: WRAPPER(`<h1 style="font-size:1.25rem">Confirm your email</h1><p>Enter this code to finish setting up your account. It expires in ${minutes} minutes.</p>${CODE(code)}`),
      text: `Confirm your email\n\nCode: ${code}\nExpires in ${minutes} minutes.\n\nIf you did not request this, ignore this email.`,
    };
  }
  return {
    subject: "Reset your password",
    html: WRAPPER(`<h1 style="font-size:1.25rem">Reset your password</h1><p>Enter this code to choose a new password. It expires in ${minutes} minutes. Your current password stays active until you do.</p>${CODE(code)}`),
    text: `Reset your password\n\nCode: ${code}\nExpires in ${minutes} minutes.\n\nIf you did not request this, ignore this email — your password has not changed.`,
  };
}

/** Sent when a Google sign-in takes over an unverified account (Task 9, resolution branch 2c). */
export function renderAccountClaimedEmail(): Rendered {
  return {
    subject: "Your account is now linked to Google",
    html: WRAPPER(`<h1 style="font-size:1.25rem">Sign-in method changed</h1><p>Someone signed in to this account with Google. Because the email address had never been confirmed, the previous password was removed and all existing sessions were ended.</p><p>If this was you, nothing further is needed — sign in with Google from now on. If it was not, reset the password to take the account back.</p>`),
    text: `Sign-in method changed\n\nThis account was linked to Google, the previous password was removed, and all sessions were ended.\n\nIf this was not you, reset the password to take the account back.`,
  };
}

/** Sent when the cumulative OTP failure budget trips, so a lockout is never silent. */
export function renderOtpBudgetEmail(hours: number): Rendered {
  return {
    subject: "Too many incorrect codes",
    html: WRAPPER(`<h1 style="font-size:1.25rem">Code entry paused</h1><p>There have been too many incorrect codes entered for this account, so entering codes is paused for ${hours} hours. Signing in with your password still works normally.</p>`),
    text: `Code entry paused for ${hours} hours after too many incorrect codes. Password sign-in is unaffected.`,
  };
}
```

- [ ] **Step 3: Write `backend/src/lib/mailer.ts`**

```ts
import { BrevoClient } from "@getbrevo/brevo";
import { env } from "../config/env.js";
import { logger } from "./logger.js";
import type { OtpPurpose } from "../models/otpCode.model.js";
import { renderOtpEmail } from "./emailTemplates.js";

/**
 * Lazy, for the same reason getCloudinary() is lazy: constructing this at module
 * scope calls env() at import time, which forces full config validation before
 * tests/setup.ts has populated process.env. That broke the health tests once
 * already — see the cloudinary fix in Phase 1A.
 */
let client: BrevoClient | undefined;
function brevo(): BrevoClient {
  client ??= new BrevoClient({ apiKey: env().BREVO_API_KEY, maxRetries: 2 });
  return client;
}

/** Test seam. Replaced wholesale in tests so no test ever opens a socket. */
export interface Mailer {
  send(to: string, subject: string, html: string, text: string): Promise<void>;
}

const brevoMailer: Mailer = {
  async send(to, subject, html, text) {
    await brevo().transactionalEmails.sendTransacEmail({
      sender: { email: env().BREVO_SENDER_EMAIL, name: env().BREVO_SENDER_NAME },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    });
  },
};

let active: Mailer = brevoMailer;
export function setMailer(next: Mailer): void {
  active = next;
}
export function resetMailer(): void {
  active = brevoMailer;
}

/**
 * Fire-and-forget with logged failure.
 *
 * Deliberate, and load-bearing for two separate reasons:
 *
 * 1. Timing. forgot-password must take the same wall-clock time whether or not
 *    the address exists. Awaiting a 50-300ms Brevo call on the exists branch and
 *    returning immediately on the absent branch reproduces the enumeration oracle
 *    that the uniform 200 was meant to close.
 * 2. Availability. A Brevo outage must not fail registration. The account persists
 *    unverified and the user can request another code.
 */
export function dispatch(work: Promise<void>): void {
  void work.catch((error: unknown) => {
    logger.error({ err: error }, "transactional email failed");
  });
}

export async function sendOtpEmail(to: string, code: string, purpose: OtpPurpose): Promise<void> {
  const { subject, html, text } = renderOtpEmail(code, purpose, env().OTP_TTL_MINUTES);
  await active.send(to, subject, html, text);
}

export async function sendRendered(to: string, r: { subject: string; html: string; text: string }): Promise<void> {
  await active.send(to, r.subject, r.html, r.text);
}
```

> **Never log the code.** `logger.error({ err })` on a failed send is safe; adding
> the OTP to that log line would put a live credential in the log store, which is
> exactly the exposure the peppered hash in Task 3 exists to prevent.

- [ ] **Step 4: Write `backend/tests/auth/mailer.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";
import { renderOtpEmail } from "../../src/lib/emailTemplates.js";
import { dispatch } from "../../src/lib/mailer.js";

describe("email templates", () => {
  it("puts the code in both the html and text bodies", () => {
    const r = renderOtpEmail("012345", "verify_email", 10);
    expect(r.html).toContain("012345");
    expect(r.text).toContain("012345");
    expect(r.subject).toMatch(/confirm/i);
  });

  it("tells a reset recipient their password has not changed yet", () => {
    const r = renderOtpEmail("012345", "reset_password", 10);
    expect(r.text).toMatch(/has not changed/i);
  });
});

describe("dispatch", () => {
  it("swallows a rejection so the request path cannot fail on a mail outage", async () => {
    expect(() => dispatch(Promise.reject(new Error("brevo down")))).not.toThrow();
    await new Promise((r) => setImmediate(r));
  });
});
```

- [ ] **Step 5: Verify and commit**

```bash
npm test --workspace @jobportal/api -- mailer
git add backend/src/lib backend/tests/auth backend/package.json package-lock.json
git commit -m "feat(api): add Brevo transactional mailer behind a test seam"
```

---

### Task 5: Cookies and session issuance

The cookie layer is where two of the review's findings live: the unimplementable
wildcard path, and the refresh handler that trusted the URL over the database.

**Files:**
- Create: `backend/src/lib/cookies.ts`, `backend/src/services/session.service.ts`
- Create: `backend/tests/auth/session.test.ts`

**Interfaces:**
- Consumes: `RefreshToken` model (Task 2), `accessTokenKey`/`hashRefreshToken` (Task 3 `lib/keys.ts`), `mintCsrfToken` (Task 3 `lib/csrfToken.ts`)
- Produces: `issueSession(res, req, subjectId, portal, familyId?)`, `rotateSession(res, req, presented)`, `verifyAccessToken(token, portal)`, `revokeFamily(familyId)`, `revokeAllForSubject(subjectId, portal)`, `endSession(res, portal, presented)`, cookie helpers incl. `csrfCookieName()`

- [ ] **Step 1: Write `backend/src/lib/cookies.ts`**

```ts
import type { CookieOptions, Response } from "express";
import type { Portal } from "@jobportal/shared";
import { env } from "../config/env.js";

/**
 * `__Host-` is applied only when the cookie is Secure, because the browser
 * rejects a `__Host-` cookie without it — over plain HTTP in local development
 * the prefixed cookie would simply never be stored. The prefix is therefore
 * assembled from config rather than hardcoded into the name.
 *
 * This is not a weakening of the guardrail in CLAUDE.md: `secure`, `httpOnly`
 * and `sameSite` are unchanged in every environment. Only the name differs.
 */
function prefixed(base: string): string {
  return isSecure() ? `__Host-${base}` : base;
}

function isSecure(): boolean {
  return env().NODE_ENV === "production";
}

export function accessCookieName(portal: Portal): string {
  return prefixed(`jp_${portal}_at`);
}

export function refreshCookieName(portal: Portal): string {
  return prefixed(`jp_${portal}_rt`);
}

export const CSRF_COOKIE = "jp_csrf";

/**
 * The name the CSRF cookie is actually stored under. Anything that READS the
 * cookie must use this — in production the browser holds `__Host-jp_csrf`,
 * and reading the bare name there matches nothing.
 */
export function csrfCookieName(): string {
  return prefixed(CSRF_COOKIE);
}

/**
 * Note the absence of `domain` and the hardcoded `path: "/"`. Both are mandatory
 * for `__Host-`, and keeping them identical in development means a cookie bug
 * cannot hide until production. COOKIE_DOMAIN is deliberately not consulted here.
 */
function base(): CookieOptions {
  return {
    httpOnly: true,
    secure: isSecure(),
    sameSite: env().COOKIE_SAMESITE,
    path: "/",
  };
}

export function setAccessCookie(res: Response, portal: Portal, token: string): void {
  res.cookie(accessCookieName(portal), token, { ...base(), maxAge: env().ACCESS_TOKEN_TTL_MINUTES * 60_000 });
}

export function setRefreshCookie(res: Response, portal: Portal, token: string): void {
  res.cookie(refreshCookieName(portal), token, { ...base(), maxAge: env().REFRESH_TOKEN_TTL_DAYS * 86_400_000 });
}

/** Readable by design — the client must echo it in a header. */
export function setCsrfCookie(res: Response, token: string): void {
  res.cookie(csrfCookieName(), token, { ...base(), httpOnly: false });
}

/**
 * Cleared with the same attributes they were set with. The inherited logout sent
 * `cookie("token", "", { maxAge: 0 })` with no path, secure or sameSite; a cookie
 * whose attributes do not match is not overwritten, so in production the session
 * survived a logout.
 */
export function clearAuthCookies(res: Response, portal: Portal): void {
  const opts = base();
  res.clearCookie(accessCookieName(portal), opts);
  res.clearCookie(refreshCookieName(portal), opts);
  res.clearCookie(csrfCookieName(), { ...opts, httpOnly: false });
}
```

- [ ] **Step 2: Write `backend/src/services/session.service.ts`**

```ts
import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import type { Request, Response } from "express";
import type { Portal } from "@jobportal/shared";
import { RefreshToken } from "../models/refreshToken.model.js";
import { accessTokenKey, hashRefreshToken } from "../lib/keys.js";
import { mintCsrfToken } from "../lib/csrfToken.js";
import { setAccessCookie, setRefreshCookie, setCsrfCookie, clearAuthCookies } from "../lib/cookies.js";
import { AppError } from "../lib/AppError.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

export interface AccessClaims {
  sub: string;
  type: Portal;
  /**
   * Issued-at, in seconds. Not set by `signAccessToken` — `jsonwebtoken` adds it
   * automatically — but declared here because Task 6's `authenticate` and Task
   * 12's `bridgeAuth` both compare it against `sessionsInvalidatedAt` to honour
   * a session cull. Optional because it is absent from the object passed to
   * `jwt.sign`, present on every object that comes back from `jwt.verify`.
   */
  iat?: number;
}

/** Grace for a retried refresh on a flaky network. See the design note below. */
const REUSE_GRACE_MS = 5_000;

function signAccessToken(subjectId: string, portal: Portal): string {
  const claims: AccessClaims = { sub: subjectId, type: portal };
  return jwt.sign(claims, accessTokenKey(portal), {
    expiresIn: `${env().ACCESS_TOKEN_TTL_MINUTES}m`,
  });
}

export function verifyAccessToken(token: string, portal: Portal): AccessClaims {
  let decoded: unknown;
  try {
    decoded = jwt.verify(token, accessTokenKey(portal));
  } catch {
    throw AppError.unauthorized("SESSION_INVALID", "Your session has expired. Please sign in again.");
  }
  const claims = decoded as AccessClaims;
  // Redundant given the per-portal key — and kept anyway. Two independent checks
  // mean neither one silently becomes the only thing holding the boundary.
  if (claims.type !== portal) {
    throw AppError.unauthorized("SESSION_INVALID", "Your session has expired. Please sign in again.");
  }
  return claims;
}

interface Issued {
  csrfToken: string;
}

export async function issueSession(
  res: Response,
  req: Request,
  subjectId: Types.ObjectId,
  portal: Portal,
  familyId?: Types.ObjectId,
): Promise<Issued> {
  const raw = randomBytes(32).toString("base64url");
  const family = familyId ?? new Types.ObjectId();

  await RefreshToken.create({
    tokenHash: hashRefreshToken(raw),
    subjectId,
    subjectType: portal,
    familyId: family,
    userAgent: req.get("user-agent")?.slice(0, 256) ?? null,
    ip: req.ip ?? null,
    expiresAt: new Date(Date.now() + env().REFRESH_TOKEN_TTL_DAYS * 86_400_000),
  });

  const csrfToken = mintCsrfToken();
  setAccessCookie(res, portal, signAccessToken(String(subjectId), portal));
  setRefreshCookie(res, portal, raw);
  setCsrfCookie(res, csrfToken);
  return { csrfToken };
}

export interface Rotated extends Issued {
  subjectId: Types.ObjectId;
  portal: Portal;
}

/**
 * Rotation. The portal is read off the stored row, never from the mount path the
 * request arrived on — see the ADR-0005 amendment. A caller that passed its own
 * portal in would reintroduce the escalation: a seeker's refresh cookie presented
 * at the recruiter mount minting a recruiter session.
 */
export async function rotateSession(res: Response, req: Request, presented: string): Promise<Rotated> {
  const tokenHash = hashRefreshToken(presented);

  // Atomic claim. A read-then-write loses the race between two concurrent
  // refreshes and mints two live tokens from one row.
  const row = await RefreshToken.findOneAndUpdate(
    { tokenHash, revokedAt: null, replacedBy: null, expiresAt: { $gt: new Date() } },
    { $set: { revokedAt: new Date() } },
    { new: false },
  );

  if (!row) {
    await handleMiss(tokenHash);
    throw AppError.unauthorized("SESSION_INVALID", "Your session has expired. Please sign in again.");
  }

  const portal = row.subjectType as Portal;
  const issued = await issueSession(res, req, row.subjectId, portal, row.familyId);

  const replacement = await RefreshToken.findOne({ familyId: row.familyId, replacedBy: null, revokedAt: null })
    .sort({ createdAt: -1 })
    .select("_id");
  if (replacement) {
    await RefreshToken.updateOne({ _id: row._id }, { $set: { replacedBy: replacement._id } });
  }

  return { ...issued, subjectId: row.subjectId, portal };
}

/**
 * A miss is either a token we have never seen (nothing to do) or a token that was
 * already rotated. The second case means two parties hold the same token, so the
 * family is compromised and every session in it dies.
 *
 * The grace window exists because dropped responses and double-fired requests are
 * ordinary on mobile networks. A design that signs a user out of every device
 * because a refresh was retried will be worked around rather than kept — and the
 * window is narrow enough that a thief cannot rely on landing inside it.
 */
async function handleMiss(tokenHash: string): Promise<void> {
  const used = await RefreshToken.findOne({ tokenHash });
  if (!used) return;

  const age = Date.now() - (used.revokedAt?.getTime() ?? 0);
  if (used.replacedBy && age <= REUSE_GRACE_MS) {
    const replacement = await RefreshToken.findById(used.replacedBy).select("replacedBy revokedAt");
    if (replacement && !replacement.replacedBy && !replacement.revokedAt) {
      logger.warn({ familyId: String(used.familyId) }, "refresh retried inside grace window");
      return;
    }
  }

  logger.warn({ familyId: String(used.familyId) }, "refresh token reuse — revoking family");
  await revokeFamily(used.familyId);
}

export async function revokeFamily(familyId: Types.ObjectId): Promise<void> {
  await RefreshToken.updateMany({ familyId, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

export async function revokeAllForSubject(subjectId: Types.ObjectId, portal: Portal): Promise<void> {
  await RefreshToken.updateMany(
    { subjectId, subjectType: portal, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

export async function endSession(res: Response, portal: Portal, presented: string | undefined): Promise<void> {
  if (presented) {
    const row = await RefreshToken.findOne({ tokenHash: hashRefreshToken(presented) }).select("familyId");
    if (row) await revokeFamily(row.familyId);
  }
  clearAuthCookies(res, portal);
}
```

- [ ] **Step 3: Write `backend/tests/auth/session.test.ts`**

The four cases that matter:

```ts
import { describe, expect, it } from "vitest";
import { Types } from "mongoose";
import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { RefreshToken } from "../../src/models/refreshToken.model.js";
import { issueSession, rotateSession, verifyAccessToken } from "../../src/services/session.service.js";
import { hashRefreshToken, accessTokenKey } from "../../src/lib/keys.js";
import { refreshCookieName } from "../../src/lib/cookies.js";
import { AppError } from "../../src/lib/AppError.js";

/** First value of a named cookie across the response's Set-Cookie headers. */
function cookieValue(res: request.Response, name: string): string {
  const headers = res.headers["set-cookie"] as unknown as string[] | undefined;
  const match = (headers ?? []).find((h) => h.startsWith(`${name}=`));
  if (!match) throw new Error(`cookie ${name} not set`);
  // `?? match` rather than `!`: noUncheckedIndexedAccess makes `[0]` possibly
  // undefined, and a split on a non-empty string always yields at least one
  // element, so the fallback is unreachable rather than a real branch.
  const pair = match.split(";")[0] ?? match;
  return decodeURIComponent(pair.slice(name.length + 1));
}

function harness() {
  const app = express();
  app.use(cookieParser());
  app.post("/issue/:portal", async (req, res) => {
    const portal = req.params.portal as "seeker" | "recruiter";
    await issueSession(res, req, new Types.ObjectId(String(req.query.sub)), portal);
    res.json({ ok: true });
  });
  app.post("/rotate", async (req, res, next) => {
    try {
      const out = await rotateSession(res, req, String(req.query.token));
      res.json({ portal: out.portal });
    } catch (e) {
      next(e);
    }
  });
  return app;
}

describe("session", () => {
  it("stores only a hash of the refresh token", async () => {
    const app = harness();
    const sub = new Types.ObjectId();
    const res = await request(app).post("/issue/seeker").query({ sub: String(sub) });
    const raw = cookieValue(res, refreshCookieName("seeker"));
    const row = await RefreshToken.findOne({ subjectId: sub });
    expect(row?.tokenHash).toBe(hashRefreshToken(raw));
    expect(row?.tokenHash).not.toBe(raw);
  });

  it("derives the portal from the stored row, not the caller", async () => {
    const app = harness();
    const res = await request(app).post("/issue/seeker").query({ sub: String(new Types.ObjectId()) });
    const raw = cookieValue(res, refreshCookieName("seeker"));
    const rotated = await request(app).post("/rotate").query({ token: raw });
    // The rotate route knows nothing about portals. It must still come back seeker.
    expect(rotated.body.portal).toBe("seeker");
  });

  it("revokes the whole family when a rotated token is replayed after the grace window", async () => {
    const first = await issue("seeker");
    const rotated = await rotate(first.refresh);

    // Push the replaced row's revokedAt outside REUSE_GRACE_MS so the replay
    // reads as theft rather than as a retried request on a flaky network.
    const original = await RefreshToken.findOne({ tokenHash: hashRefreshToken(first.refresh) });
    await RefreshToken.updateOne(
      { _id: original!._id },
      { $set: { revokedAt: new Date(Date.now() - REUSE_GRACE_MS - 1_000) } },
    );

    const replay = await request(app).post(`/rotate?token=${encodeURIComponent(first.refresh)}`);
    expect(replay.status).toBe(401);

    // Not just the replayed row — every row in the family, including the
    // legitimate token the real user is still holding.
    const family = await RefreshToken.find({ familyId: original!.familyId });
    expect(family.length).toBeGreaterThanOrEqual(2);
    expect(family.every((row) => row.revokedAt !== null)).toBe(true);

    // And the good token is genuinely dead, not merely marked.
    const afterKill = await request(app).post(`/rotate?token=${encodeURIComponent(rotated.refresh)}`);
    expect(afterKill.status).toBe(401);
  });

  it("rejects a seeker access token against the recruiter portal on signature, not on a claim", () => {
    // Signed with the real seeker key and a DELIBERATELY LYING claim: the
    // token says type=recruiter, so if verification used a shared key and
    // only the claim check, this would pass. Only the per-portal signature
    // can reject it.
    const forged = jwt.sign({ sub: String(new Types.ObjectId()), type: "recruiter" }, accessTokenKey("seeker"), { expiresIn: "5m" });
    let thrown: unknown;
    try {
      verifyAccessToken(forged, "recruiter");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).code).toBe("SESSION_INVALID");
    // Sanity: an honestly-minted seeker token does verify on its own portal.
    const honest = jwt.sign({ sub: String(new Types.ObjectId()), type: "seeker" }, accessTokenKey("seeker"), { expiresIn: "5m" });
    expect(verifyAccessToken(honest, "seeker").type).toBe("seeker");
  });
});
```

The last two are the regression tests for the review's session findings. The
signature test is the one that would catch a future refactor collapsing the two
derived keys back into a single shared secret — write it even though the claim
check makes it pass twice over.

- [ ] **Step 4: Verify and commit**

```bash
npm test --workspace @jobportal/api -- session
npm run typecheck
git add backend/src/lib/cookies.ts backend/src/services backend/tests/auth
git commit -m "feat(api): add __Host- cookies and rotating refresh sessions"
```
---

### Task 6: Authentication and CSRF middleware

The guard layer. Small, and every route in the app ends up behind it.

**Files:**
- Create: `backend/src/services/account.service.ts` — *moved forward from Task 7, because `authenticate` consumes it and this task's gate is a green typecheck*
- Create: `backend/src/middleware/authenticate.ts`, `backend/src/middleware/csrf.ts`
- Modify: `backend/src/types/express.d.ts`
- Create: `backend/tests/auth/csrf.test.ts`

**Interfaces:**
- Consumes: `verifyAccessToken` (Task 5), Seeker/Recruiter models (Task 2), `verifyCsrfToken` (Task 3), `csrfCookieName` (Task 5)
- Produces: `authenticate(portal)`, `requireVerified`, `csrfProtection` — used by Task 10's router; `accountModel(portal)`, `findAccountByEmail(portal, email, opts?)`, `findAccountById(portal, id, opts?)`, `AccountDocument` — used by Tasks 7-12

- [ ] **Step 1: Augment the Express request**

Replace the `id?: string` field in `backend/src/types/express.d.ts`. Keep `requestId`.

```ts
import "express";
import type { Portal } from "@jobportal/shared";

declare global {
  namespace Express {
    interface Request {
      /**
       * Per-request correlation id, set by the `requestId` middleware.
       */
      requestId?: string;

      /**
       * Authenticated subject, set by `authenticate(portal)`.
       *
       * Replaces the previous bare `id?: string`. A string id could not express
       * *which collection* it came from, so every downstream check had to
       * remember the portal separately — and the one place that forgot was the
       * whole bug class Phase 1B exists to close.
       */
      auth?: {
        id: string;
        portal: Portal;
        emailVerified: boolean;
      };
    }
  }
}

export {};
```

Removing `req.id` breaks `updateProfile` and the three legacy controllers that read it. Leave `id?: string` in place *alongside* `auth`, with a comment marking it **kept until Phase 1C**: the Task 12 bridge keeps populating it for the legacy domain controllers, which survive this phase and are rebuilt in 1C. Removing it here would force a rewrite of code that phase deletes wholesale, and that is churn a reviewer has to read twice.

- [ ] **Step 1b: Write `backend/src/services/account.service.ts`**

The only module that knows both collections exist. Everything else takes a
`Portal` and calls through here. (This file was originally slated for Task 7;
it lives here because `authenticate` imports it, and every task must leave the
typecheck green.)

```ts
import type { Model } from "mongoose";
import type { Portal } from "@jobportal/shared";
import { Seeker, type SeekerDocument } from "../models/seeker.model.js";
import { Recruiter, type RecruiterDocument } from "../models/recruiter.model.js";

export type AccountDocument = SeekerDocument | RecruiterDocument;

/**
 * Resolves the portal to its collection.
 *
 * A `Record<Portal, Model>` rather than an `if` so that adding a third portal is
 * a compile error everywhere it needs handling, instead of a silently missing
 * branch.
 */
const MODELS = {
  seeker: Seeker,
  recruiter: Recruiter,
} as const;

export function accountModel(portal: Portal): Model<AccountDocument> {
  return MODELS[portal] as unknown as Model<AccountDocument>;
}

/**
 * `withSecret` is the only way to read `passwordHash`, which the schema marks
 * `select: false`. Exactly three call sites need it — login, password reset, and
 * Google identity resolution — and each is a credential comparison. A fourth is
 * a design question, not a one-line change.
 *
 * Nothing here is type-enforced: Mongoose types `passwordHash` as present
 * regardless of `select`, so forgetting the flag compiles and then fails at
 * runtime with `undefined`. That is why the flag is at the service boundary
 * rather than left to each caller's `.select()` — one place to grep, one place
 * to get wrong.
 */
type AccountReadOptions = { withSecret?: boolean };

export async function findAccountByEmail(
  portal: Portal,
  email: string,
  options: AccountReadOptions = {},
) {
  // `email` is lowercased by the schema on write; normalise on read too, or a
  // capitalised address silently registers twice.
  const query = accountModel(portal).findOne({ email: email.trim().toLowerCase() });
  return options.withSecret ? query.select("+passwordHash") : query;
}

export async function findAccountById(portal: Portal, id: string, options: AccountReadOptions = {}) {
  const query = accountModel(portal).findById(id);
  return options.withSecret ? query.select("+passwordHash") : query;
}
```

- [ ] **Step 2: Write `backend/src/middleware/authenticate.ts`**

```ts
import type { NextFunction, Request, Response } from "express";
import type { Portal } from "@jobportal/shared";
import { AppError } from "../lib/AppError.js";
import { accessCookieName } from "../lib/cookies.js";
import { verifyAccessToken } from "../services/session.service.js";
import { findAccountById } from "../services/account.service.js";

/**
 * Verifies the access token for exactly one portal.
 *
 * `portal` is supplied by the route mount as a literal, never read from the
 * request. The token is verified with that portal's derived key, so a seeker
 * token presented here fails the signature check before any claim is inspected.
 */
export function authenticate(portal: Portal) {
  return async function authenticateMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    const token = req.cookies?.[accessCookieName(portal)] as string | undefined;
    if (!token) {
      next(AppError.unauthorized("SESSION_MISSING", "Sign in to continue."));
      return;
    }

    // Throws AppError SESSION_INVALID on a bad signature, wrong portal key,
    // expired token, or a `type` claim that disagrees with `portal`.
    const claims = verifyAccessToken(token, portal);

    const account = await findAccountById(portal, claims.sub);
    if (!account || account.status !== "active") {
      // Deleted or suspended between minting and use. Same code as a bad token:
      // a suspended user learning that they are suspended from a 403 on every
      // route is worse than a uniform "sign in again".
      next(AppError.unauthorized("SESSION_INVALID", "Sign in to continue."));
      return;
    }

    // Access-token revocation. `iat` is seconds; the cutoff is milliseconds.
    // Both are floored to the second before comparing, and the comparison is
    // strict — a token minted in the *same second* as the invalidation survives.
    //
    // That 1-second window is deliberate. Without the floor, resetting a
    // password at 10:00:00.500 and issuing the replacement session at
    // 10:00:00.700 produces a token whose iat floors to 10:00:00.000, which is
    // < the cutoff — so the user is instantly logged out of the session the
    // reset just gave them, and logging in again reproduces it. A one-second
    // overlap is a far better trade than an unusable reset flow.
    const cutoff = account.sessionsInvalidatedAt;
    if (cutoff && claims.iat !== undefined) {
      const cutoffSecond = Math.floor(cutoff.getTime() / 1000);
      if (claims.iat < cutoffSecond) {
        next(AppError.unauthorized("SESSION_INVALID", "Sign in to continue."));
        return;
      }
    }

    req.auth = {
      id: String(account._id),
      portal,
      emailVerified: account.emailVerifiedAt !== null,
    };
    next();
  };
}

/**
 * Rejects accounts that have not confirmed their email.
 *
 * Mounted after `authenticate`, and deliberately *not* on the resend-code or
 * profile-read routes — an unverified user has to be able to reach the thing
 * that lets them become verified.
 */
export function requireVerified(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) {
    next(AppError.unauthorized("SESSION_MISSING", "Sign in to continue."));
    return;
  }
  if (!req.auth.emailVerified) {
    next(AppError.forbidden("EMAIL_NOT_VERIFIED", "Confirm your email address to continue."));
    return;
  }
  next();
}
```

`verifyAccessToken` returns `iat` — Task 5 declares it as an optional field on `AccessClaims` for exactly this reason. It is optional in the type because `signAccessToken` does not set it (`jsonwebtoken` adds it automatically), so every verified token has it and the compiler still makes you handle its absence. That is why the comparison below is guarded rather than direct.

- [ ] **Step 3: Write `backend/src/middleware/csrf.ts`**

```ts
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/AppError.js";
import { verifyCsrfToken } from "../lib/csrfToken.js";
import { csrfCookieName } from "../lib/cookies.js";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Double-submit CSRF check, on every unsafe method.
 *
 * The cookie is readable by JavaScript on purpose — that is what lets our own
 * client echo it into the header. Its integrity comes from the embedded MAC, not
 * from secrecy: an attacker who can *write* cookies (an insecure sibling origin,
 * a compromised subdomain) can set a cookie and send a matching header, which
 * defeats plain double-submit. They cannot forge the MAC.
 */
export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE.has(req.method)) {
    next();
    return;
  }

  // csrfCookieName(), not the bare constant: in production the cookie is
  // stored as `__Host-jp_csrf`, and reading `jp_csrf` there matches nothing —
  // every mutation would 403 in production only.
  const cookie = req.cookies?.[csrfCookieName()] as string | undefined;
  const header = req.get("x-csrf-token");

  if (!cookie || !header || !verifyCsrfToken(cookie) || cookie !== header) {
    next(AppError.forbidden("CSRF_INVALID", "Request could not be verified. Reload and try again."));
    return;
  }
  next();
}
```

**Which routes skip it, and why.** `login`, `register`, `forgot-password` and the
Google entry point run *before* any session exists, so there is no session for an
attacker to abuse — CSRF on an unauthenticated endpoint protects nothing. `refresh`
does **not** skip it: it acts on a cookie the browser sends automatically, which is
the textbook CSRF target. The Google **callback** must skip it, because it is a
top-level navigation Google initiates and no header can be attached to it — its
protection is the signed transaction cookie and `state` (Task 9), not this.

- [ ] **Step 4: Write `backend/tests/auth/csrf.test.ts`**

```ts
// Cases, all against a throwaway app that mounts csrfProtection on POST /x:
//
//   GET  /x  with no cookie and no header        → 200  (safe method)
//   POST /x  with no cookie and no header        → 403 CSRF_INVALID
//   POST /x  cookie only                         → 403
//   POST /x  header only                         → 403
//   POST /x  matching cookie+header, valid MAC    → 200
//   POST /x  matching cookie+header, forged MAC   → 403  ← the important one
//   POST /x  valid cookie, header from a *different* valid token → 403
```

The forged-MAC case is what separates this from plain double-submit. If it passes
when it should fail, `verifyCsrfToken` is not being called before the comparison.

- [ ] **Step 5: Verify and commit**

```bash
npm test --workspace @jobportal/api -- csrf
npm run typecheck
git add backend/src/services/account.service.ts backend/src/middleware/authenticate.ts backend/src/middleware/csrf.ts backend/src/types/express.d.ts backend/tests/auth/csrf.test.ts
git commit -m "feat(api): add portal-scoped authenticate and MAC-bound CSRF middleware"
```

---

### Task 7: Registration, resend, and email verification

The first end-to-end flow. Everything up to now was scaffolding.

**Files:**
- Create: `backend/src/services/auth.service.ts`, `backend/src/lib/validate.ts`
- Create: `backend/src/controllers/auth.controller.ts`
- Create: `backend/tests/auth/helpers.ts`, `backend/tests/auth/register.test.ts`, `backend/tests/auth/otp.test.ts`

**Interfaces:**
- Consumes: models (Task 2), crypto (Task 3), mailer (Task 4), `issueSession` (Task 5), `account.service` (Task 6)
- Produces: `register`/`verifyEmail`/`resendVerification` service functions, `toSessionUser(portal, account)`, `chargeOtpAttempt`/`clearOtpBudget`/`issueOtp` (module-internal, reused by Task 8), `parseBody(schema, body)`, `registerHandler(portal)`/`verifyEmailHandler(portal)`/`resendCodeHandler(portal)` for Task 10's router, and the shared test helpers in `tests/auth/helpers.ts`

- [ ] **Step 1: Confirm `account.service.ts` exists**

It was created in Task 6 (moved forward because `authenticate` imports it).
Nothing to write here — this step exists so nobody re-creates the file from an
older revision of this plan.

- [ ] **Step 2: Write the register flow in `backend/src/services/auth.service.ts`**

```ts
import { Types } from "mongoose";
import type { Portal, RegisterBody, SessionUser } from "@jobportal/shared";
import { AppError } from "../lib/AppError.js";
import { env } from "../config/env.js";
import { hashPassword } from "../lib/password.js";
import { generateOtp, hashOtp } from "../lib/otp.js";
import { dispatch, sendOtpEmail, sendRendered } from "../lib/mailer.js";
import { renderOtpBudgetEmail } from "../lib/emailTemplates.js";
import { OtpCode, type OtpPurpose } from "../models/otpCode.model.js";
import { OtpBudget } from "../models/otpBudget.model.js";
import { accountModel, findAccountByEmail, findAccountById, type AccountDocument } from "./account.service.js";

/**
 * Creates an unverified account and mails a code. Issues NO session.
 *
 * Ordering matters and is not the inherited order: existence is checked before
 * anything expensive happens. The old registration uploaded an avatar to
 * Cloudinary *first*, so an unauthenticated caller could burn storage quota
 * indefinitely by re-registering an address that already existed. There is no
 * file in this path at all now — avatars move to the profile screen, after
 * verification.
 */
export async function register(portal: Portal, input: RegisterBody): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const existing = await findAccountByEmail(portal, email);

  if (existing) {
    // Registration cannot hide existence — the user has to be told the address
    // is taken. What it must not do is leak anything *else*: not whether the
    // account is verified, not whether it has a password, not when it was made.
    throw AppError.conflict("EMAIL_TAKEN", "An account already exists for this email address.");
  }

  const passwordHash = await hashPassword(input.password);
  let account: AccountDocument;
  try {
    account = await accountModel(portal).create({
      email,
      fullName: input.fullName,
      phone: input.phone ?? null,
      passwordHash,
      emailVerifiedAt: null,
    });
  } catch (error) {
    // The findOne above is a fast path, not the guarantee — two concurrent
    // registrations both pass it. The unique email index is the guarantee;
    // translate its violation instead of letting it surface as a 500.
    if ((error as { code?: number }).code === 11000) {
      throw AppError.conflict("EMAIL_TAKEN", "An account already exists for this email address.");
    }
    throw error;
  }

  await issueOtp(portal, account, "verify_email");
}

/**
 * Mints a code, stores its peppered hash, and sends it.
 *
 * Shared by register, resend, and forgot-password so the three cannot drift.
 * Rate limiting is the caller's job (Task 10) — this function is also called
 * from the migration script, which must not be throttled.
 */
async function issueOtp(portal: Portal, account: AccountDocument, purpose: OtpPurpose): Promise<void> {
  const code = generateOtp();

  // Supersede any live code for this subject+purpose. Without this, every
  // resend leaves another independently-guessable code alive for its full TTL,
  // which multiplies the attacker's per-hour attempts by the number of resends
  // they trigger.
  await OtpCode.updateMany(
    { subjectId: account._id, subjectType: portal, purpose, consumedAt: null },
    { $set: { consumedAt: new Date() } },
  );

  await OtpCode.create({
    codeHash: hashOtp(code, account._id),
    purpose,
    subjectId: account._id,
    subjectType: portal,
    attempts: 0,
    expiresAt: new Date(Date.now() + env().OTP_TTL_MINUTES * 60_000),
  });

  // Mail last, and ENQUEUED rather than awaited — dispatch() is Task 4's
  // fire-and-forget. Two reasons. Ordering: a Brevo failure after the store
  // leaves a consistent database (account exists unverified, resend recovers),
  // whereas mailing first and failing to store hands the user a code that can
  // never work. Availability and timing: awaiting the send would let a Brevo
  // outage fail registration, and would make forgot-password's response time
  // reveal whether an address exists (Task 8 reuses this function on both of
  // its branches).
  dispatch(sendOtpEmail(account.email, code, purpose));
}
```

- [ ] **Step 3: Write the redemption flow**

This is the function the review's critical finding is about. Read the comment
before changing anything in it.

```ts
/**
 * Redeems a verify_email code and issues a session.
 *
 * `email` selects WHICH HASH TO COMPUTE. It never selects which account to
 * mutate. Those are different things, and conflating them was the design's
 * pre-auth account-takeover hole: validating the code against any matching row
 * while writing to the account named in the body let an attacker redeem their
 * own code against a stranger's account.
 *
 * The account mutated below is `otp.subjectId` — read off the row the atomic
 * update just matched. If the caller's email belongs to a different account,
 * the computed hash simply does not match and the request fails; there is no
 * path by which the two can disagree and the write still land.
 */
export async function verifyEmail(portal: Portal, email: string, code: string) {
  const account = await findAccountByEmail(portal, email);

  // Absent account: do the same work and fail identically. Skipping straight to
  // the error here would make response time an existence oracle.
  const subjectId = account?._id ?? new Types.ObjectId();

  // Charge the cumulative budget BEFORE looking anything up, atomically
  // (Step 4). Wrong guesses can never increment the per-code `attempts`
  // counter — a wrong code hashes to a digest that matches no row — so this
  // charge is the only thing that meters brute force. It is refunded by
  // clearOtpBudget on success.
  await chargeOtpAttempt(portal, subjectId, "verify_email");

  const otp = await OtpCode.findOneAndUpdate(
    {
      codeHash: hashOtp(code, subjectId),
      purpose: "verify_email",
      subjectType: portal,          // a seeker code cannot redeem on the recruiter mount
      subjectId,                     // redundant with the subject-bound hash, and kept anyway
      consumedAt: null,
      expiresAt: { $gt: new Date() },
      // Meters the CORRECT code only (see above); kept as a backstop against
      // pathological replay of a known-good code before consumption lands.
      attempts: { $lt: env().OTP_MAX_ATTEMPTS },
    },
    { $inc: { attempts: 1 } },       // increment in the SAME operation that matches
    { new: true },
  );

  if (!otp) {
    throw AppError.badRequest("OTP_INVALID", "That code is incorrect or has expired.");
  }

  // Single-use, enforced by a guarded write rather than a read. Two concurrent
  // requests with the same correct code both match above; only one wins here.
  const claimed = await OtpCode.findOneAndUpdate(
    { _id: otp._id, consumedAt: null },
    { $set: { consumedAt: new Date() } },
  );
  if (!claimed) {
    throw AppError.badRequest("OTP_INVALID", "That code is incorrect or has expired.");
  }

  const target = await accountModel(portal).findByIdAndUpdate(
    otp.subjectId,               // <-- the account comes from HERE. Never from `email`.
    { $set: { emailVerifiedAt: new Date() }, $unset: { failedLoginCount: "" } },
    { new: true },
  );
  if (!target) throw AppError.badRequest("OTP_INVALID", "That code is incorrect or has expired.");

  await clearOtpBudget(portal, otp.subjectId, "verify_email");
  return target;
}
```

- [ ] **Step 4: Write the cumulative budget helpers**

The budget is charged with a single atomic increment-and-check, not a
read-then-decide. A separate `assert` followed by a later `record` re-creates
the exact concurrency bug the per-code counter fixed: fifty parallel guesses
all read `failures < 20` before any of them has written, and all fifty
proceed. Charging first, atomically, bounds honoured guesses at the budget no
matter the parallelism — and a successful redemption refunds the whole budget
by deleting the row, so legitimate users never accumulate toward the limit.

```ts
/**
 * Per-account, per-purpose failure budget that OUTLIVES individual codes.
 *
 * The per-code cap of 5 cannot meter brute force at all here: a wrong guess
 * hashes to a digest that matches no row, so no row's counter moves. And even
 * a located row resets on resend — a fresh code arrives with attempts:0.
 * Without this cumulative charge the real rate is ~15-20 guesses/hour
 * indefinitely — about 0.25% per account-week, which against a breach list of
 * 10,000 addresses is roughly 25 takeovers a week with no per-account signal
 * ever tripping. This document is what survives new codes.
 *
 * Every redemption attempt pre-pays one failure; success deletes the row.
 * Throws OTP_BUDGET_EXHAUSTED once the window's budget is spent.
 */
async function chargeOtpAttempt(
  portal: Portal,
  subjectId: Types.ObjectId,
  purpose: OtpPurpose,
): Promise<void> {
  const windowMs = env().OTP_BUDGET_WINDOW_HOURS * 3_600_000;
  const now = new Date();

  const charge = () =>
    OtpBudget.findOneAndUpdate(
      { subjectId, subjectType: portal, purpose },
      {
        $inc: { failures: 1 },
        // The window is fixed from first failure, not sliding — a sliding
        // window that each failure extends would let an attacker who has
        // already blown the budget keep the victim locked out of their own
        // recovery forever. $setOnInsert only, never $set.
        $setOnInsert: {
          windowStartedAt: now,
          expiresAt: new Date(now.getTime() + windowMs),
        },
      },
      { upsert: true, new: true },
    );

  let row;
  try {
    row = await charge();
  } catch (error) {
    // Two concurrent first-attempts can race the upsert on the unique
    // (subjectId, subjectType, purpose) index; the loser gets E11000. The row
    // exists now, so retrying once takes the plain-update path.
    if ((error as { code?: number }).code !== 11000) throw error;
    row = await charge();
  }

  const max = env().OTP_BUDGET_MAX_FAILURES;
  if (row.failures > max) {
    // Exactly-once notification, at the crossing. Blocks REDEMPTION only —
    // password login is untouched, so an attacker burning a victim's budget
    // degrades recovery, never the account. See the Task 3 design note.
    if (row.failures === max + 1) {
      const owner = await findAccountById(portal, String(subjectId));
      if (owner) {
        dispatch(sendRendered(owner.email, renderOtpBudgetEmail(env().OTP_BUDGET_WINDOW_HOURS)));
      }
    }
    throw AppError.tooManyRequests(
      "OTP_BUDGET_EXHAUSTED",
      "Too many incorrect codes. Try again later or contact support.",
    );
  }
}

/** Refund on success: any correct redemption proves the owner has control. */
async function clearOtpBudget(
  portal: Portal,
  subjectId: Types.ObjectId,
  purpose: OtpPurpose,
): Promise<void> {
  await OtpBudget.deleteOne({ subjectId, subjectType: portal, purpose });
}
```

Also add the resend flow and the ghost write it shares with Task 8's
forgot-password, in the same file:

```ts
/**
 * Uniform 200 whether the address is unknown, unverified, or already verified
 * — and uniform WORK on every branch, or this endpoint is a free existence
 * probe. The ghost write costs the same database round-trips as the real one.
 */
export async function resendVerification(portal: Portal, email: string): Promise<void> {
  const account = await findAccountByEmail(portal, email);
  if (account && account.emailVerifiedAt === null) {
    await issueOtp(portal, account, "verify_email");
    return;
  }
  await writeGhostOtp(portal, "verify_email");
}

/**
 * issueOtp's exact database work against a subject id that cannot exist.
 * Nothing can ever redeem the row (the ghost ObjectId resolves to no account,
 * and the digest is bound to it); the TTL index removes it within the hour.
 * Shared with forgot-password in Task 8.
 */
async function writeGhostOtp(portal: Portal, purpose: OtpPurpose): Promise<void> {
  const code = generateOtp();
  const ghost = new Types.ObjectId();
  await OtpCode.updateMany(
    { subjectId: ghost, subjectType: portal, purpose, consumedAt: null },
    { $set: { consumedAt: new Date() } },
  );
  await OtpCode.create({
    codeHash: hashOtp(code, ghost),
    purpose,
    subjectId: ghost,
    subjectType: portal,
    attempts: 0,
    expiresAt: new Date(Date.now() + env().OTP_TTL_MINUTES * 60_000),
  });
}
```

- [ ] **Step 4b: Write `backend/src/lib/validate.ts` and the session DTO mapper**

```ts
// backend/src/lib/validate.ts
import type { ZodType } from "zod";
import { AppError } from "./AppError.js";

/**
 * safeParse + AppError instead of letting a ZodError fly: the error middleware
 * only speaks AppError, so a raw ZodError would surface as a 500 with schema
 * internals in the log, where a 400 envelope belongs.
 */
export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw AppError.badRequest("VALIDATION_ERROR", "Request validation failed.", result.error.issues);
  }
  return result.data;
}
```

And in `auth.service.ts`:

```ts
/**
 * The ONLY projection from an account document to the wire. Field-by-field on
 * purpose — a spread would leak whatever the schema grows next. This is the
 * function that makes `getApplicants`-style hash leaks structurally impossible
 * on the new surface.
 */
export function toSessionUser(portal: Portal, account: AccountDocument): SessionUser {
  return {
    id: String(account._id),
    portal,
    fullName: account.fullName,
    email: account.email,
    emailVerified: account.emailVerifiedAt !== null,
    avatarUrl: account.avatarUrl ?? null,
  };
}
```

- [ ] **Step 4c: Write `backend/src/controllers/auth.controller.ts`**

```ts
import type { RequestHandler } from "express";
import {
  registerBodySchema,
  resendVerificationBodySchema,
  verifyEmailBodySchema,
  type Portal,
} from "@jobportal/shared";
import { parseBody } from "../lib/validate.js";
import { issueSession } from "../services/session.service.js";
import * as auth from "../services/auth.service.js";

/**
 * Every handler is a factory taking the portal as a server-side literal from
 * the mount (Task 10 passes it when building the router). Nothing in this file
 * reads a portal, a role, or an account id from the request payload.
 */
export function registerHandler(portal: Portal): RequestHandler {
  return async (req, res) => {
    const body = parseBody(registerBodySchema, req.body);
    await auth.register(portal, body);
    res.status(201).json({
      success: true,
      message: "Account created. Enter the code we just emailed you.",
    });
  };
}

export function verifyEmailHandler(portal: Portal): RequestHandler {
  return async (req, res) => {
    const { email, code } = parseBody(verifyEmailBodySchema, req.body);
    const account = await auth.verifyEmail(portal, email, code);
    await issueSession(res, req, account._id, portal);
    res.json({ success: true, user: auth.toSessionUser(portal, account) });
  };
}

export function resendCodeHandler(portal: Portal): RequestHandler {
  return async (req, res) => {
    const { email } = parseBody(resendVerificationBodySchema, req.body);
    await auth.resendVerification(portal, email);
    res.json({
      success: true,
      message: "If that address has an unverified account, a new code is on its way.",
    });
  };
}
```

- [ ] **Step 4d: Write `backend/tests/auth/helpers.ts`**

Shared by every route-level auth test from here to Task 12. The harness mounts
controller handlers at the real paths *without* the rate limiters — those
arrive with the real router in Task 10 and are tested there — so flow tests
here never fight a limiter.

```ts
import express, { Router, type Express } from "express";
import cookieParser from "cookie-parser";
import type { Response as SupertestResponse } from "supertest";
import { vi } from "vitest";
import type { Portal } from "@jobportal/shared";
import { setMailer } from "../../src/lib/mailer.js";
import { errorHandler } from "../../src/middleware/error.js";
import { notFound } from "../../src/middleware/notFound.js";

export interface CapturedMail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export const outbox: CapturedMail[] = [];

/**
 * Install a mailer that records instead of sending; truncates the outbox.
 * Call from beforeEach. No test in this suite may ever open a socket to Brevo
 * — CI has no key and the suite must run offline.
 */
export function installCaptureMailer(): void {
  outbox.length = 0;
  setMailer({
    async send(to, subject, html, text) {
      outbox.push({ to, subject, html, text });
    },
  });
}

/**
 * The most recent 6-digit code mailed to `email`. Polled with vi.waitFor
 * because sends are dispatch()ed fire-and-forget — the HTTP response usually
 * lands before the capture does.
 */
export function lastCodeFor(email: string): Promise<string> {
  return vi.waitFor(() => {
    const mail = [...outbox].reverse().find((m) => m.to === email && /\b\d{6}\b/.test(m.text));
    if (!mail) throw new Error(`no code mailed to ${email} yet`);
    // Extracted rather than `exec(...)![1]`: under noUncheckedIndexedAccess the
    // `!` removes the null from `exec` but NOT the undefined from `[1]`, so the
    // terser version does not satisfy `Promise<string>`. Throwing inside
    // vi.waitFor also just retries, which is the behaviour we want anyway.
    const code = /\b(\d{6})\b/.exec(mail.text)?.[1];
    if (!code) throw new Error(`mail to ${email} has no 6-digit code`);
    return code;
  });
}

/**
 * Minimal app hosting exactly the handlers a test mounts, at the REAL paths.
 * The mount callback runs once per portal, so cross-portal cases need no
 * extra setup.
 */
export function authTestApp(mount: (portal: Portal, router: Router) => void): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  for (const portal of ["seeker", "recruiter"] as const) {
    const router = Router();
    mount(portal, router);
    app.use(`/api/v1/${portal}/auth`, router);
  }
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

/**
 * First value of a named cookie across a response's Set-Cookie headers.
 *
 * The `?? match` and `?? ""` fallbacks below are there because
 * `noUncheckedIndexedAccess` is on (tsconfig.base.json) and makes every `[0]`
 * possibly-undefined. `String.split` always returns at least one element, so
 * neither fallback is reachable — but `!` would be a lie the next reader has to
 * re-derive, and these are three characters.
 */
export function cookieValue(res: SupertestResponse, name: string): string | undefined {
  const headers = res.headers["set-cookie"] as unknown as string[] | undefined;
  const match = (headers ?? []).find((h) => h.startsWith(`${name}=`));
  if (!match) return undefined;
  const pair = match.split(";")[0] ?? match;
  return decodeURIComponent(pair.slice(name.length + 1));
}

/** All cookie NAMES set on a response — for the portal-isolation assertions. */
export function setCookieNames(res: SupertestResponse): string[] {
  const headers = res.headers["set-cookie"] as unknown as string[] | undefined;
  return (headers ?? []).map((h) => h.split("=")[0] ?? "");
}

/**
 * The `token=` query value from the most recent mail whose subject matches.
 * Used by Task 9's step-up tests; here so both of them share one extractor and
 * one narrowing.
 */
export function linkTokenFor(email: string, subjectPattern: RegExp): string {
  const mail = [...outbox].reverse().find((m) => m.to === email && subjectPattern.test(m.subject));
  if (!mail) throw new Error(`no matching mail to ${email}`);
  const raw = /token=([^\s&]+)/.exec(mail.text)?.[1];
  if (!raw) throw new Error(`mail to ${email} carries no token`);
  return decodeURIComponent(raw);
}
```

- [ ] **Step 5: Write `backend/tests/auth/register.test.ts` and `otp.test.ts`**

The regression suite for the two critical findings. Each case names the attack it
prevents, so nobody deletes one to make a refactor pass.

Both files share this prelude (adjust the import list per file):

```ts
import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { Portal } from "@jobportal/shared";
import { OtpCode } from "../../src/models/otpCode.model.js";
import {
  registerHandler,
  resendCodeHandler,
  verifyEmailHandler,
} from "../../src/controllers/auth.controller.js";
import { findAccountByEmail } from "../../src/services/account.service.js";
import { authTestApp, installCaptureMailer, lastCodeFor, setCookieNames } from "./helpers.js";

const app: Express = authTestApp((portal, r) => {
  r.post("/register", registerHandler(portal));
  r.post("/verify-email", verifyEmailHandler(portal));
  r.post("/resend-code", resendCodeHandler(portal));
});

beforeEach(installCaptureMailer);

const post = (url: string, body: object) => request(app).post(url).send(body);

async function registerAndCaptureCode(portal: Portal, email: string) {
  const res = await post(`/api/v1/${portal}/auth/register`, {
    fullName: "Test Person",
    email,
    password: "correct horse battery staple",
  });
  expect(res.status).toBe(201);
  return { code: await lastCodeFor(email) };
}

async function isVerified(portal: Portal, email: string): Promise<boolean> {
  const account = await findAccountByEmail(portal, email);
  return account?.emailVerifiedAt != null;
}

/** n distinct 6-digit strings, none equal to `code`. Deterministic. */
function wrongCodesExcluding(code: string, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; out.length < n; i += 1) {
    const candidate = String(i).padStart(6, "0");
    if (candidate !== code) out.push(candidate);
  }
  return out;
}
```

`register.test.ts` — the registration contract:

```ts
describe("register", () => {
  it("creates an unverified account, issues NO session, and leaks nothing", async () => {
    const res = await post("/api/v1/seeker/auth/register", {
      fullName: "Asha Rao",
      email: "asha@x.test",
      password: "correct horse battery staple",
    });
    expect(res.status).toBe(201);
    expect(setCookieNames(res)).toEqual([]);           // no session before verification
    expect(JSON.stringify(res.body)).not.toMatch(/\b\d{6}\b/);  // and never the code

    const account = await findAccountByEmail("seeker", "asha@x.test", { withSecret: true });
    expect(account?.emailVerifiedAt).toBeNull();
    expect(account?.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it("rejects a duplicate on the same portal but allows it on the other", async () => {
    await registerAndCaptureCode("seeker", "both@x.test");
    const dupe = await post("/api/v1/seeker/auth/register", {
      fullName: "Dup Person", email: "both@x.test", password: "correct horse battery staple",
    });
    expect(dupe.status).toBe(409);
    expect(dupe.body.code).toBe("EMAIL_TAKEN");

    const other = await post("/api/v1/recruiter/auth/register", {
      fullName: "Dup Person", email: "both@x.test", password: "correct horse battery staple",
    });
    expect(other.status).toBe(201);                    // one person, both portals — ADR-0001
  });

  it("rejects a short password with a 400 envelope, not a 500", async () => {
    const res = await post("/api/v1/seeker/auth/register", {
      fullName: "Shorty", email: "short@x.test", password: "elevenchars",
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("normalises the email so a capitalised copy cannot register twice", async () => {
    await registerAndCaptureCode("seeker", "case@x.test");
    const res = await post("/api/v1/seeker/auth/register", {
      fullName: "Case Two", email: "CASE@X.TEST", password: "correct horse battery staple",
    });
    expect(res.status).toBe(409);
  });
});
```

`otp.test.ts` — the redemption matrix:

```ts
describe("otp redemption", () => {
  it("does not let a code issued to A verify account B (same portal)", async () => {
    const { code: aCode } = await registerAndCaptureCode("seeker", "a@x.test");
    await registerAndCaptureCode("seeker", "b@x.test");
    // The attacker's own valid code, aimed at the victim's address.
    const res = await post("/api/v1/seeker/auth/verify-email", { email: "b@x.test", code: aCode });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("OTP_INVALID");
    expect(await isVerified("seeker", "b@x.test")).toBe(false);
  });

  it("does not let a seeker code redeem on the recruiter mount", async () => {
    const { code } = await registerAndCaptureCode("seeker", "dual@x.test");
    await registerAndCaptureCode("recruiter", "dual@x.test");   // same address, both portals
    const res = await post("/api/v1/recruiter/auth/verify-email", { email: "dual@x.test", code });
    expect(res.status).toBe(400);
    expect(await isVerified("recruiter", "dual@x.test")).toBe(false);
  });

  it("redeems the happy path exactly once and issues a session", async () => {
    const { code } = await registerAndCaptureCode("seeker", "happy@x.test");
    const first = await post("/api/v1/seeker/auth/verify-email", { email: "happy@x.test", code });
    expect(first.status).toBe(200);
    expect(first.body.user).toEqual({
      id: expect.any(String),
      portal: "seeker",
      fullName: "Test Person",
      email: "happy@x.test",
      emailVerified: true,
      avatarUrl: null,
    });                                   // exact shape — an extra key here is a leak
    expect(setCookieNames(first)).toEqual(
      expect.arrayContaining(["jp_seeker_at", "jp_seeker_rt", "jp_csrf"]),
    );
    // Replaying the consumed code fails.
    const replay = await post("/api/v1/seeker/auth/verify-email", { email: "happy@x.test", code });
    expect(replay.status).toBe(400);
  });

  it("answers an unknown email exactly like a wrong code", async () => {
    const res = await post("/api/v1/seeker/auth/verify-email", { email: "ghost@x.test", code: "123456" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("OTP_INVALID");
  });

  it("bounds honoured guesses by the atomic budget under 50-way concurrency", async () => {
    const { code } = await registerAndCaptureCode("seeker", "d@x.test");
    const wrong = wrongCodesExcluding(code, 50);
    const results = await Promise.all(
      wrong.map((c) => post("/api/v1/seeker/auth/verify-email", { email: "d@x.test", code: c })),
    );
    // A read-then-decide budget lets all 50 through; the atomic charge caps it.
    const honoured = results.filter((r) => r.status === 400).length;
    const refused = results.filter((r) => r.status === 429).length;
    expect(honoured).toBeLessThanOrEqual(20);          // OTP_BUDGET_MAX_FAILURES
    expect(honoured + refused).toBe(50);
    // Wrong guesses can never touch the per-code counter — the digest matches no row.
    const row = await OtpCode.findOne({ subjectType: "seeker", consumedAt: null });
    expect(row?.attempts).toBe(0);
    // The budget is spent, so even the CORRECT code is refused now.
    const res = await post("/api/v1/seeker/auth/verify-email", { email: "d@x.test", code });
    expect(res.status).toBe(429);
    expect(res.body.code).toBe("OTP_BUDGET_EXHAUSTED");
  });

  it("keeps counting failures across a resend, then emails the owner once", async () => {
    const { code } = await registerAndCaptureCode("seeker", "e@x.test");
    for (let i = 0; i < 10; i += 1) {
      await post("/api/v1/seeker/auth/verify-email", { email: "e@x.test", code: wrongCodesExcluding(code, 10)[i] });
    }
    await post("/api/v1/seeker/auth/resend-code", { email: "e@x.test" });   // fresh code, attempts:0
    for (let i = 10; i < 20; i += 1) {
      await post("/api/v1/seeker/auth/verify-email", { email: "e@x.test", code: wrongCodesExcluding(code, 20)[i] });
    }
    // 20 charges spent; the resend did NOT reset the meter.
    const over = await post("/api/v1/seeker/auth/verify-email", { email: "e@x.test", code: "000001" });
    expect(over.status).toBe(429);
    expect(over.body.code).toBe("OTP_BUDGET_EXHAUSTED");
    // The owner was told, exactly once.
    const { outbox } = await import("./helpers.js");
    expect(outbox.filter((m) => m.to === "e@x.test" && /paused/i.test(m.subject)).length).toBe(1);
  });

  it("only issues one live code per subject+purpose", async () => {
    const { code: first } = await registerAndCaptureCode("seeker", "s@x.test");
    await post("/api/v1/seeker/auth/resend-code", { email: "s@x.test" });
    const res = await post("/api/v1/seeker/auth/verify-email", { email: "s@x.test", code: first });
    expect(res.status).toBe(400);   // superseded by the resend
  });

  it("answers resend uniformly for unknown and already-verified addresses", async () => {
    const unknown = await post("/api/v1/seeker/auth/resend-code", { email: "nobody@x.test" });
    expect(unknown.status).toBe(200);
    const { code } = await registerAndCaptureCode("seeker", "v@x.test");
    await post("/api/v1/seeker/auth/verify-email", { email: "v@x.test", code });
    const verified = await post("/api/v1/seeker/auth/resend-code", { email: "v@x.test" });
    expect(verified.status).toBe(200);
    expect(verified.body).toEqual(unknown.body);       // byte-identical envelopes
  });

  it("stores no plaintext code and no email on the otp document", async () => {
    const { code } = await registerAndCaptureCode("seeker", "f@x.test");
    const raw = await OtpCode.findOne().lean();
    expect(JSON.stringify(raw)).not.toContain(code);
    expect(JSON.stringify(raw)).not.toContain("f@x.test");
  });
});
```

- [ ] **Step 6: Verify and commit**

```bash
npm test --workspace @jobportal/api -- otp
npm test --workspace @jobportal/api -- register
npm run typecheck
git add backend/src/services backend/src/controllers/auth.controller.ts backend/src/lib/validate.ts backend/tests/auth
git commit -m "feat(api): add registration and atomic subject-bound OTP verification"
```

---

### Task 8: Password login, lockout, logout, and password reset

The credential paths an attacker actually hammers. Everything here is shaped
by three invariants: uniform failures (one message, one status, one timing),
lockout that can never be weaponised against its own account, and reset as a
full session cull.

**Files:**
- Modify: `backend/src/services/auth.service.ts`, `backend/src/controllers/auth.controller.ts`
- Create: `backend/tests/auth/login.test.ts`, `backend/tests/auth/reset.test.ts`

**Interfaces:**
- Consumes: `verifyPassword`/`needsRehash`/`burnPasswordTime`/`hashPassword` (Task 3), `issueOtp`/`writeGhostOtp`/`chargeOtpAttempt`/`clearOtpBudget` (Task 7, same file), `issueSession`/`rotateSession`/`endSession`/`revokeAllForSubject` (Task 5), `authenticate` (Task 6, used by the test probe)
- Produces: `login(portal, email, password)`, `forgotPassword(portal, email)`, `resetPassword(portal, email, code, newPassword)` service functions; `loginHandler(portal)`, `logoutHandler(portal)`, `forgotPasswordHandler(portal)`, `resetPasswordHandler(portal)`, `refreshHandler(portal)`, `meHandler(portal)` controller factories — Task 10 mounts all of them

- [ ] **Step 1: Add the login flow to `backend/src/services/auth.service.ts`**

New imports at the top of the file:

```ts
import { burnPasswordTime, needsRehash, verifyPassword } from "../lib/password.js";
import { revokeAllForSubject } from "./session.service.js";
```

Then the flow. Read the ordering comments before rearranging anything — every
line's position is one of the review findings:

```ts
export async function login(portal: Portal, email: string, password: string): Promise<AccountDocument> {
  const account = await findAccountByEmail(portal, email, { withSecret: true });

  if (!account) {
    // Same Argon2 cost as the real branch, then the same error. Without the
    // burn, response time says which addresses exist.
    await burnPasswordTime(password);
    throw AppError.unauthorized("INVALID_CREDENTIALS", "Incorrect email or password.");
  }

  // ALWAYS verify before branching on lock state, so a locked account costs
  // the same time as a wrong password and the lock is not a timing oracle.
  // verifyPassword(_, null) burns a dummy verify for Google-only accounts, so
  // "this account has no password" is not an oracle either.
  const passwordOk = await verifyPassword(password, account.passwordHash);

  if (account.lockedUntil !== null && account.lockedUntil > new Date()) {
    // Uniform message even when the password was right: the lock IS the
    // backoff. A distinct "locked" response would confirm both that the
    // account exists and that guesses are landing. No counter increment
    // during the lock — the attacker cannot ratchet it further.
    throw AppError.unauthorized("INVALID_CREDENTIALS", "Incorrect email or password.");
  }

  if (!passwordOk) {
    await registerLoginFailure(portal, account._id);
    throw AppError.unauthorized("INVALID_CREDENTIALS", "Incorrect email or password.");
  }

  if (account.status !== "active") {
    // Suspended reads exactly like a bad credential — account state is not
    // for strangers. The owner finds out through support, not through probes.
    throw AppError.unauthorized("INVALID_CREDENTIALS", "Incorrect email or password.");
  }

  if (account.emailVerifiedAt === null) {
    // Security invariant 10: this distinct code is reachable ONLY here, after
    // passwordOk. A wrong password on an unverified account took the uniform
    // exit above, so login is not an existence-and-state oracle.
    throw AppError.forbidden("EMAIL_NOT_VERIFIED", "Confirm your email address to continue.");
  }

  // Success: clear counters, and transparently upgrade a legacy bcrypt hash.
  // Migrated accounts carry bcrypt (the migration has no plaintext to work
  // with); this is the only moment plaintext and account meet, so this is
  // where the upgrade happens (see needsRehash, Task 3).
  const updates: Record<string, unknown> = { failedLoginCount: 0, lockedUntil: null };
  if (needsRehash(account.passwordHash)) {
    updates.passwordHash = await hashPassword(password);
  }
  await accountModel(portal).updateOne({ _id: account._id }, { $set: updates });

  return account;
}

/**
 * Exponential backoff from the threshold, atomically counted, capped hard.
 * The cap is load-bearing: an uncapped lock is a denial-of-service primitive
 * — anyone who knows an address can keep that account locked forever with
 * wrong passwords. 5th failure locks 1 minute, doubling per failure to
 * LOGIN_LOCK_MAX_MINUTES (default 15), cleared entirely by one success.
 * Never keyed by IP (a corporate NAT shares one), never touching OTP paths.
 */
async function registerLoginFailure(portal: Portal, id: Types.ObjectId): Promise<void> {
  const updated = await accountModel(portal).findOneAndUpdate(
    { _id: id },
    { $inc: { failedLoginCount: 1 } },
    { new: true },
  );
  if (!updated) return;

  const over = updated.failedLoginCount - env().LOGIN_LOCK_THRESHOLD;
  if (over < 0) return;

  const minutes = Math.min(2 ** over, env().LOGIN_LOCK_MAX_MINUTES);
  await accountModel(portal).updateOne(
    { _id: id },
    { $set: { lockedUntil: new Date(Date.now() + minutes * 60_000) } },
  );
}
```

- [ ] **Step 2: Add forgot-password and reset-password to the same file**

```ts
/** Response-time floor for the enumeration-sensitive endpoints. */
const UNIFORM_FLOOR_MS = 250;

async function holdUntil(started: number, floorMs: number): Promise<void> {
  const remaining = started + floorMs - Date.now();
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
}

/**
 * Always 200, and the same work on both branches: a real account gets a real
 * OTP row and an ENQUEUED send; an absent address gets the ghost write and no
 * send. Neither branch awaits Brevo — dispatch() is fire-and-forget precisely
 * so the 50-300ms provider round-trip never shows up in the response time —
 * and the floor absorbs the residual skew. "Uniform in body" without this is
 * still an existence oracle; see the spec's hardening section.
 */
export async function forgotPassword(portal: Portal, email: string): Promise<void> {
  const started = Date.now();
  const account = await findAccountByEmail(portal, email);
  if (account) {
    await issueOtp(portal, account, "reset_password");
  } else {
    await writeGhostOtp(portal, "reset_password");
  }
  await holdUntil(started, UNIFORM_FLOOR_MS);
}

export async function resetPassword(
  portal: Portal,
  email: string,
  code: string,
  newPassword: string,
): Promise<void> {
  const account = await findAccountByEmail(portal, email);
  const subjectId = account?._id ?? new Types.ObjectId();

  // Atomic pre-charge, refunded on success — identical to verify-email.
  await chargeOtpAttempt(portal, subjectId, "reset_password");

  const otp = await OtpCode.findOneAndUpdate(
    {
      codeHash: hashOtp(code, subjectId),
      purpose: "reset_password",   // a verify_email code cannot rotate a credential
      subjectType: portal,
      subjectId,
      consumedAt: null,
      expiresAt: { $gt: new Date() },
      attempts: { $lt: env().OTP_MAX_ATTEMPTS },
    },
    { $inc: { attempts: 1 } },
    { new: true },
  );
  if (!otp) throw AppError.badRequest("OTP_INVALID", "That code is incorrect or has expired.");

  const claimed = await OtpCode.findOneAndUpdate(
    { _id: otp._id, consumedAt: null },
    { $set: { consumedAt: new Date() } },
  );
  if (!claimed) throw AppError.badRequest("OTP_INVALID", "That code is incorrect or has expired.");

  // The account comes from the ROW, never from `email` (invariant 1).
  // `withSecret` because the reuse check below is a credential comparison.
  const target = await findAccountById(portal, String(otp.subjectId), { withSecret: true });
  if (!target) throw AppError.badRequest("OTP_INVALID", "That code is incorrect or has expired.");

  // Reuse check AFTER redemption, deliberately: checking before would spend
  // an Argon2 verify on every unauthenticated garbage-code request — a CPU
  // faucet. The cost of this ordering is that a reuse rejection has consumed
  // the code and the user requests another. Annoying once, abusable never.
  if (await verifyPassword(newPassword, target.passwordHash)) {
    throw AppError.badRequest("PASSWORD_REUSED", "Choose a password you have not used here before.");
  }

  const passwordHash = await hashPassword(newPassword);
  await accountModel(portal).updateOne(
    { _id: otp.subjectId },
    {
      $set: {
        passwordHash,
        // Kills outstanding ACCESS tokens too. Revoking refresh families only
        // stops sessions from CONTINUING; the access token already in an
        // attacker's hands stays valid for up to ACCESS_TOKEN_TTL_MINUTES,
        // which is exactly the window the owner is trying to close. The
        // authenticate middleware compares iat against this cutoff (Task 6).
        sessionsInvalidatedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
        // Redeeming a mailed code is the same mailbox proof verify-email asks
        // for, so an unverified account that resets becomes verified. Without
        // this, "forgot my password before verifying" is unrecoverable.
        ...(target.emailVerifiedAt === null ? { emailVerifiedAt: new Date() } : {}),
      },
    },
  );

  await revokeAllForSubject(otp.subjectId, portal);
  await clearOtpBudget(portal, otp.subjectId, "reset_password");
}
```

No session is issued after a reset. The resetter proved mailbox control, not
possession of the new password from a device we should trust silently — they
sign in once with the password they just chose, which also exercises the new
credential immediately.

- [ ] **Step 3: Add the six controller factories**

In `backend/src/controllers/auth.controller.ts`, extend the imports:

```ts
import {
  forgotPasswordBodySchema,
  loginBodySchema,
  resetPasswordBodySchema,
} from "@jobportal/shared";
import { AppError } from "../lib/AppError.js";
import { refreshCookieName } from "../lib/cookies.js";
import { endSession, rotateSession } from "../services/session.service.js";
import { findAccountById } from "../services/account.service.js";
```

Then the handlers:

```ts
export function loginHandler(portal: Portal): RequestHandler {
  return async (req, res) => {
    const { email, password } = parseBody(loginBodySchema, req.body);
    const account = await auth.login(portal, email, password);
    await issueSession(res, req, account._id, portal);
    res.json({ success: true, user: auth.toSessionUser(portal, account) });
  };
}

export function logoutHandler(portal: Portal): RequestHandler {
  return async (req, res) => {
    const presented = req.cookies?.[refreshCookieName(portal)] as string | undefined;
    // Revokes the family if the cookie is present and known; clears cookies
    // with matching attributes either way (the inherited logout's bug).
    await endSession(res, portal, presented);
    res.json({ success: true, message: "Signed out." });
  };
}

export function forgotPasswordHandler(portal: Portal): RequestHandler {
  return async (req, res) => {
    const { email } = parseBody(forgotPasswordBodySchema, req.body);
    await auth.forgotPassword(portal, email);
    res.json({ success: true, message: "If that address has an account, a reset code is on its way." });
  };
}

export function resetPasswordHandler(portal: Portal): RequestHandler {
  return async (req, res) => {
    const { email, code, newPassword } = parseBody(resetPasswordBodySchema, req.body);
    await auth.resetPassword(portal, email, code, newPassword);
    res.json({ success: true, message: "Password changed. Sign in with the new password." });
  };
}

export function refreshHandler(portal: Portal): RequestHandler {
  return async (req, res) => {
    const presented = req.cookies?.[refreshCookieName(portal)] as string | undefined;
    if (!presented) {
      throw AppError.unauthorized("SESSION_INVALID", "Your session has expired. Please sign in again.");
    }
    // The mount's portal decides only WHICH COOKIE NAME to read. The session
    // that comes back is whatever the stored row says (Task 5): a seeker
    // token smuggled under the recruiter cookie name re-issues seeker
    // cookies — never recruiter ones.
    await rotateSession(res, req, presented);
    res.json({ success: true });
  };
}

export function meHandler(portal: Portal): RequestHandler {
  return async (req, res) => {
    // Mounted behind authenticate(portal) in Task 10, so req.auth is set.
    const account = await findAccountById(portal, req.auth!.id);
    if (!account) throw AppError.unauthorized("SESSION_INVALID", "Sign in to continue.");
    res.json({ success: true, user: auth.toSessionUser(portal, account) });
  };
}
```

- [ ] **Step 4: Write `backend/tests/auth/login.test.ts`**

Harness: `authTestApp` mounting `register`, `verify-email`, `login`, `logout`,
plus a probe `GET /me` behind `authenticate(portal)` and `POST /refresh` via
`refreshHandler(portal)` (no CSRF in the harness — the middleware has its own
suite and the real wiring is integration-tested in Task 10). Shared helpers as
in Task 7's prelude, plus:

```ts
async function registeredVerified(portal: Portal, email: string, password = "correct horse battery staple") {
  const res = await post(`/api/v1/${portal}/auth/register`, { fullName: "Test Person", email, password });
  expect(res.status).toBe(201);
  const code = await lastCodeFor(email);
  const verified = await post(`/api/v1/${portal}/auth/verify-email`, { email, code });
  expect(verified.status).toBe(200);
}
```

The cases:

```ts
describe("login", () => {
  it("returns one uniform failure for unknown email, wrong password, and Google-only accounts", async () => {
    await registeredVerified("seeker", "known@x.test");
    await Seeker.create({ email: "google-only@x.test", fullName: "G Only", passwordHash: null, emailVerifiedAt: new Date() });

    const cases = [
      { email: "unknown@x.test", password: "whatever whatever" },
      { email: "known@x.test", password: "wrong wrong wrong" },
      { email: "google-only@x.test", password: "wrong wrong wrong" },
    ];
    const bodies = [];
    for (const c of cases) {
      const res = await post("/api/v1/seeker/auth/login", c);
      expect(res.status).toBe(401);
      bodies.push({ code: res.body.code, message: res.body.message });
    }
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);  // byte-identical
  });

  it("burns comparable time on the absent branch (no fast path for unknown emails)", async () => {
    await registeredVerified("seeker", "timing@x.test");
    const t0 = Date.now();
    await post("/api/v1/seeker/auth/login", { email: "absent@x.test", password: "wrong wrong wrong" });
    const absentMs = Date.now() - t0;
    // Argon2id at the Task 3 parameters costs tens of milliseconds. If the
    // absent branch skipped the burn it would return in single digits.
    expect(absentMs).toBeGreaterThan(20);
  });

  it("gives EMAIL_NOT_VERIFIED only for a CORRECT password on an unverified account", async () => {
    await post("/api/v1/seeker/auth/register", {
      fullName: "Unverified", email: "unv@x.test", password: "correct horse battery staple",
    });
    const wrong = await post("/api/v1/seeker/auth/login", { email: "unv@x.test", password: "wrong wrong wrong" });
    expect(wrong.status).toBe(401);
    expect(wrong.body.code).toBe("INVALID_CREDENTIALS");   // no free existence oracle

    const right = await post("/api/v1/seeker/auth/login", { email: "unv@x.test", password: "correct horse battery staple" });
    expect(right.status).toBe(403);
    expect(right.body.code).toBe("EMAIL_NOT_VERIFIED");
    expect(setCookieNames(right)).toEqual([]);             // and still no session
  });

  it("locks after LOGIN_LOCK_THRESHOLD failures and hides the lock behind the uniform error", async () => {
    await registeredVerified("seeker", "lock@x.test");
    for (let i = 0; i < 5; i += 1) {
      await post("/api/v1/seeker/auth/login", { email: "lock@x.test", password: "wrong wrong wrong" });
    }
    // Locked now: even the CORRECT password gets the uniform rejection.
    const during = await post("/api/v1/seeker/auth/login", { email: "lock@x.test", password: "correct horse battery staple" });
    expect(during.status).toBe(401);
    expect(during.body.code).toBe("INVALID_CREDENTIALS");

    // Expire the lock manually, then succeed and confirm counters cleared.
    await Seeker.updateOne({ email: "lock@x.test" }, { $set: { lockedUntil: new Date(Date.now() - 1000) } });
    const after = await post("/api/v1/seeker/auth/login", { email: "lock@x.test", password: "correct horse battery staple" });
    expect(after.status).toBe(200);
    const account = await Seeker.findOne({ email: "lock@x.test" });
    expect(account?.failedLoginCount).toBe(0);
    expect(account?.lockedUntil).toBeNull();
  });

  it("transparently upgrades a migrated bcrypt hash on successful login", async () => {
    const bcrypt = (await import("bcryptjs")).default;
    await Seeker.create({
      email: "legacy@x.test", fullName: "Legacy User",
      passwordHash: await bcrypt.hash("hunter2hunter2", 10),
      emailVerifiedAt: new Date(),
    });
    const res = await post("/api/v1/seeker/auth/login", { email: "legacy@x.test", password: "hunter2hunter2" });
    expect(res.status).toBe(200);
    const account = await Seeker.findOne({ email: "legacy@x.test" }).select("+passwordHash");
    expect(account?.passwordHash).toMatch(/^\$argon2id\$/);
    // And the upgraded hash still verifies on the next login.
    const again = await post("/api/v1/seeker/auth/login", { email: "legacy@x.test", password: "hunter2hunter2" });
    expect(again.status).toBe(200);
  });

  it("logout revokes the refresh family and clears cookies with matching attributes", async () => {
    await registeredVerified("seeker", "out@x.test");
    const login = await post("/api/v1/seeker/auth/login", { email: "out@x.test", password: "correct horse battery staple" });
    const refresh = cookieValue(login, "jp_seeker_rt")!;

    const out = await request(app)
      .post("/api/v1/seeker/auth/logout")
      .set("Cookie", [`jp_seeker_rt=${encodeURIComponent(refresh)}`]);
    expect(out.status).toBe(200);
    // Cleared cookies carry the same path and flags they were set with.
    const cleared = (out.headers["set-cookie"] as unknown as string[]).find((h) => h.startsWith("jp_seeker_at="));
    expect(cleared).toContain("Path=/");
    // The family is dead: the old refresh token no longer rotates.
    const rotate = await request(app)
      .post("/api/v1/seeker/auth/refresh")
      .set("Cookie", [`jp_seeker_rt=${encodeURIComponent(refresh)}`]);
    expect(rotate.status).toBe(401);
  });
});
```

- [ ] **Step 5: Write `backend/tests/auth/reset.test.ts`**

Same harness plus `forgot-password`, `reset-password`, and the `/me` probe.

```ts
describe("password reset", () => {
  it("answers forgot-password identically for present and absent addresses", async () => {
    await registeredVerified("seeker", "real@x.test");
    const present = await post("/api/v1/seeker/auth/forgot-password", { email: "real@x.test" });
    const absent = await post("/api/v1/seeker/auth/forgot-password", { email: "fake@x.test" });
    expect(present.status).toBe(200);
    expect(absent.status).toBe(200);
    expect(present.body).toEqual(absent.body);
    // The real address got a code; the fake one did not get a mail at all.
    await lastCodeFor("real@x.test");
    expect(outbox.some((m) => m.to === "fake@x.test")).toBe(false);
  });

  it("resets the password, kills every session and access token, and refuses reuse", async () => {
    await registeredVerified("seeker", "r@x.test");
    const login = await post("/api/v1/seeker/auth/login", { email: "r@x.test", password: "correct horse battery staple" });
    const oldAccess = cookieValue(login, "jp_seeker_at")!;
    const oldRefresh = cookieValue(login, "jp_seeker_rt")!;

    // The iat-vs-cutoff comparison is floored to the second (Task 6), so make
    // sure the old token was minted in an earlier second than the reset.
    await new Promise((resolve) => setTimeout(resolve, 1100));

    await post("/api/v1/seeker/auth/forgot-password", { email: "r@x.test" });
    const code = await lastCodeFor("r@x.test");

    // Reusing the current password is refused (code consumed — by design).
    const reuse = await post("/api/v1/seeker/auth/reset-password", {
      email: "r@x.test", code, newPassword: "correct horse battery staple",
    });
    expect(reuse.status).toBe(400);
    expect(reuse.body.code).toBe("PASSWORD_REUSED");

    // New code, new password.
    await post("/api/v1/seeker/auth/forgot-password", { email: "r@x.test" });
    const code2 = await lastCodeFor("r@x.test");
    const reset = await post("/api/v1/seeker/auth/reset-password", {
      email: "r@x.test", code: code2, newPassword: "an entirely new passphrase",
    });
    expect(reset.status).toBe(200);
    expect(setCookieNames(reset)).toEqual([]);   // no auto-session after reset

    // Old refresh token: family revoked.
    const rotate = await request(app).post("/api/v1/seeker/auth/refresh")
      .set("Cookie", [`jp_seeker_rt=${encodeURIComponent(oldRefresh)}`]);
    expect(rotate.status).toBe(401);

    // Old ACCESS token: cut off by sessionsInvalidatedAt even though its
    // signature is valid and it has not expired.
    const me = await request(app).get("/api/v1/seeker/auth/me")
      .set("Cookie", [`jp_seeker_at=${encodeURIComponent(oldAccess)}`]);
    expect(me.status).toBe(401);

    // Old password dead, new password lives.
    expect((await post("/api/v1/seeker/auth/login", { email: "r@x.test", password: "correct horse battery staple" })).status).toBe(401);
    expect((await post("/api/v1/seeker/auth/login", { email: "r@x.test", password: "an entirely new passphrase" })).status).toBe(200);
  });

  it("verifies an unverified account as a side effect of a successful reset", async () => {
    await post("/api/v1/seeker/auth/register", {
      fullName: "Fresh", email: "fresh@x.test", password: "correct horse battery staple",
    });
    await post("/api/v1/seeker/auth/forgot-password", { email: "fresh@x.test" });
    const code = await lastCodeFor("fresh@x.test");
    const res = await post("/api/v1/seeker/auth/reset-password", {
      email: "fresh@x.test", code, newPassword: "an entirely new passphrase",
    });
    expect(res.status).toBe(200);
    expect(await isVerified("seeker", "fresh@x.test")).toBe(true);   // mailbox proven
  });
});
```

(`lastCodeFor` returns the most recent code, so the forgot-password code — not
the leftover registration code — is what redeems here. The registration code
was superseded by `issueOtp` anyway; different `purpose`, different row.)

- [ ] **Step 6: Verify and commit**

```bash
npm test --workspace @jobportal/api -- login
npm test --workspace @jobportal/api -- reset
npm run typecheck
git add backend/src/services/auth.service.ts backend/src/controllers/auth.controller.ts backend/tests/auth
git commit -m "feat(api): add password login with capped lockout, logout and uniform-time reset"
```

---

### Task 9: Google OAuth with PKCE, nonce, and the transaction cookie

The flow the amendment rewrote twice. Portal context rides in a signed
`httpOnly` cookie — never in `state`, never in the URL — and every identity
resolution branch is guarded against the takeover it was designed around.

**Files:**
- Modify: `backend/package.json` (install), `packages/shared/src/auth.ts`, `backend/src/lib/keys.ts`, `backend/src/lib/cookies.ts`, `backend/src/lib/emailTemplates.ts`, `backend/src/controllers/auth.controller.ts`
- Create: `backend/src/lib/googleOAuth.ts`, `backend/src/services/googleAuth.service.ts`
- Create: `backend/tests/auth/google.test.ts`

**Interfaces:**
- Consumes: `googleRedirectUri(portal)` (Task 1 `config/env.ts`), `hkdfSync` pattern (Task 3), cookie helpers (Task 5), `accountModel`/`findAccountByEmail` (Task 6), `revokeAllForSubject` (Task 5), `sendRendered`/`dispatch` (Task 4)
- Produces: `startGoogleFlow(portal, res)`, `handleGoogleCallback(portal, req, res)`, `confirmGoogleLink(portal, token)`; `googleStartHandler(portal)`, `googleCallbackHandler(portal)`, `confirmGoogleLinkHandler(portal)` for Task 10; `googleTxnKey()`; `setGoogleOAuth`/`resetGoogleOAuth` test seam

- [ ] **Step 1: Install the library — pinned to the 10.x line**

```bash
npm install --workspace @jobportal/api google-auth-library@^10.9.1
```

`^10.9.1` and not latest: `google-auth-library@11.0.0` declares `engines.node
>= 22`, which this project's Node 20 floor excludes (verified during the
2026-08-01 review). The caret stays inside major 10. Do not "upgrade" this as
part of the task.

- [ ] **Step 2: Add the transaction key, the shared schema, and the lax cookie**

In `backend/src/lib/keys.ts`:

```ts
/**
 * Key for the OAuth transaction cookie's JWT and the mailed link-confirmation
 * token. Derived, not a fifth env secret: same HKDF pattern as the access
 * keys, with its own info string so it can never collide with a portal key.
 */
export function googleTxnKey(): Buffer {
  return Buffer.from(hkdfSync("sha256", env().JWT_ACCESS_SECRET, "", "google-txn", 32));
}
```

In `packages/shared/src/auth.ts` (rebuild shared afterwards):

```ts
export const confirmGoogleLinkBodySchema = z.object({
  token: z.string().min(1).max(2048),
});
export type ConfirmGoogleLinkBody = z.infer<typeof confirmGoogleLinkBodySchema>;
```

In `backend/src/lib/cookies.ts`:

```ts
const GOOGLE_TXN_COOKIE = "jp_gtxn";

export function googleTxnCookieName(): string {
  return prefixed(GOOGLE_TXN_COOKIE);
}

/**
 * sameSite is hardcoded "lax", NOT the configured value. The callback is a
 * cross-site top-level GET arriving from accounts.google.com; a `strict`
 * cookie is not sent on that navigation, so with the default
 * COOKIE_SAMESITE=strict every sign-in would die with a missing-transaction
 * error and nothing in any log to explain it. `lax` sends the cookie on
 * top-level navigations — exactly and only what the callback is. The session
 * cookies are NOT loosened; they keep the configured value (they are SET on
 * the callback response, which is always allowed; sameSite gates sending).
 */
export function setGoogleTxnCookie(res: Response, token: string): void {
  res.cookie(googleTxnCookieName(), token, {
    httpOnly: true,
    secure: isSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60_000,
  });
}

export function clearGoogleTxnCookie(res: Response): void {
  res.clearCookie(googleTxnCookieName(), {
    httpOnly: true,
    secure: isSecure(),
    sameSite: "lax",
    path: "/",
  });
}
```

- [ ] **Step 3: Write `backend/src/lib/googleOAuth.ts` — the only file that talks to Google**

```ts
import { OAuth2Client, CodeChallengeMethod } from "google-auth-library";
import { env } from "../config/env.js";

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  fullName: string | null;
  avatarUrl: string | null;
  /** Echoed from the ID token. The LIBRARY DOES NOT CHECK IT; the service must. */
  nonce: string | null;
}

export interface GoogleOAuthPort {
  authUrl(input: { redirectUri: string; state: string; nonce: string; codeChallenge: string }): string;
  exchange(input: { code: string; codeVerifier: string; redirectUri: string }): Promise<GoogleIdentity>;
}

/** Lazy for the same env()-at-import reason as the mailer (Task 4). */
let client: OAuth2Client | undefined;
function oauthClient(): OAuth2Client {
  client ??= new OAuth2Client({
    clientId: env().GOOGLE_CLIENT_ID,
    clientSecret: env().GOOGLE_CLIENT_SECRET,
  });
  return client;
}

const realGoogleOAuth: GoogleOAuthPort = {
  authUrl({ redirectUri, state, nonce, codeChallenge }) {
    return oauthClient().generateAuthUrl({
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "online",
      scope: ["openid", "email", "profile"],
      state,
      code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
      prompt: "select_account",
      // generateAuthUrl serialises every key into the query string, but its
      // options type does not declare `nonce`; the cast is confined to it.
      ...({ nonce } as Record<string, string>),
    });
  },

  async exchange({ code, codeVerifier, redirectUri }) {
    // PKCE verifier AND client_secret travel together: Google's web client
    // type requires the secret, and only the verifier stops an injected code
    // (RFC 9700 §2.1.1). getToken sends both.
    const { tokens } = await oauthClient().getToken({
      code,
      codeVerifier,
      redirect_uri: redirectUri,
    });
    if (!tokens.id_token) throw new Error("Google token response carried no id_token");

    // `audience` passed EXPLICITLY. The library only checks `aud` when given
    // one; omitting it accepts any Google-signed token minted for any
    // application on earth — a full authentication bypass.
    const ticket = await oauthClient().verifyIdToken({
      idToken: tokens.id_token,
      audience: env().GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) throw new Error("Google id_token missing sub or email");

    return {
      sub: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified === true,
      fullName: payload.name ?? null,
      avatarUrl: payload.picture ?? null,
      nonce: (payload as { nonce?: string }).nonce ?? null,
    };
  },
};

let active: GoogleOAuthPort = realGoogleOAuth;

export function googleOAuth(): GoogleOAuthPort {
  return active;
}
/** Test seam, mirror of setMailer. No auth test may ever reach Google. */
export function setGoogleOAuth(next: GoogleOAuthPort): void {
  active = next;
}
export function resetGoogleOAuth(): void {
  active = realGoogleOAuth;
}
```

- [ ] **Step 4: Write `backend/src/services/googleAuth.service.ts`**

```ts
import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import type { Request, Response } from "express";
import type { Portal } from "@jobportal/shared";
import { env, googleRedirectUri } from "../config/env.js";
import { googleTxnKey } from "../lib/keys.js";
import { googleOAuth, type GoogleIdentity } from "../lib/googleOAuth.js";
import { clearGoogleTxnCookie, googleTxnCookieName, setGoogleTxnCookie } from "../lib/cookies.js";
import { accountModel, findAccountByEmail, type AccountDocument } from "./account.service.js";
import { revokeAllForSubject } from "./session.service.js";
import { OtpCode } from "../models/otpCode.model.js";
import { dispatch, sendRendered } from "../lib/mailer.js";
import { renderAccountClaimedEmail, renderGoogleLinkEmail } from "../lib/emailTemplates.js";
import { logger } from "../lib/logger.js";
import { AppError } from "../lib/AppError.js";

interface TxnClaims {
  purpose: "google-txn";
  portal: Portal;
  verifier: string;
  nonce: string;
  state: string;
}

/**
 * Mints the PKCE verifier, nonce and state; binds all three PLUS THE PORTAL
 * into a signed httpOnly cookie; returns Google's consent URL. The portal
 * never appears in `state` or any URL parameter — a signed value in the URL
 * is still swappable (replay someone else's validly-signed state); a value in
 * an httpOnly cookie on THIS browser is neither editable nor swappable.
 */
export function startGoogleFlow(portal: Portal, res: Response): string {
  const verifier = randomBytes(32).toString("base64url");   // RFC 7636 §4.1 length
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const nonce = randomBytes(16).toString("base64url");
  const state = randomBytes(16).toString("base64url");

  const txn: TxnClaims = { purpose: "google-txn", portal, verifier, nonce, state };
  setGoogleTxnCookie(res, jwt.sign(txn, googleTxnKey(), { expiresIn: "10m" }));

  return googleOAuth().authUrl({
    redirectUri: googleRedirectUri(portal),
    state,
    nonce,
    codeChallenge: challenge,
  });
}

export type CallbackOutcome =
  | { kind: "signed-in"; account: AccountDocument }
  | { kind: "link-pending" }
  | { kind: "failed" };

/**
 * Every failure collapses to one outcome. Which check tripped — state, nonce,
 * portal, exchange, verification — is for the server log, never for the URL:
 * distinct failure codes would hand a prober a map of the defences.
 */
export async function handleGoogleCallback(
  portal: Portal,
  req: Request,
  res: Response,
): Promise<CallbackOutcome> {
  clearGoogleTxnCookie(res);   // single-use, success or failure

  const raw = req.cookies?.[googleTxnCookieName()] as string | undefined;
  const code = typeof req.query.code === "string" ? req.query.code : undefined;
  const state = typeof req.query.state === "string" ? req.query.state : undefined;
  if (!raw || !code || !state) return { kind: "failed" };

  let txn: TxnClaims;
  try {
    txn = jwt.verify(raw, googleTxnKey()) as TxnClaims;
  } catch {
    return { kind: "failed" };
  }
  if (txn.purpose !== "google-txn") return { kind: "failed" };
  // The mount is the truth and the cookie must AGREE with it: a transaction
  // started on the seeker portal presented to the recruiter callback dies
  // here, portal-pinned server-side (amendment, medium finding 3).
  if (txn.portal !== portal) return { kind: "failed" };
  // Login-CSRF: an attacker-initiated flow completing in the victim's browser
  // carries the attacker's state but the victim's cookie. Mismatch → dead.
  if (txn.state !== state) return { kind: "failed" };

  let identity: GoogleIdentity;
  try {
    identity = await googleOAuth().exchange({
      code,
      codeVerifier: txn.verifier,
      redirectUri: googleRedirectUri(portal),
    });
  } catch (error) {
    logger.warn({ err: error, portal }, "google token exchange failed");
    return { kind: "failed" };
  }

  // The library checked signature, expiry and (because we passed it) aud.
  // nonce and email_verified are OURS to check — it does neither.
  if (!identity.nonce || identity.nonce !== txn.nonce) return { kind: "failed" };
  if (!identity.emailVerified) return { kind: "failed" };

  return resolveIdentity(portal, identity);
}

/** The amendment's resolution order, branch for branch. */
async function resolveIdentity(portal: Portal, identity: GoogleIdentity): Promise<CallbackOutcome> {
  const model = accountModel(portal);

  // Branch 1: known Google identity. Keyed on `sub`, never email — an email
  // can move between Google accounts; a `sub` cannot.
  const bySub = await model.findOne({ googleId: identity.sub });
  if (bySub) {
    if (bySub.status !== "active") return { kind: "failed" };
    return { kind: "signed-in", account: bySub };
  }

  // `withSecret` because branch 2a below turns on whether this account has a
  // password at all.
  const byEmail = await findAccountByEmail(portal, identity.email, { withSecret: true });

  // Branch 3: complete stranger → create, already verified (Google attested
  // the mailbox and we independently required email_verified above).
  if (!byEmail) {
    try {
      const created = await model.create({
        email: identity.email.toLowerCase(),
        // `?? "Member"` is not defensive noise: `noUncheckedIndexedAccess` is on,
        // so `split("@")[0]` is `string | undefined`, and `fullName` is required
        // with a 2-character minimum. A Google account with no name and a
        // single-character local part would otherwise fail schema validation
        // here — after the OAuth round trip, where the only place to report it
        // is a redirect to /auth/error.
        fullName: identity.fullName ?? identity.email.split("@")[0] ?? "Member",
        googleId: identity.sub,
        passwordHash: null,
        emailVerifiedAt: new Date(),
        avatarUrl: identity.avatarUrl,
      });
      return { kind: "signed-in", account: created };
    } catch (error) {
      // Two first sign-ins racing the unique email index: loser re-reads.
      if ((error as { code?: number }).code !== 11000) throw error;
      const raced = await model.findOne({ googleId: identity.sub });
      return raced ? { kind: "signed-in", account: raced } : { kind: "failed" };
    }
  }

  if (byEmail.status !== "active") return { kind: "failed" };

  // Branch 2a: local account with NO password → there are no credentials to
  // steal, so linking is takeover-proof. Guarded update so a raced link loses.
  if (byEmail.passwordHash === null) {
    const linked = await model.findOneAndUpdate(
      { _id: byEmail._id, googleId: null },
      { $set: { googleId: identity.sub } },
      { new: true },
    );
    return linked ? { kind: "signed-in", account: linked } : { kind: "failed" };
  }

  // Branch 2c: password + UNVERIFIED → takeover IN PLACE, atomically, guarded
  // on the exact preconditions. This is the anti-plant branch: an attacker
  // registered the victim's address with a password they know and never
  // verified; nulling the password and verifying leaves the plant worthless
  // while keeping `_id` (team invites, provisioned rows) intact. Deletion was
  // the amendment's second critical finding — do not "simplify" back to it.
  if (byEmail.emailVerifiedAt === null) {
    const taken = await model.findOneAndUpdate(
      { _id: byEmail._id, emailVerifiedAt: null, googleId: null },
      {
        $set: {
          googleId: identity.sub,
          passwordHash: null,
          emailVerifiedAt: new Date(),
          sessionsInvalidatedAt: new Date(),
          pendingGoogleLink: { googleId: null, requestedAt: null },
        },
      },
      { new: true },
    );
    if (!taken) return { kind: "failed" };
    // Idempotent cleanup AFTER the atomic flip. Single-document atomicity is
    // the security boundary here; a multi-document transaction would demand a
    // replica set (which mongodb-memory-server and the dev box don't run),
    // and buys nothing: an unverified account can hold no sessions (login
    // refuses it before ever issuing one), so these deletes are belt-and-
    // braces that are safe to repeat if a crash lands between them.
    await revokeAllForSubject(taken._id, portal);
    await OtpCode.deleteMany({ subjectId: taken._id, subjectType: portal });
    dispatch(sendRendered(taken.email, renderAccountClaimedEmail()));
    return { kind: "signed-in", account: taken };
  }

  // Branch 2b: password + verified → STEP-UP, never auto-link. Google's
  // email_verified attests the domain's CURRENT operator, not this human's
  // history with the mailbox (lapsed-and-re-registered domains, malicious
  // Workspace admins). The link activates only from the mailbox. Latest
  // attempt wins; the fresh pending record invalidates any older mail.
  await model.updateOne(
    { _id: byEmail._id },
    { $set: { pendingGoogleLink: { googleId: identity.sub, requestedAt: new Date() } } },
  );
  const token = jwt.sign(
    { purpose: "google-link", portal, sub: String(byEmail._id), googleId: identity.sub },
    googleTxnKey(),
    { expiresIn: `${env().GOOGLE_LINK_CONFIRM_TTL_HOURS}h` },
  );
  const confirmUrl = `${env().WEB_BASE_URL}/auth/confirm-google-link?portal=${portal}&token=${encodeURIComponent(token)}`;
  dispatch(sendRendered(byEmail.email, renderGoogleLinkEmail(confirmUrl, env().GOOGLE_LINK_CONFIRM_TTL_HOURS)));
  logger.info({ accountId: String(byEmail._id), portal }, "google link step-up required");
  return { kind: "link-pending" };
}

/**
 * Redeems the mailed confirmation. The token alone is not enough: the STORED
 * pending request must still match it, so a newer link attempt (different
 * Google account) silently invalidates every older mail, and a cleared
 * pending (takeover, cancellation) invalidates them all.
 */
export async function confirmGoogleLink(portal: Portal, token: string): Promise<void> {
  const invalid = AppError.badRequest("GOOGLE_LINK_INVALID", "That confirmation link is invalid or has expired.");

  let claims: { purpose?: string; portal?: Portal; sub?: string; googleId?: string };
  try {
    claims = jwt.verify(token, googleTxnKey()) as typeof claims;
  } catch {
    throw invalid;
  }
  if (claims.purpose !== "google-link" || claims.portal !== portal || !claims.sub || !claims.googleId) {
    throw invalid;
  }

  const cutoff = new Date(Date.now() - env().GOOGLE_LINK_CONFIRM_TTL_HOURS * 3_600_000);
  try {
    const linked = await accountModel(portal).findOneAndUpdate(
      {
        _id: claims.sub,
        "pendingGoogleLink.googleId": claims.googleId,
        "pendingGoogleLink.requestedAt": { $gt: cutoff },
        googleId: null,
      },
      { $set: { googleId: claims.googleId, pendingGoogleLink: { googleId: null, requestedAt: null } } },
      { new: true },
    );
    if (!linked) throw invalid;
  } catch (error) {
    // The Google identity got linked to a DIFFERENT account meanwhile; the
    // partial unique index on googleId refuses the alias. Same uniform error.
    if ((error as { code?: number }).code === 11000) throw invalid;
    throw error;
  }
}
```

- [ ] **Step 5: Add the step-up email template**

In `backend/src/lib/emailTemplates.ts`:

```ts
/** Step-up mail for linking Google to a VERIFIED password account (Task 9, branch 2b). */
export function renderGoogleLinkEmail(confirmUrl: string, hours: number): Rendered {
  return {
    subject: "Confirm linking Google sign-in",
    html: WRAPPER(
      `<h1 style="font-size:1.25rem">Link Google sign-in?</h1><p>Someone — hopefully you — asked to sign in to this account with Google. If that was you, confirm below within ${hours} hours. If it was not, do nothing: your password keeps working and nothing changes.</p><p style="margin:1.5rem 0"><a href="${confirmUrl}" style="display:inline-block;padding:.6rem 1.2rem;background:#1a1a1a;color:#ffffff;border-radius:.375rem;text-decoration:none">Link Google sign-in</a></p>`,
    ),
    text: `Link Google sign-in?\n\nConfirm within ${hours} hours:\n${confirmUrl}\n\nIf this wasn't you, do nothing — your password keeps working and nothing changes.`,
  };
}
```

- [ ] **Step 6: Add the three controller factories**

In `backend/src/controllers/auth.controller.ts` — new imports:

```ts
import { confirmGoogleLinkBodySchema } from "@jobportal/shared";
import { env } from "../config/env.js";
import { confirmGoogleLink, handleGoogleCallback, startGoogleFlow } from "../services/googleAuth.service.js";
```

```ts
export function googleStartHandler(portal: Portal): RequestHandler {
  return (_req, res) => {
    res.redirect(startGoogleFlow(portal, res));
  };
}

/**
 * DELIBERATE exception to the "failures throw AppError" convention, and the
 * only one in the phase: this endpoint is a top-level browser navigation from
 * Google, not an XHR. A JSON envelope strands a human on a wall of JSON, so
 * every outcome — including failure — is a redirect back into the web app,
 * and failure carries ONE uniform code so the URL never tells a prober which
 * check tripped.
 */
export function googleCallbackHandler(portal: Portal): RequestHandler {
  return async (req, res) => {
    const outcome = await handleGoogleCallback(portal, req, res);
    const web = env().WEB_BASE_URL;
    if (outcome.kind === "signed-in") {
      await issueSession(res, req, outcome.account._id, portal);
      // The portal in the query is a bootstrap hint for the SPA's /me call,
      // nothing more — the session's real portal is enforced by the cookies.
      res.redirect(`${web}/auth/complete?portal=${portal}`);
      return;
    }
    if (outcome.kind === "link-pending") {
      res.redirect(`${web}/auth/link-pending`);
      return;
    }
    res.redirect(`${web}/auth/error?code=GOOGLE_AUTH_FAILED`);
  };
}

export function confirmGoogleLinkHandler(portal: Portal): RequestHandler {
  return async (req, res) => {
    const { token } = parseBody(confirmGoogleLinkBodySchema, req.body);
    await confirmGoogleLink(portal, token);
    res.json({ success: true, message: "Google sign-in is now linked. Use it to sign in." });
  };
}
```

- [ ] **Step 7: Write `backend/tests/auth/google.test.ts`**

Harness mounts `google` (start), `google/callback`, `google/confirm-link`,
plus `register`, `verify-email`, `login` for fixtures. The seam replaces the
network; `authUrl` records the state/nonce it was called with so the test can
echo them like a real browser and a real Google would:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Portal } from "@jobportal/shared";
import { Seeker } from "../../src/models/seeker.model.js";
import { resetGoogleOAuth, setGoogleOAuth, type GoogleIdentity } from "../../src/lib/googleOAuth.js";
import { authTestApp, cookieValue, installCaptureMailer, lastCodeFor, outbox, setCookieNames } from "./helpers.js";
// ...handler imports and authTestApp mount as in earlier tasks...

beforeEach(installCaptureMailer);
afterEach(resetGoogleOAuth);

let issued: { state: string; nonce: string };

const IDENTITY: GoogleIdentity = {
  sub: "google-sub-1", email: "g@x.test", emailVerified: true,
  fullName: "G User", avatarUrl: null, nonce: null,
};

function installFakeGoogle(overrides: Partial<GoogleIdentity> = {}): void {
  setGoogleOAuth({
    authUrl({ state, nonce }) {
      issued = { state, nonce };
      return `https://accounts.google.example/consent?state=${state}`;
    },
    async exchange() {
      // Echo the txn's nonce unless a test overrides it to simulate replay.
      return { ...IDENTITY, nonce: issued.nonce, ...overrides };
    },
  });
}

/** Start + callback with a well-behaved browser. Returns the callback response. */
async function completeFlow(portal: Portal, overrides: Partial<GoogleIdentity> = {}, mangle?: { state?: string; dropCookie?: boolean }) {
  installFakeGoogle(overrides);
  const start = await request(app).get(`/api/v1/${portal}/auth/google`);
  expect(start.status).toBe(302);
  const txn = cookieValue(start, "jp_gtxn")!;
  let call = request(app)
    .get(`/api/v1/${portal}/auth/google/callback`)
    .query({ code: "fake-code", state: mangle?.state ?? issued.state });
  if (!mangle?.dropCookie) call = call.set("Cookie", [`jp_gtxn=${encodeURIComponent(txn)}`]);
  return call;
}
```

The branch matrix — each case names its attack:

```ts
describe("google oauth", () => {
  it("creates a verified account for a stranger and signs them in (branch 3)", async () => {
    const res = await completeFlow("seeker");
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/auth/complete?portal=seeker");
    expect(setCookieNames(res)).toEqual(expect.arrayContaining(["jp_seeker_at", "jp_seeker_rt"]));
    const account = await Seeker.findOne({ email: "g@x.test" }).select("+passwordHash");
    expect(account?.googleId).toBe("google-sub-1");
    expect(account?.emailVerifiedAt).not.toBeNull();
    expect(account?.passwordHash).toBeNull();
  });

  it("signs a known googleId straight in without touching email matching (branch 1)", async () => {
    await completeFlow("seeker");
    // Same sub, DIFFERENT email — the account keys on sub, so this is the
    // same person whose Google email changed, not a new account.
    const res = await completeFlow("seeker", { email: "renamed@x.test" });
    expect(res.headers.location).toContain("/auth/complete");
    expect(await Seeker.countDocuments({})).toBe(1);
  });

  it("links a passwordless local account in place (branch 2a)", async () => {
    await Seeker.create({ email: "g@x.test", fullName: "Pre", passwordHash: null, emailVerifiedAt: new Date() });
    await completeFlow("seeker");
    const account = await Seeker.findOne({ email: "g@x.test" });
    expect(account?.googleId).toBe("google-sub-1");
    expect(await Seeker.countDocuments({})).toBe(1);   // linked, not duplicated
  });

  it("takes over an unverified password account IN PLACE, keeping _id (branch 2c)", async () => {
    // The attacker's plant: victim's address, attacker's password, never verified.
    await post("/api/v1/seeker/auth/register", {
      fullName: "Attacker", email: "g@x.test", password: "attacker knows this one",
    });
    const planted = await Seeker.findOne({ email: "g@x.test" });

    const res = await completeFlow("seeker");
    expect(res.headers.location).toContain("/auth/complete");

    const account = await Seeker.findOne({ email: "g@x.test" }).select("+passwordHash");
    expect(String(account?._id)).toBe(String(planted?._id));   // takeover, not recreate
    expect(account?.passwordHash).toBeNull();                   // the plant is dead
    expect(account?.emailVerifiedAt).not.toBeNull();
    // The attacker's password no longer opens anything.
    const login = await post("/api/v1/seeker/auth/login", { email: "g@x.test", password: "attacker knows this one" });
    expect(login.status).toBe(401);
    // And the owner was told what happened.
    expect(outbox.some((m) => m.to === "g@x.test" && /sign-in method changed/i.test(m.subject))).toBe(true);
  });

  it("requires mailbox step-up for a VERIFIED password account (branch 2b)", async () => {
    await post("/api/v1/seeker/auth/register", {
      fullName: "Owner", email: "g@x.test", password: "the owners password!",
    });
    await post("/api/v1/seeker/auth/verify-email", { email: "g@x.test", code: await lastCodeFor("g@x.test") });

    const res = await completeFlow("seeker");
    expect(res.headers.location).toContain("/auth/link-pending");
    expect(setCookieNames(res)).not.toEqual(expect.arrayContaining(["jp_seeker_at"]));  // NOT signed in

    const account = await Seeker.findOne({ email: "g@x.test" });
    expect(account?.googleId).toBeNull();                       // not linked yet
    expect(account?.pendingGoogleLink?.googleId).toBe("google-sub-1");

    // The mailed link activates it.
    const token = linkTokenFor("g@x.test", /link/i);
    const confirm = await post("/api/v1/seeker/auth/google/confirm-link", { token });
    expect(confirm.status).toBe(200);
    expect((await Seeker.findOne({ email: "g@x.test" }))?.googleId).toBe("google-sub-1");

    // And now branch 1 signs them in.
    const again = await completeFlow("seeker");
    expect(again.headers.location).toContain("/auth/complete");
  });

  it("invalidates an older confirmation mail when a newer attempt supersedes it", async () => {
    // Register+verify, run the flow once (mail A), then again with a
    // DIFFERENT google sub (mail B). A's token must be dead.
    // ...as above through mail A, then:
    const second = await completeFlow("seeker", { sub: "google-sub-2" });
    expect(second.headers.location).toContain("/auth/link-pending");
    // The OLDEST link mail, not the newest — `linkTokenFor` takes the most
    // recent, which is mail B, and the point of this test is that A is dead.
    const mailA = outbox.filter((m) => /link/i.test(m.subject))[0];
    const tokenA = mailA && /token=([^\s&]+)/.exec(mailA.text)?.[1];
    expect(tokenA).toBeDefined();
    const confirmA = await post("/api/v1/seeker/auth/google/confirm-link", {
      token: decodeURIComponent(tokenA!),
    });
    expect(confirmA.status).toBe(400);
    expect(confirmA.body.code).toBe("GOOGLE_LINK_INVALID");
  });

  it("kills the flow on state mismatch, nonce mismatch, unverified email, or a missing cookie", async () => {
    for (const attempt of [
      completeFlow("seeker", {}, { state: "attacker-state" }),        // login CSRF
      completeFlow("seeker", { nonce: "replayed-nonce" }),            // token replay
      completeFlow("seeker", { emailVerified: false }),               // unattested mailbox
      completeFlow("seeker", {}, { dropCookie: true }),               // no transaction
    ]) {
      const res = await attempt;
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain("GOOGLE_AUTH_FAILED");
      expect(setCookieNames(res)).not.toEqual(expect.arrayContaining(["jp_seeker_at"]));
    }
    expect(await Seeker.countDocuments({})).toBe(0);
  });

  it("refuses a seeker transaction presented to the recruiter callback", async () => {
    installFakeGoogle();
    const start = await request(app).get("/api/v1/seeker/auth/google");
    const txn = cookieValue(start, "jp_gtxn")!;
    const res = await request(app)
      .get("/api/v1/recruiter/auth/google/callback")
      .query({ code: "fake-code", state: issued.state })
      .set("Cookie", [`jp_gtxn=${encodeURIComponent(txn)}`]);
    expect(res.headers.location).toContain("GOOGLE_AUTH_FAILED");
  });
});
```

- [ ] **Step 8: Verify and commit**

```bash
npm run build --workspace @jobportal/shared
npm test --workspace @jobportal/api -- google
npm run typecheck
git add packages/shared/src backend/src backend/tests/auth backend/package.json package-lock.json
git commit -m "feat(api): add Google OAuth with PKCE, portal transaction cookie and link step-up"
```

---

### Task 10: The router, rate limits, and the live mounts

Everything so far exists behind test harnesses. This task puts the real
surface on `buildApp()` — one router built twice, each endpoint behind the
spec's limits — and proves the whole journey through the real app.

**Files:**
- Create: `backend/src/routes/auth.route.ts`
- Modify: `backend/src/app.ts`, `backend/src/lib/rateLimitStore.ts`, `backend/tests/setup.ts`
- Create: `backend/tests/auth/integration.test.ts`

**Interfaces:**
- Consumes: every `*Handler(portal)` factory (Tasks 7-9), `rateLimit` (existing middleware), `csrfProtection`/`authenticate` (Task 6)
- Produces: `buildAuthRouter(portal)`; live routes at `/api/v1/seeker/auth/*` and `/api/v1/recruiter/auth/*`; `InMemoryRateLimitStore.clear()`

- [ ] **Step 1: Write `backend/src/routes/auth.route.ts`**

```ts
import { Router, type Request } from "express";
import type { Portal } from "@jobportal/shared";
import { rateLimit } from "../middleware/rateLimit.js";
import { csrfProtection } from "../middleware/csrf.js";
import { authenticate } from "../middleware/authenticate.js";
import {
  confirmGoogleLinkHandler,
  forgotPasswordHandler,
  googleCallbackHandler,
  googleStartHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
  registerHandler,
  resendCodeHandler,
  resetPasswordHandler,
  verifyEmailHandler,
} from "../controllers/auth.controller.js";

/**
 * Body email for rate-limit keys: normalised and bounded here, VALIDATED
 * later by the handler's schema — the limiter must run first and cannot
 * assume a well-formed body. Garbage bodies all share the "" bucket, which
 * only ever throttles other garbage.
 */
function emailKey(req: Request): string {
  const raw = (req.body as { email?: unknown } | undefined)?.email;
  return typeof raw === "string" ? raw.trim().toLowerCase().slice(0, 254) : "";
}

/**
 * One router, mounted twice; the mount path is the ONLY place a portal is
 * named, and app.ts passes it as a literal. Limits are the spec's:
 * registration 10/h/IP, login 5/15min per IP+email, OTP request 3/h/email,
 * OTP redemption 10/h/IP, Google start 10/h/IP.
 *
 * The rateLimit key already embeds method+path, so every endpoint gets its
 * own bucket — and because the path EXCLUDES the mount prefix, a bucket is
 * shared across the two portals for the same key. That is the conservative
 * direction: alternating mounts must not double an attacker's allowance.
 */
export function buildAuthRouter(portal: Portal): Router {
  const router = Router();

  const rlRegister = rateLimit({ windowMs: 3_600_000, max: 10 });
  const rlLogin = rateLimit({ windowMs: 900_000, max: 5, keyFn: (req) => `${req.ip ?? "unknown"}:${emailKey(req)}` });
  const rlOtpRequest = rateLimit({ windowMs: 3_600_000, max: 3, keyFn: emailKey });
  const rlRedeem = rateLimit({ windowMs: 3_600_000, max: 10 });
  const rlGoogle = rateLimit({ windowMs: 3_600_000, max: 10 });

  router.post("/register", rlRegister, registerHandler(portal));
  router.post("/verify-email", rlRedeem, verifyEmailHandler(portal));
  router.post("/resend-code", rlOtpRequest, resendCodeHandler(portal));
  router.post("/login", rlLogin, loginHandler(portal));
  router.post("/forgot-password", rlOtpRequest, forgotPasswordHandler(portal));
  router.post("/reset-password", rlRedeem, resetPasswordHandler(portal));

  // Only the session-bearing mutations carry CSRF. Everything above runs
  // before any session exists, where CSRF protects nothing. refresh is the
  // textbook target — it acts on a cookie the browser attaches by itself.
  router.post("/refresh", csrfProtection, refreshHandler(portal));
  router.post("/logout", csrfProtection, logoutHandler(portal));

  router.get("/google", rlGoogle, googleStartHandler(portal));
  // No CSRF on the callback: a top-level GET navigation Google initiates, to
  // which no header can be attached. Its protections are the signed lax
  // transaction cookie, state, and nonce (Task 9).
  router.get("/google/callback", googleCallbackHandler(portal));
  router.post("/google/confirm-link", rlRedeem, confirmGoogleLinkHandler(portal));

  router.get("/me", authenticate(portal), meHandler(portal));

  return router;
}
```

(CAPTCHA / proof-of-work on registration stays deferred to 1C — see the scope
boundary section. The 10/h/IP limit is the interim control the spec's
hardening list gets in this phase.)

- [ ] **Step 2: Mount both portals in `backend/src/app.ts`**

Add the import and two mounts alongside the existing routes — the legacy
`/api/v1/user` mount STAYS until Task 15:

```ts
import { buildAuthRouter } from "./routes/auth.route.js";
```

```ts
  app.use("/api/v1/user", userRoute);
  app.use("/api/v1/seeker/auth", buildAuthRouter("seeker"));
  app.use("/api/v1/recruiter/auth", buildAuthRouter("recruiter"));
```

- [ ] **Step 3: Make the rate-limit store clearable, and clear it between tests**

`defaultRateLimitStore` is a module singleton and vitest runs every file in
one fork (`singleFork: true`), so counters bleed across tests the moment
`buildApp()` is under test — a login-limit test would poison every later
login. In `backend/src/lib/rateLimitStore.ts`:

```ts
  /** Test hook: drop every window. Cheap, and meaningless in production. */
  clear(): void {
    this.entries.clear();
  }
```

In `backend/tests/setup.ts` — same commit, per the global constraint:

```ts
import { defaultRateLimitStore } from "../src/lib/rateLimitStore.js";
```

and inside the existing `afterEach`, after the collection wipe:

```ts
  defaultRateLimitStore.clear();
```

- [ ] **Step 4: Write `backend/tests/auth/integration.test.ts`**

Through `buildApp()` — cookies, CSRF, limits and all. A supertest agent plays
the browser.

```ts
import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app.js";
import { cookieValue, installCaptureMailer, lastCodeFor } from "./helpers.js";

const app = buildApp();
beforeEach(installCaptureMailer);

describe("the whole journey, through the real app", () => {
  it("register → verify → me → refresh → logout, with CSRF enforced", async () => {
    const agent = request.agent(app);

    const reg = await agent.post("/api/v1/seeker/auth/register").send({
      fullName: "End ToEnd", email: "e2e@x.test", password: "correct horse battery staple",
    });
    expect(reg.status).toBe(201);

    const verify = await agent.post("/api/v1/seeker/auth/verify-email").send({
      email: "e2e@x.test", code: await lastCodeFor("e2e@x.test"),
    });
    expect(verify.status).toBe(200);
    const csrf = cookieValue(verify, "jp_csrf")!;

    expect((await agent.get("/api/v1/seeker/auth/me")).status).toBe(200);

    // Refresh WITHOUT the header is the cookie-only forgery — the exact
    // request a cross-site attacker can make the browser send.
    const forged = await agent.post("/api/v1/seeker/auth/refresh");
    expect(forged.status).toBe(403);
    expect(forged.body.code).toBe("CSRF_INVALID");

    const refreshed = await agent.post("/api/v1/seeker/auth/refresh").set("X-CSRF-Token", csrf);
    expect(refreshed.status).toBe(200);
    const csrf2 = cookieValue(refreshed, "jp_csrf")!;

    expect((await agent.get("/api/v1/seeker/auth/me")).status).toBe(200);

    const out = await agent.post("/api/v1/seeker/auth/logout").set("X-CSRF-Token", csrf2);
    expect(out.status).toBe(200);
    expect((await agent.get("/api/v1/seeker/auth/me")).status).toBe(401);
  });

  it("throttles login at 5 per window per IP+email and answers 429", async () => {
    for (let i = 0; i < 5; i += 1) {
      const res = await request(app).post("/api/v1/seeker/auth/login").send({
        email: "throttle@x.test", password: "wrong wrong wrong",
      });
      expect(res.status).toBe(401);
    }
    const sixth = await request(app).post("/api/v1/seeker/auth/login").send({
      email: "throttle@x.test", password: "wrong wrong wrong",
    });
    expect(sixth.status).toBe(429);
    expect(sixth.body.code).toBe("RATE_LIMITED");
    // A DIFFERENT email from the same IP is its own bucket.
    const other = await request(app).post("/api/v1/seeker/auth/login").send({
      email: "someone-else@x.test", password: "wrong wrong wrong",
    });
    expect(other.status).toBe(401);
  });

  it("throttles OTP requests at 3 per hour per email", async () => {
    await request(app).post("/api/v1/seeker/auth/register").send({
      fullName: "Limited", email: "limited@x.test", password: "correct horse battery staple",
    });
    for (let i = 0; i < 3; i += 1) {
      expect((await request(app).post("/api/v1/seeker/auth/resend-code").send({ email: "limited@x.test" })).status).toBe(200);
    }
    const fourth = await request(app).post("/api/v1/seeker/auth/resend-code").send({ email: "limited@x.test" });
    expect(fourth.status).toBe(429);
  });

  it("keeps the legacy /api/v1/user routes alive alongside the new mounts", async () => {
    // Not a 404: the legacy surface must survive until Task 15 so the
    // untouched frontend keeps working between now and Task 13.
    const res = await request(app).post("/api/v1/user/login").send({});
    expect(res.status).not.toBe(404);
  });
});
```

- [ ] **Step 5: Verify and commit**

```bash
npm test --workspace @jobportal/api
npm run typecheck
git add backend/src/routes/auth.route.ts backend/src/app.ts backend/src/lib/rateLimitStore.ts backend/tests/setup.ts backend/tests/auth/integration.test.ts
git commit -m "feat(api): mount portal auth routers with per-endpoint rate limits"
```

The full suite runs here, not just the new file — this is the first task that
changes `buildApp()`, so the existing health/error/rateLimit tests are the
regression canaries.

---

### Task 11: Portal isolation and concurrency suites

The adversarial matrix. Nothing new ships; these tests exist so the two
properties the whole design leans on — the portal wall and the atomic
redemption/rotation — cannot regress silently. Do not skip this task because
"the features already work"; these are the tests that catch the refactor that
quietly breaks them next month.

**Files:**
- Create: `backend/tests/auth/portalIsolation.test.ts`, `backend/tests/auth/concurrency.test.ts`

**Interfaces:**
- Consumes: `buildApp()` (Task 10), service internals (`rotateSession`, `verifyEmail`), models
- Produces: nothing — pure regression armour

- [ ] **Step 1: Write `backend/tests/auth/portalIsolation.test.ts`**

Through the real app. Add `signedUpOn(portal, email, overrides?)` to the shared
`tests/auth/helpers.ts` from Task 7 — it registers, verifies (via the capture
mailer), logs in, and returns `{ id, access, refresh, csrf }`. Put it there rather
than in this file: Task 12's `bridge.test.ts` and `profile.test.ts` both use it,
and a third copy is how three subtly different "sign in" helpers end up in one
suite.

`id` is on the return value because the profile and populate tests need to look
the account up directly; `overrides` lets a test set a distinguishable `fullName`.

```ts
describe("portal isolation", () => {
  it("keeps the same email as two independent accounts on the two portals", async () => {
    await signedUpOn("seeker", "both@x.test");
    await signedUpOn("recruiter", "both@x.test");
    expect(await Seeker.countDocuments({ email: "both@x.test" })).toBe(1);
    expect(await Recruiter.countDocuments({ email: "both@x.test" })).toBe(1);
  });

  it("rejects a seeker access token smuggled under the recruiter cookie name", async () => {
    const seeker = await signedUpOn("seeker", "wall@x.test");
    const res = await request(app)
      .get("/api/v1/recruiter/auth/me")
      .set("Cookie", [`jp_recruiter_at=${encodeURIComponent(seeker.access)}`]);
    expect(res.status).toBe(401);   // fails SIGNATURE verification, not a claim check
  });

  it("re-issues SEEKER cookies when a seeker refresh token hits the recruiter mount", async () => {
    const seeker = await signedUpOn("seeker", "mount@x.test");
    const res = await request(app)
      .post("/api/v1/recruiter/auth/refresh")
      .set("X-CSRF-Token", seeker.csrf)
      .set("Cookie", [
        `jp_recruiter_rt=${encodeURIComponent(seeker.refresh)}`,   // smuggled
        `jp_csrf=${encodeURIComponent(seeker.csrf)}`,
      ]);
    // The stored row says seeker, so whatever comes back is seeker-scoped.
    // Escalation would look like a jp_recruiter_at Set-Cookie here.
    const names = setCookieNames(res);
    expect(names).not.toContain("jp_recruiter_at");
    expect(names).not.toContain("jp_recruiter_rt");
    if (res.status === 200) expect(names).toContain("jp_seeker_at");
  });

  it("scopes verification state per portal for a dual-portal email", async () => {
    await signedUpOn("seeker", "dual@x.test");           // verified on seeker
    await request(app).post("/api/v1/recruiter/auth/register").send({
      fullName: "Dual", email: "dual@x.test", password: "correct horse battery staple",
    });                                                   // unverified on recruiter
    const res = await request(app).post("/api/v1/recruiter/auth/login").send({
      email: "dual@x.test", password: "correct horse battery staple",
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("EMAIL_NOT_VERIFIED");     // recruiter side unaffected by seeker verify
  });
});
```

- [ ] **Step 2: Write `backend/tests/auth/concurrency.test.ts`**

Service-level on purpose — the app's rate limiters would refuse the barrage
before the race under test could happen, and what is under test here is the
atomicity, not the throttle.

```ts
describe("concurrent refresh rotation", () => {
  it("lets exactly one of two simultaneous rotations win", async () => {
    const app = harness();                                  // Task 5's issue/rotate harness
    const sub = new Types.ObjectId();
    const res = await request(app).post("/issue/seeker").query({ sub: String(sub) });
    const raw = cookieValue(res, "jp_seeker_rt")!;

    const outcomes = await Promise.allSettled([
      request(app).post("/rotate").query({ token: raw }).then((r) => r.status),
      request(app).post("/rotate").query({ token: raw }).then((r) => r.status),
    ]);
    const statuses = outcomes.map((o) => (o.status === "fulfilled" ? o.value : 500)).sort();
    expect(statuses).toEqual([200, 401]);
    // One live replacement, not two, in the family.
    expect(await RefreshToken.countDocuments({ subjectId: sub, revokedAt: null })).toBe(1);
  });

  it("does NOT revoke the family for a retry inside the grace window", async () => {
    // rotate once, replay the original immediately: refused, family intact.
    // ...issue, rotate, then:
    const replay = await request(app).post("/rotate").query({ token: raw });
    expect(replay.status).toBe(401);
    expect(await RefreshToken.countDocuments({ subjectId: sub, revokedAt: null })).toBe(1);
  });

  it("revokes the whole family for a replay AFTER the grace window", async () => {
    // ...issue, rotate, then backdate the rotation past REUSE_GRACE_MS:
    await RefreshToken.updateMany({ subjectId: sub }, [{ $set: { revokedAt: { $cond: [{ $ne: ["$revokedAt", null] }, new Date(Date.now() - 10_000), "$revokedAt"] } } }]);
    const replay = await request(app).post("/rotate").query({ token: raw });
    expect(replay.status).toBe(401);
    expect(await RefreshToken.countDocuments({ subjectId: sub, revokedAt: null })).toBe(0);  // theft response
  });
});

describe("concurrent redemption", () => {
  it("honours the same correct code at most once across parallel redeemers", async () => {
    // register via service, capture code via mailer seam, then:
    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, () => verifyEmail("seeker", email, code)),
    );
    expect(attempts.filter((a) => a.status === "fulfilled").length).toBe(1);
    expect(await Seeker.countDocuments({ email, emailVerifiedAt: { $ne: null } })).toBe(1);
  });

  it("keeps EMAIL_TAKEN race-safe: parallel registrations yield one account", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        register("seeker", { fullName: "Racer", email: "race@x.test", password: "correct horse battery staple" }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(1);
    // Losers got the translated conflict, not a raw duplicate-key 500.
    for (const r of results) {
      if (r.status === "rejected") expect((r.reason as AppError).code).toBe("EMAIL_TAKEN");
    }
    expect(await Seeker.countDocuments({ email: "race@x.test" })).toBe(1);
  });
});
```

(The 50-way wrong-guess budget bound already lives in `otp.test.ts` at the
route level, where it also exercises the HTTP envelopes — no duplicate here.)

- [ ] **Step 3: Verify and commit**

```bash
npm test --workspace @jobportal/api
npm run typecheck
git add backend/tests/auth/portalIsolation.test.ts backend/tests/auth/concurrency.test.ts
git commit -m "test(api): add portal-isolation and concurrency regression suites"
```

---

### Task 12: The legacy bridge, the data migration, and the sweeper

Tasks 1-11 built a second, parallel authentication system. This task connects the
inherited application to it: the domain routes start reading the new session, the
inherited `users` documents become accounts on the two new collections, and
unverified registrations stop accumulating forever.

This is the task where a mistake is expensive, because it is the only one that
touches existing data. Two failure modes are worth naming before writing a line:

1. **Losing the object graph.** Every `Job.created_by`, `Application.applicant`
   and `Company.userId` in the database is an ObjectId pointing at a `users`
   document. If the migration mints fresh `_id`s, all of it dangles. The
   migration therefore **copies `_id` verbatim** — that single decision is what
   lets the untouched 1C-bound controllers keep working.
2. **Deleting the userbase.** Migrated accounts arrive unverified, carrying
   their original months-old `createdAt`. A sweeper keyed on age alone deletes
   every one of them on its first tick. `migratedFromLegacyAt` (Task 2) is the
   guard, and `sweeper.test.ts` has a test whose only job is to fail if someone
   drops it from the filter.

3. **Splitting the brain.** Copying rows leaves `updateProfile` writing to
   `users` while everything else reads the account collections, and leaves
   `populate({ path: "applicant" })` resolving against a collection that
   post-migration seekers are not in. Both fail *silently* — a successful-looking
   profile save that goes nowhere, and applicant rows that render blank. Step 6
   repoints the writer and the three `ref`s in the same commit as the copy, so
   the split never exists.

**Files:**
- Create: `backend/src/middleware/bridgeAuth.ts`, `backend/src/lib/sweeper.ts`, `backend/src/scripts/migrate-phase1b.ts`
- Modify: `backend/src/config/env.ts`, `backend/tests/setup.ts`, `backend/.env.example`, `backend/package.json`, `backend/src/server.ts`
- Modify: `backend/src/routes/{user,company,job,application}.route.ts`
- Modify: `backend/src/controllers/user.controller.ts` (`updateProfile` + new `getProfile`), `backend/src/models/{application,job,company}.model.ts` (one `ref` each)
- Modify: `packages/shared/src/{auth-dto,legacy-dto}.ts`, `frontend/src/components/admin/ApplicantsTable.tsx` — forced by the `ref` change, see Step 7
- Create: `backend/tests/auth/bridge.test.ts`, `migration.test.ts`, `sweeper.test.ts`, `profile.test.ts`

**Interfaces:**
- Consumes: `authenticate` internals (Task 6), `accountModel`/`findAccountById` (Task 6), `accessCookieName` (Task 5), the account models and `toSessionUser` (Task 2)
- Produces: `bridgeAuth(portal | "any", opts?)`, `sweepUnverifiedAccounts()`, `migratePhase1b(opts)`, `ProfileView`/`ProfileResponse` and `GET /api/v1/user/profile` — all four consumed by Task 13

**What this task deliberately does not do.** No ownership checks, no domain DTOs,
no CSRF on domain mutations, no signed resume URLs. Those are Phase 1C and they
stay there. Two behavioural changes *do* arrive here, both forced rather than
chosen: per-route portal scoping, because the bridge cannot populate `req.id`
without picking a session (Step 4), and `email` becoming non-editable on the
profile form, because leaving it editable next to a working password-reset flow
is an account-takeover primitive (Step 6).

- [ ] **Step 1: Add the three new environment variables**

In `backend/src/config/env.ts`, alongside the existing entries:

```ts
  /**
   * Accept the inherited `token` cookie on the domain routes while the frontend
   * is still being switched over (Task 13). Turning this off is the kill switch
   * that ends legacy authentication without a deploy; Task 15 deletes both the
   * flag and the code path it guards.
   *
   * Not `z.coerce.boolean()`: that returns `true` for the string "false", which
   * is the worst possible behaviour for a security kill switch.
   */
  LEGACY_AUTH_FALLBACK: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),

  /** Age at which an unverified, non-migrated account is deleted. */
  UNVERIFIED_ACCOUNT_TTL_HOURS: z.coerce.number().int().positive().default(24),

  /** How often the in-process sweeper runs. */
  SWEEP_INTERVAL_MINUTES: z.coerce.number().int().positive().default(60),
```

All three are defaulted, so nothing breaks if they are absent — but add them to
`backend/tests/setup.ts` anyway (`LEGACY_AUTH_FALLBACK = "true"`,
`UNVERIFIED_ACCOUNT_TTL_HOURS = "24"`, `SWEEP_INTERVAL_MINUTES = "60"`) and to
`.env.example` with comments. The rule in this repository is that every variable
is visible in both places; an undocumented defaulted variable is a variable
nobody knows they can tune.

- [ ] **Step 2: Write `backend/src/middleware/bridgeAuth.ts`**

```ts
import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import type { Portal } from "@jobportal/shared";
import { AppError } from "../lib/AppError.js";
import { env } from "../config/env.js";
import { accessCookieName } from "../lib/cookies.js";
import { verifyAccessToken } from "../services/session.service.js";
import { findAccountById } from "../services/account.service.js";
// Layering exception, deliberate: middleware does not normally import a model.
// The alternative is a `legacy.service.ts` created solely so that Task 15 can
// delete it three commits later. This whole module is transitional; keeping the
// exception inside it, marked, is less churn than spreading it across a file
// that has no other reason to exist.
import { User } from "../models/user.model.js";

/** Which portals a route will accept a session from. */
export type BridgeScope = Portal | "any";

const PORTAL_BY_LEGACY_ROLE = { student: "seeker", recruiter: "recruiter" } as const;
const CANDIDATES: readonly Portal[] = ["seeker", "recruiter"];

type BridgeOptions = {
  /** Defaults to `env().LEGACY_AUTH_FALLBACK`. Tests pass it explicitly —
   *  `env()` memoises on first read, so flipping `process.env` mid-suite does
   *  nothing, and a test that thinks it disabled the fallback would silently
   *  assert the opposite of what it means to. */
  legacyFallback?: boolean;
};

/**
 * Transitional authentication for the inherited domain routes.
 *
 * These routes are rebuilt in Phase 1C on `authenticate(portal)` and explicit
 * DTOs. Until then they keep reading `req.id`, and this middleware is what fills
 * it: preferring a real portal session, falling back to the inherited `token`
 * cookie only while `LEGACY_AUTH_FALLBACK` is on.
 *
 * `scope` is not an authorization decision — it answers "which of the two
 * cookies do I read", which is a question the route can answer and the
 * middleware cannot. Ownership is still unchecked; that is Phase 1C.
 */
export function bridgeAuth(scope: BridgeScope, options: BridgeOptions = {}) {
  return async function bridgeAuthMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    const allowed = scope === "any" ? CANDIDATES : [scope];

    // --- Preferred path: a real portal session. -----------------------------
    //
    // Ordered, not first-cookie-wins: a person may legitimately hold both a
    // seeker and a recruiter session in one browser (ADR-0001 exists precisely
    // so the same email can do that). On an "any" route the order below decides,
    // and it is fixed rather than incidental so that a dual-session user gets
    // the same identity on every request instead of one that depends on cookie
    // ordering in the header.
    for (const portal of allowed) {
      const token = req.cookies?.[accessCookieName(portal)] as string | undefined;
      if (!token) continue;

      let claims;
      try {
        claims = verifyAccessToken(token, portal);
      } catch {
        // A stale cookie for a portal this route accepts is not fatal on an
        // "any" route — the other portal's cookie may still be good. Keep
        // looking; if nothing validates we fall through to the legacy path.
        continue;
      }

      const account = await findAccountById(portal, claims.sub);
      if (!account || account.status !== "active") continue;

      const cutoff = account.sessionsInvalidatedAt;
      if (cutoff && claims.iat !== undefined) {
        if (claims.iat < Math.floor(cutoff.getTime() / 1000)) continue;
      }

      req.auth = {
        id: String(account._id),
        portal,
        emailVerified: account.emailVerifiedAt !== null,
      };
      // The whole point of the bridge. `_id` is preserved by the migration, so
      // this is the same ObjectId the legacy controllers have always seen.
      req.id = String(account._id);
      next();
      return;
    }

    // --- Fallback: the inherited cookie. DELETED IN TASK 15. ----------------
    const fallbackEnabled = options.legacyFallback ?? env().LEGACY_AUTH_FALLBACK;
    if (fallbackEnabled) {
      const legacy = req.cookies?.token as string | undefined;
      if (legacy) {
        const userId = readLegacyToken(legacy);
        if (userId) {
          // One indexed read, only on this path. Without it the legacy token
          // would satisfy `bridgeAuth("recruiter")` for a student account,
          // because the inherited JWT carries no role claim at all. That is the
          // status quo of Phase 1A, and reproducing it here would mean the
          // scope parameter is enforced on one path and decorative on the other
          // — the kind of asymmetry that survives into production.
          const user = await User.findById(userId).select({ role: 1 }).lean();
          const portal = user ? PORTAL_BY_LEGACY_ROLE[user.role as "student" | "recruiter"] : undefined;
          if (portal && (scope === "any" || scope === portal)) {
            req.auth = {
              id: String(userId),
              portal,
              // The inherited system never verified an email address. Reporting
              // `true` here would let a legacy token walk through any future
              // `requireVerified`; reporting `false` is both accurate and the
              // safe direction to be wrong in.
              emailVerified: false,
            };
            req.id = String(userId);
            next();
            return;
          }
        }
      }
    }

    next(AppError.unauthorized("SESSION_MISSING", "Sign in to continue."));
  };
}

/** Returns the subject of an inherited token, or undefined if it is not one. */
function readLegacyToken(token: string): string | undefined {
  try {
    const decoded = jwt.verify(token, env().JWT_ACCESS_SECRET) as JwtPayload;
    const userId: unknown = decoded.userId;
    return typeof userId === "string" ? userId : undefined;
  } catch {
    return undefined;
  }
}
```

Two things to notice, because a reviewer will ask about both.

**A new session always beats a legacy cookie.** The loop runs first and returns
before the fallback is even considered. A user who logs in through the new
endpoints while an old `token` cookie is still sitting in their jar gets the new
identity, not a resurrected one.

**`continue`, not `throw`, inside the loop.** On a single-portal route that makes
no difference. On an `"any"` route it is what stops one expired cookie from
locking a user out of a page their other, valid session should reach.

- [ ] **Step 3: Write `backend/src/lib/sweeper.ts`**

```ts
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
```

Wire it into `backend/src/server.ts`, after `connectDB` and before `listen`:

```ts
  const stopSweeper = startSweeper();
```

and call `stopSweeper()` inside `shutdown`, before `disconnectDB()`.

- [ ] **Step 4: Move the domain routes onto the bridge**

Four route files. Replace `isAuthenticated` with `bridgeAuth(...)`; change nothing
else. `isAuthenticated.ts` itself stays until Task 15 — the legacy `/api/v1/user`
auth routes are the only thing still importing it, and they go together.

```ts
// user.route.ts
router.route("/profile/update").post(bridgeAuth("any"), singleUpload, updateProfile);

// company.route.ts   — every company action is a recruiter action
router.route("/register").post(bridgeAuth("recruiter"), registerCompany);
router.route("/get").get(bridgeAuth("recruiter"), getCompany);
router.route("/get/:id").get(bridgeAuth("recruiter"), getCompanyById);
router.route("/update/:id").put(bridgeAuth("recruiter"), singleUpload, updateCompany);

// job.route.ts
router.route("/post").post(bridgeAuth("recruiter"), postJob);
router.route("/get").get(bridgeAuth("any"), getAllJobs);            // browse
router.route("/get/:id").get(bridgeAuth("any"), getJobById);        // browse
router.route("/getadminjobs").get(bridgeAuth("recruiter"), getAdminJobs);

// application.route.ts
router.route("/apply/:id").get(bridgeAuth("seeker"), applyJob);
router.route("/get").get(bridgeAuth("seeker"), getAppliedJobs);
router.route("/:id/applicants").get(bridgeAuth("recruiter"), getApplicants);
router.route("/status/:id/update").post(bridgeAuth("recruiter"), updateStatus);
```

**This tightens behaviour, on purpose, and it is the one place this task changes
what the API allows.** Today a student can `POST /api/v1/job/post`; afterwards
they get a 401. That is not Phase 1C's authorization work arriving early — it is
the unavoidable consequence of the bridge having to choose *which* of two
possible sessions to read on a route that stores the result in `created_by`.
Choosing "whichever cookie turns up first" would let a dual-portal user file a
job under their seeker `_id` and an application under their recruiter `_id`,
corrupting the object graph in a way no later phase can untangle. Given that the
choice must be made, making it correctly is cheaper than making it arbitrarily.

Ownership remains unchecked: a recruiter can still edit any company. That is
still Phase 1C, and `ARCHITECTURE.md` says so after Task 14.

The failure codes change from `NOT_AUTHENTICATED`/`INVALID_TOKEN` to
`SESSION_MISSING`. Nothing in `backend/tests/` or `frontend/src/` matches the old
strings — verified by grep before writing this — so no caller needs updating.

- [ ] **Step 5: Write `backend/src/scripts/migrate-phase1b.ts`**

```ts
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
```

Add to `backend/package.json`:

```json
"migrate:phase1b": "tsx src/scripts/migrate-phase1b.ts"
```

**Run order in a real deploy.** Ship the code, then
`npm run migrate:phase1b --workspace @jobportal/api -- --dry-run`, read the
report, then run it for real. The bridge tolerates both states, so there is no
window where the app is down: before the migration, users authenticate through
the legacy fallback; after it, they authenticate through either.

- [ ] **Step 6: Repoint the one profile writer and the three `ref: "User"` fields**

Copying rows is the easy half. The migration leaves the codebase with a **split
brain**: one writer (`updateProfile` → `users`) and every reader on the account
collections. Ignoring that costs more than fixing it, and the bill arrives in
three places:

1. A profile edited during 1B lands in `users`, where nothing looks. Silent data
   loss — the user sees "Profile updated successfully" and their next login shows
   the old values.
2. An account registered through the *new* endpoints has no `users` row at all,
   so `updateProfile` returns `USER_NOT_FOUND`. Profile editing simply does not
   work for anyone who signs up after this ships.
3. `getApplicants` populates `applicant` against `ref: "User"`. Post-migration
   seekers have no `users` row, so every applicant row renders blank name, blank
   email, no resume link. The recruiter side of the product stops working.

All three are the same bug. Fix the reference and the writer, both of which are
one-line-per-site changes that `_id` preservation makes safe.

First the three refs:

```ts
// application.model.ts
applicant: { type: Schema.Types.ObjectId, ref: "Seeker", required: true },

// job.model.ts
created_by: { type: Schema.Types.ObjectId, ref: "Recruiter", required: true },

// company.model.ts
userId: { type: Schema.Types.ObjectId, ref: "Recruiter", required: true },
```

This works *only* because Step 5 copies `_id` verbatim. Every stored ObjectId in
`applications`, `jobs` and `companies` already points at the right row in the new
collection; the `ref` string is the only thing that was wrong. No backfill, no
rewrite of existing documents.

The ref change is also what makes `select: false` on `passwordHash` (Task 2) load
bearing rather than decorative: from this commit on, `getApplicants` populates an
*account* document and returns it whole. Without the flag this step would be the
one that starts serving Argon2 hashes to any recruiter who can view a job's
applicants. With it, the field is not in the document to serialize. That is the
whole fix available at this altitude — `getApplicants` still returns a raw
Mongoose document, and building it a real DTO is 1C's job.

Then `updateProfile`, which becomes portal-aware:

```ts
// user.controller.ts — add these imports; `User`, `bcrypt` and `jwt` stay for
// now because the legacy auth handlers above still use them, and they leave
// together in Task 15.
import { findAccountById } from "../services/account.service.js";
import { toSessionUser } from "../services/auth.service.js";
import type { SeekerDocument } from "../models/seeker.model.js";

// The ONLY handler kept from this file past Task 15.
export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  const { fullname, phoneNumber, bio, skills } = req.body;

  // `email` is deliberately NOT read. The inherited controller let a signed-in
  // user rewrite their own address with no re-verification and no notice to
  // either mailbox, which in a codebase that now has password reset by email is
  // a full account-takeover primitive: change the address, then reset the
  // password to it. There is no verified email-change flow until 1C, so the
  // field is simply not editable. The frontend input goes read-only in Task 13.
  const { portal, id } = req.auth!;   // bridgeAuth guarantees both
  const account = await findAccountById(portal, id);
  if (!account) {
    throw AppError.unauthorized("SESSION_INVALID", "Sign in to continue.");
  }

  if (fullname) account.fullName = fullname;
  if (phoneNumber) account.phone = String(phoneNumber);

  // Recruiters have no `profile` subdocument and no resume. Guarding on the
  // portal rather than on the field keeps the narrowing honest for TypeScript.
  if (portal === "seeker") {
    const seeker = account as SeekerDocument;
    if (bio) seeker.profile.bio = bio;
    if (skills) {
      seeker.profile.skills = String(skills)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);   // "a,,b" produced an empty skill before
    }

    // The inherited version called getDataUri(file) unconditionally and threw a
    // TypeError on every request that carried no file — meaning a text-only
    // profile edit crashed with a 500. A resume is optional; treat it that way.
    const file = req.file as Express.Multer.File | undefined;
    if (file) {
      const upload = await getCloudinary().uploader.upload(getDataUri(file).content as string);
      seeker.resume.storageKey = upload.secure_url;
      seeker.resume.originalName = file.originalname;
      seeker.resume.mimeType = file.mimetype;
      seeker.resume.sizeBytes = file.size;
      seeker.resume.uploadedAt = new Date();
    }
  }

  await account.save();   // runs schema validators, unlike the migration's bulkWrite

  res.status(200).json({
    success: true,
    message: "Profile updated successfully.",
    profile: toProfileView(portal, account),   // note: portal first
  });
};
```

`SessionUser` alone is not enough for the page that calls this, though —
`Profile.tsx` renders a bio, skills, a phone number and a resume link, and
`SessionUser` deliberately carries none of them (Task 2: it is the *session*
contract, not a profile). So this step also adds the matching reader, and both
handlers return one shape.

In `packages/shared/src/auth-dto.ts`:

```ts
/**
 * The profile page's payload. Separate from `SessionUser` on purpose: session
 * state is small, cached in redux and persisted, while this is fetched on demand
 * and never persisted. Keeping them apart is what stops profile fields from
 * silently becoming part of the session contract.
 *
 * `resumeUrl` is a public Cloudinary URL in this phase. 1C makes it a signed,
 * short-lived one — the field name is chosen so that change is invisible here.
 */
export interface ProfileView {
  user: SessionUser;
  phone: string | null;
  seeker: {
    headline: string | null;
    bio: string | null;
    skills: string[];
    experienceYears: number | null;
    location: string | null;
    resumeUrl: string | null;
    resumeName: string | null;
  } | null;
  recruiter: { designation: string | null } | null;
}

export interface ProfileResponse {
  success: true;
  message?: string;
  profile: ProfileView;
}
```

The `seeker` / `recruiter` pair is nullable rather than a discriminated union
because the consumer already knows the portal from `user.portal`; a union would
force a narrowing dance in JSX for no added safety.

In `user.controller.ts`, one projection function used by both handlers:

```ts
function toProfileView(portal: Portal, account: AccountDocument): ProfileView {
  const seeker = portal === "seeker" ? (account as SeekerDocument) : null;
  const recruiter = portal === "recruiter" ? (account as RecruiterDocument) : null;
  return {
    user: toSessionUser(portal, account),
    phone: account.phone,
    // Field-by-field, never a spread of `account.profile`: a spread is how the
    // next field added to the schema ends up on the wire without anyone
    // deciding it should be.
    seeker: seeker && {
      headline: seeker.profile.headline,
      bio: seeker.profile.bio,
      skills: seeker.profile.skills,
      experienceYears: seeker.profile.experienceYears,
      location: seeker.profile.location,
      resumeUrl: seeker.resume.storageKey,
      resumeName: seeker.resume.originalName,
    },
    recruiter: recruiter && { designation: recruiter.designation },
  };
}

export const getProfile = async (req: Request, res: Response): Promise<void> => {
  const { portal, id } = req.auth!;
  const account = await findAccountById(portal, id);
  if (!account) throw AppError.unauthorized("SESSION_INVALID", "Sign in to continue.");
  res.status(200).json({ success: true, profile: toProfileView(portal, account) });
};
```

and `updateProfile` ends with the same shape, so the editor needs no follow-up
fetch:

```ts
  res.status(200).json({
    success: true,
    message: "Profile updated successfully.",
    profile: toProfileView(portal, account),
  });
```

Route, next to the existing one:

```ts
router.route("/profile").get(bridgeAuth("any"), getProfile);
```

Two properties worth stating. Both handlers build an explicit DTO, so
`passwordHash` cannot reach a client even if someone later removes
`select: false`. And `GET /profile` reads through `req.auth`, so it answers only
for the caller — there is no `:id` parameter to omit an ownership check on, which
is the one place in this phase where the 1C-shaped bug is structurally absent
rather than merely unexercised.

`GET /api/v1/user/profile/update` remains at its inherited path with its
inherited `multipart/form-data` body. Moving it under `/api/v1/{portal}/` would
be tidier and would break the frontend for no benefit inside this phase; 1C
relocates it as part of building the real profile module.

**What this step does not fix.** Public resume URLs stay public, `getApplicants`
still hands back a Mongoose document, and there is still no ownership check on
any of these routes. Those are 1C. This step exists to stop 1B from *losing
data*, not to finish the domain.

- [ ] **Step 7: Follow the ref change out to the shared types and the one table**

Repointing `applicant` changed what `getApplicants` puts on the wire — same
endpoint, different document shape — so `LegacyApplication.applicant` is now a
lie. Fix the type first and let the compiler find the consumer; `npm run typecheck`
covers the frontend workspace, so skipping this leaves Task 12 unable to pass its
own verification.

In `packages/shared/src/legacy-dto.ts`, replace `applicant?: LegacyUser` with a
type that describes what actually arrives:

```ts
/**
 * What `getApplicants` populates since Phase 1B repointed `Application.applicant`
 * from `users` to `seekers`.
 *
 * Still a serialized Mongoose document rather than a real DTO — that is the
 * inherited defect 1C fixes. It is written out field by field anyway, because a
 * type that admits everything is how a hash reaches a component. `passwordHash`
 * is absent from the document (`select: false`, Task 2) and absent from this
 * type: if a future edit removes the schema flag, this type is the second line
 * that has to be changed too, deliberately.
 */
export type PopulatedApplicant = {
  _id: string;
  fullName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  profile?: { bio: string | null; skills: string[] };
  resume?: { storageKey: string | null; originalName: string | null };
  createdAt?: string;
};
```

and in `LegacyApplication`: `applicant?: PopulatedApplicant;`.

`LegacyUser` itself stays for now — `authSlice`, `Login.tsx` and
`UpdateProfileDialog.tsx` still import it, and Task 13 is what removes those.
Deleting it here would break three files this task has no other reason to open.

Then `ApplicantsTable.tsx`, which is a field rename and one nesting change:

```tsx
<TableCell>{item.applicant?.fullName}</TableCell>
<TableCell>{item.applicant?.email}</TableCell>
<TableCell>{item.applicant?.phone}</TableCell>
<TableCell>
  {item.applicant?.resume?.storageKey ? (
    <a
      className="text-blue-600 cursor-pointer"
      href={item.applicant.resume.storageKey}
      target="_blank"
      rel="noopener noreferrer"
    >
      {item.applicant.resume.originalName ?? "Download"}
    </a>
  ) : (
    <span>NA</span>
  )}
</TableCell>
```

`originalName` needs the `?? "Download"` fallback because migrated resumes can
have a URL and no filename — the inherited schema only stored the name when the
upload went through its own form. Rendering an empty `<a>` there gives a
recruiter an invisible link.

- [ ] **Step 8: Write the four test files**

`backend/tests/auth/bridge.test.ts` — a throwaway app that mounts
`bridgeAuth(scope, { legacyFallback })` on `GET /probe` and echoes
`{ id: req.id, auth: req.auth }`.

```ts
describe("bridgeAuth", () => {
  it("populates req.id from a new portal session", async () => {
    const seeker = await signedUpOn("seeker", "bridge@x.test");
    const res = await probe("any", { cookies: [`jp_seeker_at=${seeker.access}`] });
    expect(res.status).toBe(200);
    expect(res.body.auth).toMatchObject({ portal: "seeker", emailVerified: true });
    expect(res.body.id).toBe(res.body.auth.id);
  });

  it("401s a seeker session on a recruiter-scoped route", async () => {
    const seeker = await signedUpOn("seeker", "scope@x.test");
    const res = await probe("recruiter", { cookies: [`jp_seeker_at=${seeker.access}`] });
    expect(res.status).toBe(401);
  });

  it("accepts the inherited token when the fallback is on", async () => {
    const user = await User.create({ fullname: "Old", email: "old@x.test", phoneNumber: 900,
      password: "x", role: "recruiter" });
    const token = jwt.sign({ userId: user._id }, process.env.JWT_ACCESS_SECRET!);
    const res = await probe("recruiter", { cookies: [`token=${token}`], legacyFallback: true });
    expect(res.status).toBe(200);
    expect(res.body.auth).toMatchObject({ portal: "recruiter", emailVerified: false });
  });

  it("rejects the inherited token when the fallback is off", async () => {
    // ...same setup...
    const res = await probe("recruiter", { cookies: [`token=${token}`], legacyFallback: false });
    expect(res.status).toBe(401);   // the Task 15 end state, provable today
  });

  it("derives the portal from the legacy role, not from the scope", async () => {
    // a role:"student" user's legacy token must NOT satisfy scope "recruiter"
    const res = await probe("recruiter", { cookies: [`token=${studentToken}`], legacyFallback: true });
    expect(res.status).toBe(401);
  });

  it("prefers a new session over a legacy cookie present at the same time", async () => {
    const seeker = await signedUpOn("seeker", "both@x.test");
    const res = await probe("any", {
      cookies: [`jp_seeker_at=${seeker.access}`, `token=${otherUsersLegacyToken}`],
      legacyFallback: true,
    });
    expect(res.body.auth.id).toBe(seeker.id);   // not the legacy user's id
  });

  it("falls through a stale cookie for one portal to the valid other one", async () => {
    const recruiter = await signedUpOn("recruiter", "mixed@x.test");
    const res = await probe("any", {
      cookies: [`jp_seeker_at=not-a-token`, `jp_recruiter_at=${recruiter.access}`],
    });
    expect(res.status).toBe(200);
    expect(res.body.auth.portal).toBe("recruiter");
  });
});
```

`backend/tests/auth/migration.test.ts`:

```ts
describe("migratePhase1b", () => {
  it("preserves _id so existing refs keep resolving", async () => {
    const user = await User.create({ fullname: "Ann", email: "Ann@X.test", phoneNumber: 12345,
      password: "$2b$10$abcdefghijklmnopqrstuv", role: "student",
      profile: { bio: "hi", skills: ["ts"], resume: "https://cdn/x.pdf", resumeOriginalName: "x.pdf" } });
    await migratePhase1b();
    const seeker = await Seeker.findById(user._id).select("+passwordHash");
    expect(seeker).not.toBeNull();
    expect(seeker!.email).toBe("ann@x.test");        // normalised
    expect(seeker!.fullName).toBe("Ann");
    expect(seeker!.phone).toBe("12345");             // now a string
    expect(seeker!.passwordHash).toBe("$2b$10$abcdefghijklmnopqrstuv");
    expect(seeker!.emailVerifiedAt).toBeNull();      // NOT grandfathered
    expect(seeker!.migratedFromLegacyAt).not.toBeNull();
    expect(seeker!.profile.skills).toEqual(["ts"]);
    expect(seeker!.resume.storageKey).toBe("https://cdn/x.pdf");
  });

  it("routes by role and reports rows it cannot route", async () => {
    await User.create({ fullname: "Seeker One", email: "s@x.test", phoneNumber: 1,
      password: "x", role: "student" });
    await User.create({ fullname: "Rec One", email: "r@x.test", phoneNumber: 2,
      password: "x", role: "recruiter" });
    // Written straight to the collection: `role` has an enum, so Mongoose would
    // reject this through the model. The migration still has to survive it —
    // inherited data predates the enum.
    await mongoose.connection.collection("users").insertOne({
      fullname: "Admin", email: "a@x.test", phoneNumber: 3, password: "x", role: "admin",
    });

    const report = await migratePhase1b();

    expect(report.scanned).toBe(3);
    expect(report.inserted).toEqual({ seeker: 1, recruiter: 1 });
    expect(await Seeker.countDocuments({})).toBe(1);
    expect(await Recruiter.countDocuments({})).toBe(1);
    // Reported, not silently dropped, and not guessed into a portal.
    expect(report.skippedBadRole).toEqual([{ id: expect.any(String), role: "admin" }]);
    expect(await Seeker.countDocuments({ email: "a@x.test" })).toBe(0);
    expect(await Recruiter.countDocuments({ email: "a@x.test" })).toBe(0);
  });

  it("is idempotent and never clobbers post-migration state", async () => {
    await migratePhase1b();
    await Seeker.updateOne({ email: "ann@x.test" }, { $set: { emailVerifiedAt: new Date() } });
    const second = await migratePhase1b();
    expect(second.inserted.seeker).toBe(0);
    const seeker = await Seeker.findOne({ email: "ann@x.test" });
    expect(seeker!.emailVerifiedAt).not.toBeNull();   // $setOnInsert did not undo it
  });

  it("reports an email already claimed on the new endpoints instead of throwing", async () => {
    await Seeker.create({ email: "clash@x.test", fullName: "New", passwordHash: "x" });
    await User.create({ fullname: "Old", email: "clash@x.test", phoneNumber: 1,
      password: "x", role: "student" });
    const report = await migratePhase1b();
    expect(report.emailConflicts).toHaveLength(1);
    expect(await Seeker.countDocuments({ email: "clash@x.test" })).toBe(1);
  });

  it("writes nothing on --dry-run", async () => {
    await User.create({ /* ... */ });
    const report = await migratePhase1b({ dryRun: true });
    expect(report.scanned).toBe(1);
    expect(await Seeker.countDocuments()).toBe(0);
  });
});
```

`backend/tests/auth/sweeper.test.ts`:

```ts
const hoursAgo = (n: number) => new Date(Date.now() - n * 3_600_000);

describe("sweepUnverifiedAccounts", () => {
  it("deletes an unverified account past the TTL", async () => {
    await seed({ email: "stale@x.test", emailVerifiedAt: null, createdAt: hoursAgo(48) });
    await sweepUnverifiedAccounts();
    expect(await Seeker.countDocuments({ email: "stale@x.test" })).toBe(0);
  });

  it("keeps an unverified account inside the TTL", async () => {
    await seed({ email: "fresh@x.test", emailVerifiedAt: null, createdAt: hoursAgo(2) });
    await sweepUnverifiedAccounts();
    expect(await Seeker.countDocuments({ email: "fresh@x.test" })).toBe(1);
  });

  it("keeps a verified account of any age", async () => {
    await seed({ email: "old@x.test", emailVerifiedAt: hoursAgo(500), createdAt: hoursAgo(9000) });
    await sweepUnverifiedAccounts();
    expect(await Seeker.countDocuments({ email: "old@x.test" })).toBe(1);
  });

  // The one that matters. If someone drops `migratedFromLegacyAt: null` from the
  // filter, every other test above still passes and this one fails.
  it("NEVER deletes a migrated account, however old and unverified", async () => {
    await seed({ email: "legacy@x.test", emailVerifiedAt: null,
      createdAt: hoursAgo(9000), migratedFromLegacyAt: new Date() });
    await sweepUnverifiedAccounts();
    expect(await Seeker.countDocuments({ email: "legacy@x.test" })).toBe(1);
  });

  it("cascades the account's OTP rows", async () => {
    const doomed = await seed({ emailVerifiedAt: null, createdAt: hoursAgo(48) });
    await OtpCode.create({ codeHash: "h", purpose: "verify_email",
      subjectId: doomed._id, subjectType: "seeker", expiresAt: hoursAgo(-1) });
    await sweepUnverifiedAccounts();
    expect(await OtpCode.countDocuments({ subjectId: doomed._id })).toBe(0);
  });

  it("sweeps past a single batch", async () => {
    await Seeker.insertMany(Array.from({ length: 505 }, (_, i) => ({
      email: `b${i}@x.test`, fullName: "B", passwordHash: "x",
      emailVerifiedAt: null, createdAt: hoursAgo(48),
    })), { timestamps: false });
    const deleted = await sweepUnverifiedAccounts();
    expect(deleted.seeker).toBe(505);   // BATCH is 500 — proves the loop
  });
});
```

`backend/tests/auth/profile.test.ts` — the repointed writer and the repointed
refs. Both are Step 6, and both are the kind of change that typechecks perfectly
while silently doing nothing.

```ts
describe("updateProfile on the account collections", () => {
  it("writes to the account, not to users, and returns a SessionUser", async () => {
    const seeker = await signedUpOn("seeker", "edit@x.test");
    const res = await request(app)
      .post("/api/v1/user/profile/update")
      .set("Cookie", [`jp_seeker_at=${seeker.access}`])
      .field("fullname", "Edited Name")
      .field("skills", "ts, node,, mongo");     // note the empty entry

    expect(res.status).toBe(200);
    // Explicit DTO all the way down: SessionUser inside, no hash anywhere.
    expect(Object.keys(res.body.profile.user).sort())
      .toEqual(["avatarUrl", "email", "emailVerified", "fullName", "id", "portal"]);
    expect(res.body.profile.recruiter).toBeNull();
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$argon2id\$/);

    const account = await Seeker.findById(seeker.id);
    expect(account!.fullName).toBe("Edited Name");
    expect(account!.profile.skills).toEqual(["ts", "node", "mongo"]);   // trimmed, no blanks
  });

  it("GET /profile returns what the profile page renders", async () => {
    const seeker = await signedUpOn("seeker", "read@x.test");
    await request(app)
      .post("/api/v1/user/profile/update")
      .set("Cookie", [`jp_seeker_at=${seeker.access}`])
      .field("bio", "hello").field("skills", "ts").field("phoneNumber", "+919876543210");

    const res = await request(app)
      .get("/api/v1/user/profile")
      .set("Cookie", [`jp_seeker_at=${seeker.access}`]);
    expect(res.status).toBe(200);
    expect(res.body.profile).toMatchObject({
      phone: "+919876543210",
      seeker: { bio: "hello", skills: ["ts"], resumeUrl: null },
    });
  });

  it("GET /profile 401s anonymously", async () => {
    expect((await request(app).get("/api/v1/user/profile")).status).toBe(401);
  });

  it("ignores an attempt to change the email", async () => {
    const seeker = await signedUpOn("seeker", "keep@x.test");
    const res = await request(app)
      .post("/api/v1/user/profile/update")
      .set("Cookie", [`jp_seeker_at=${seeker.access}`])
      .field("email", "attacker@x.test");
    expect(res.status).toBe(200);
    // Silently ignored, not honoured: the takeover path stays shut. If 1C adds a
    // real email-change flow this assertion is what tells you to update it.
    const account = await Seeker.findById(seeker.id);
    expect(account!.email).toBe("keep@x.test");
  });

  it("succeeds with no file attached", async () => {
    // The inherited controller threw a TypeError here and answered 500.
    const seeker = await signedUpOn("seeker", "nofile@x.test");
    const res = await request(app)
      .post("/api/v1/user/profile/update")
      .set("Cookie", [`jp_seeker_at=${seeker.access}`])
      .field("bio", "no resume today");
    expect(res.status).toBe(200);
    const account = await Seeker.findById(seeker.id);
    expect(account!.profile.bio).toBe("no resume today");
    expect(account!.resume.storageKey).toBeNull();
  });

  it("works for an account that never had a users row", async () => {
    // The gap this step closes: registered on the new endpoints, so no legacy row.
    const seeker = await signedUpOn("seeker", "brandnew@x.test");
    expect(await User.countDocuments({ email: "brandnew@x.test" })).toBe(0);
    const res = await request(app)
      .post("/api/v1/user/profile/update")
      .set("Cookie", [`jp_seeker_at=${seeker.access}`])
      .field("fullname", "Brand New");
    expect(res.status).toBe(200);
  });
});

describe("populate after the ref change", () => {
  it("resolves an applicant created on the new endpoints", async () => {
    const seeker = await signedUpOn("seeker", "applicant@x.test", { fullName: "Applicant Name" });
    const recruiter = await signedUpOn("recruiter", "hiring@x.test");
    const company = await Company.create({ name: "Acme", userId: recruiter.id });
    const job = await Job.create({
      title: "Dev", description: "d", salary: 1, experienceLevel: 1, location: "Remote",
      jobType: "full-time", position: 1, company: company._id, created_by: recruiter.id,
    });
    const application = await Application.create({ job: job._id, applicant: seeker.id });
    await Job.updateOne({ _id: job._id }, { $push: { applications: application._id } });

    const res = await request(app)
      .get(`/api/v1/application/${job._id}/applicants`)
      .set("Cookie", [`jp_recruiter_at=${recruiter.access}`]);

    expect(res.status).toBe(200);
    // Before the ref change this was null — the seeker has no `users` row.
    expect(res.body.job.applications[0].applicant.fullName).toBe("Applicant Name");
    // And the hash is gone from a response that used to carry it.
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$argon2id\$|\$2[aby]\$/);
  });
});
```

That last assertion is the one worth keeping when this file is rewritten in 1C:
it is a regression test for the inherited password-hash leak, expressed as
something a future edit cannot quietly undo.

- [ ] **Step 9: Verify and commit**

```bash
npm run typecheck
npm test --workspace @jobportal/api
git add backend/src/middleware/bridgeAuth.ts backend/src/lib/sweeper.ts \
  backend/src/scripts/migrate-phase1b.ts backend/src/config/env.ts backend/src/server.ts \
  backend/src/controllers/user.controller.ts \
  backend/src/models/application.model.ts backend/src/models/job.model.ts \
  backend/src/models/company.model.ts \
  backend/src/routes/user.route.ts backend/src/routes/company.route.ts \
  backend/src/routes/job.route.ts backend/src/routes/application.route.ts \
  backend/package.json backend/.env.example backend/tests/setup.ts \
  backend/tests/auth/bridge.test.ts backend/tests/auth/migration.test.ts \
  backend/tests/auth/sweeper.test.ts backend/tests/auth/profile.test.ts \
  packages/shared/src/auth-dto.ts packages/shared/src/legacy-dto.ts \
  frontend/src/components/admin/ApplicantsTable.tsx
git commit -m "feat(api): bridge domain routes to portal sessions, migrate users, sweep unverified"
```

---

### Task 13: The frontend switch

Everything the API needs now exists. This task moves the client onto it, and it
is the task where the phase is most likely to *look* finished while being broken,
for one structural reason: **`frontend` has no test runner.** There is no
`vitest`, no `@testing-library/react`, no Playwright — `package.json` has only
`dev`, `build`, `lint`, `preview`, `typecheck`. So the verification that carried
Tasks 1-12 is unavailable here, and pretending otherwise is the failure mode.

What replaces it: TypeScript is made to carry as much as it can (replacing
`LegacyUser` with `SessionUser` turns every stale field read into a compile
error, which is why that swap happens *first* and not last), plus an explicit
manual smoke checklist in Step 9 that must actually be walked. Adding a frontend
test runner is real work with real decisions in it and it is not this phase's
job — it is filed in Task 14's follow-up list.

Three things make this more than a find-and-replace:

1. **Two portals, two cookie sets, one origin.** The client must know which
   portal it is talking to on every request, and after a page reload the only
   thing that survives is a `localStorage` hint plus whatever `/me` says.
2. **Refresh is now a thing that happens.** Access tokens are short-lived, so any
   request can 401 mid-session and needs a transparent retry — exactly once,
   single-flighted, or a page with six parallel fetches fires six refreshes and
   the reuse-detector kills the family (Task 5).
3. **redux-persist holds a `LegacyUser` today.** Every existing browser has one
   in `localStorage` right now. On first load after this ships, that object
   rehydrates into a store whose type says `SessionUser`, and no amount of
   correct new code prevents it — the fix is a version bump that discards it.

**Files:**
- Modify: `frontend/src/lib/apiClient.ts` (CSRF header, refresh interceptor), `frontend/src/redux/authSlice.ts`, `frontend/src/redux/store.ts` (persist version), `frontend/src/App.tsx` (routes + bootstrap)
- Modify: `frontend/src/components/auth/{Login,Signup}.tsx`, `frontend/src/components/shared/Navbar.tsx`, `frontend/src/components/admin/ProtectedRoute.tsx`, `frontend/src/components/{Profile,UpdateProfileDialog,Home,JobDescription}.tsx`, `frontend/src/components/admin/ApplicantsTable.tsx`
- Create: `frontend/src/lib/portal.ts`, `frontend/src/components/auth/{VerifyEmail,ForgotPassword,ResetPassword,AuthComplete,LinkPending,AuthError,ConfirmGoogleLink}.tsx`
- Create: `frontend/src/hooks/useAuthBootstrap.ts`

**Interfaces:**
- Consumes: `SessionUser`, `Portal`, `AuthErrorCode`, the body schemas (Task 1), every endpoint from Task 10, the redirect targets from Task 9
- Produces: nothing the backend consumes — this is the last layer

- [ ] **Step 1: Give the client a portal, a CSRF header, and one refresh**

`frontend/src/lib/portal.ts` — the portal hint, isolated so that exactly one file
knows the storage key:

```ts
import type { Portal } from "@jobportal/shared";

const KEY = "jp.portal";

/**
 * Which portal this browser last signed into.
 *
 * A *hint*, never a credential. It decides which URL to send `/refresh` and
 * `/me` to; it grants nothing. Tampering with it can only produce a 401,
 * because authority lives in the httpOnly cookie whose key is derived per
 * portal (Task 3) — a seeker token presented at the recruiter mount fails the
 * signature check.
 *
 * It exists because the access cookie is `httpOnly`: JavaScript genuinely
 * cannot see which session it holds, and the alternative — trying both mounts
 * on every refresh — doubles the requests and makes the reuse-detector's job
 * ambiguous.
 */
export function getPortalHint(): Portal | null {
  const raw = localStorage.getItem(KEY);
  return raw === "seeker" || raw === "recruiter" ? raw : null;
}

export function setPortalHint(portal: Portal): void {
  localStorage.setItem(KEY, portal);
}

export function clearPortalHint(): void {
  localStorage.removeItem(KEY);
}
```

Then `apiClient.ts` in full. Read the comments before simplifying any of it —
each guard is a specific failure:

```ts
import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { getPortalHint } from "./portal";

/**
 * Reads a non-httpOnly cookie. Only ever used for the CSRF token, which is
 * deliberately readable — that is the entire mechanism of double-submit.
 *
 * In production the cookie is `__Host-jp_csrf` (Task 5); in development it is
 * `jp_csrf`. Both names are tried because the frontend does not know which
 * environment the API is running in, and getting this wrong fails only in
 * production, only on mutations.
 */
function readCsrfToken(): string | null {
  for (const name of ["__Host-jp_csrf", "jp_csrf"]) {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  return null;
}

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
});

/**
 * DEPLOYMENT NOTE — read before deciding where to host these two apps.
 *
 * `COOKIE_SAMESITE` defaults to `strict`, and SameSite compares *sites*
 * (registrable domains), not origins. So:
 *
 *   - Same origin behind one proxy: works.
 *   - `app.example.com` → `api.example.com`: same site, different origin. The
 *     cookie IS sent under `strict`; CORS needs the exact origin allowlisted
 *     (`CLIENT_URLS`) and this file's `withCredentials`. Works unchanged.
 *   - `app.vercel.app` → `api.onrender.com`: different registrable domains,
 *     genuinely cross-site. `strict` withholds every session cookie and nothing
 *     in this file can fix it — set `COOKIE_SAMESITE=none` (HTTPS on both,
 *     which `__Host-` requires anyway). That is what the variable is for, and
 *     using it is not the "weaken a cookie flag" the guardrail forbids; editing
 *     the default in code would be.
 *
 * `__Host-` is compatible with all three: it forbids a `Domain` attribute, so
 * each origin sets its own cookie rather than one cookie spanning both. See
 * ADR-0005.
 */
apiClient.interceptors.request.use((config) => {
  const method = (config.method ?? "get").toLowerCase();
  if (method !== "get" && method !== "head") {
    const token = readCsrfToken();
    if (token) config.headers.set("X-CSRF-Token", token);
  }
  return config;
});
```

- [ ] **Step 2: Add the single-flight refresh interceptor to the same file**

```ts
/** Marks a request that has already been retried, so a retry cannot recurse. */
type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

/**
 * The in-flight refresh, shared by every 401 that arrives while it is pending.
 *
 * This is the whole point. Six components mounting at once produce six 401s;
 * without this they produce six POST /refresh calls, five of which present a
 * token the first has already rotated. Task 5's reuse detector reads that as
 * theft and revokes the entire family — the user is logged out by their own
 * page load. One promise, awaited by all six.
 */
let refreshInFlight: Promise<void> | null = null;

/** Session ended for real. Task 4's Step 4 wires the store teardown here. */
let onSessionLost: () => void = () => {};
export function setSessionLostHandler(handler: () => void): void {
  onSessionLost = handler;
}

function refreshOnce(portal: string): Promise<void> {
  refreshInFlight ??= apiClient
    .post(`/${portal}/auth/refresh`)
    .then(() => undefined)
    .finally(() => {
      // Cleared in `finally`, not `then`: leaving a rejected promise cached
      // means every later 401 re-rejects with a stale error and the user can
      // never recover without a hard reload.
      refreshInFlight = null;
    });
  return refreshInFlight;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;
    const status = error.response?.status;
    const url = config?.url ?? "";

    // Not a 401, no config to replay, or already retried once: give up.
    if (status !== 401 || !config || config._retried) throw error;

    // Never refresh in response to an auth endpoint's own 401. `/refresh`
    // 401ing means the refresh token is dead; `/login` 401ing means wrong
    // password. Retrying either is at best pointless and at worst an infinite
    // loop between the interceptor and itself.
    if (url.includes("/auth/refresh") || url.includes("/auth/login")) {
      if (url.includes("/auth/refresh")) onSessionLost();
      throw error;
    }

    const portal = getPortalHint();
    if (!portal) throw error;   // never signed in here; nothing to refresh

    config._retried = true;
    try {
      await refreshOnce(portal);
    } catch {
      onSessionLost();
      throw error;   // the ORIGINAL error — the refresh failure is an internal detail
    }
    return apiClient(config);
  },
);
```

One asymmetry is deliberate: a 401 from `/me` *is* refreshed (it is not in the
exclusion list), because that is precisely the bootstrap case where the access
token expired while the tab was closed and the refresh token is still good.

- [ ] **Step 3: Swap the store's user type and bump the persist version**

`authSlice.ts`:

```ts
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { SessionUser } from "@jobportal/shared";

type AuthState = {
  loading: boolean;
  user: SessionUser | null;
  /**
   * Whether `/me` has answered yet. Distinct from `user === null`, which cannot
   * tell "signed out" from "not asked yet" — and a guard that cannot tell those
   * apart bounces a signed-in recruiter to the home page on every hard reload.
   */
  bootstrapped: boolean;
};
```

with `setUser: (state, action: PayloadAction<SessionUser | null>)` and a
`setBootstrapped` reducer. Do this swap **before** touching any component: the
resulting ~15 compile errors are the complete, authoritative list of places that
read a field the API no longer sends. Working from the errors is how this task
avoids missing one.

Then `store.ts`:

```ts
const persistConfig = {
  key: "root",
  // 1 -> 2: every browser that has used this app has a LegacyUser in
  // localStorage under version 1 — `{ fullname, phoneNumber, role, profile }`.
  // redux-persist rehydrates whatever it finds, so without this bump the store
  // would come up holding an object that TypeScript insists is a SessionUser and
  // that every component reads incorrectly: `user.fullName` undefined,
  // `user.portal` undefined, so ProtectedRoute fails open or closed at random.
  //
  // No migration function, because there is nothing to migrate: `role` does not
  // determine `portal` reliably (a legacy "student" is a seeker, but the account
  // may not exist on that portal until the migration runs), and `/me` gives the
  // truth in one request anyway. Bumping the version discards the old subtree,
  // which is the intended behaviour.
  version: 2,
  storage,
};
```

- [ ] **Step 4: Bootstrap from `/me`, and wire the session-lost handler**

`frontend/src/hooks/useAuthBootstrap.ts`:

```ts
import { useEffect } from "react";
import type { SessionUser } from "@jobportal/shared";
import { apiClient, setSessionLostHandler } from "@/lib/apiClient";
import { clearPortalHint, getPortalHint } from "@/lib/portal";
import { setBootstrapped, setUser } from "@/redux/authSlice";
import { useAppDispatch } from "@/redux/store";

/**
 * Asks the server who this browser is, once, at startup.
 *
 * Persisted state is a cache, not a source of truth: the cookie may have expired,
 * been revoked from another tab, or the account may have been suspended, and none
 * of that touches localStorage. `/me` is the only authority. Until it answers,
 * `bootstrapped` is false and the guards wait.
 */
export function useAuthBootstrap(): void {
  const dispatch = useAppDispatch();

  useEffect(() => {
    // Registered before the request, so a 401 on /refresh during bootstrap
    // clears the stale user instead of leaving it on screen.
    setSessionLostHandler(() => {
      clearPortalHint();
      dispatch(setUser(null));
      dispatch(setBootstrapped(true));
    });

    const portal = getPortalHint();
    if (!portal) {
      // Never signed in on this browser. Do not call /me: it would 401, and a
      // 401 in the network tab on every anonymous visit trains people to ignore
      // 401s in the network tab.
      dispatch(setUser(null));
      dispatch(setBootstrapped(true));
      return;
    }

    let cancelled = false;
    apiClient
      .get<{ success: true; user: SessionUser }>(`/${portal}/auth/me`)
      .then((res) => {
        if (!cancelled) dispatch(setUser(res.data.user));
      })
      .catch(() => {
        if (!cancelled) {
          clearPortalHint();
          dispatch(setUser(null));
        }
      })
      .finally(() => {
        if (!cancelled) dispatch(setBootstrapped(true));
      });

    return () => {
      cancelled = true;
    };
  }, [dispatch]);
}
```

Call it once, in `App.tsx`, above the router — not in a component that unmounts
on navigation, or it re-fires on every route change:

```tsx
function App() {
  useAuthBootstrap();
  return <RouterProvider router={appRouter} />;
}
```

`App` is already inside `<Provider>` and `<PersistGate>` in `main.tsx`, so
`useAppDispatch` works there as written — no change needed to `main.tsx`.

- [ ] **Step 5: Make Login and Signup portal-aware**

The radio group survives, and it is worth being precise about why, because it
*looks* like the defect it replaces.

Today the radio sends `role` in the request body and the server checks it against
the stored role — client-supplied role, listed in CLAUDE.md's known defects. After
this change the radio picks **which URL to post to**: `/api/v1/seeker/auth/login`
or `/api/v1/recruiter/auth/login`. Nothing about it reaches a database field. An
account exists in exactly one collection (ADR-0001), so choosing the wrong portal
produces `INVALID_CREDENTIALS` and nothing else — it cannot grant a role, because
there is no role field left to grant.

Relabel it accordingly: "Job seeker" / "Recruiter" as an account-type choice, not
"Student"/"Recruiter" as an identity claim. `Login.tsx`'s handler becomes:

```tsx
const [portal, setPortal] = useState<Portal>("seeker");
const [input, setInput] = useState({ email: "", password: "" });   // no `role`

const submitHandler = async (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  try {
    dispatch(setLoading(true));
    const res = await apiClient.post<AuthResponse>(`/${portal}/auth/login`, input);
    // Hint written only after the server agreed. Writing it before would leave a
    // failed login pointing the refresh interceptor at the wrong portal.
    setPortalHint(portal);
    dispatch(setUser(res.data.user));
    navigate("/");
  } catch (error) {
    // EMAIL_NOT_VERIFIED is not a failure the user can act on from here — it
    // means "finish signing up". Route them instead of showing a dead end.
    if (getApiErrorCode(error) === "EMAIL_NOT_VERIFIED") {
      navigate(`/verify-email?portal=${portal}&email=${encodeURIComponent(input.email)}`);
      return;
    }
    toast.error(getApiErrorMessage(error, "Login failed"));
  } finally {
    dispatch(setLoading(false));
  }
};
```

That needs a code reader alongside the existing message reader, in `apiError.ts`:

```ts
/** The `code` from the API's error envelope, or null if this was not one. */
export function getApiErrorCode(error: unknown): string | null {
  if (!axios.isAxiosError(error)) return null;
  const data = error.response?.data as { code?: unknown } | undefined;
  return typeof data?.code === "string" ? data.code : null;
}
```

Add a "Forgot password?" link to `/forgot-password?portal=${portal}` and a
"Continue with Google" button. The Google button must be a real navigation, not a
fetch — the OAuth flow is a series of top-level redirects and XHR cannot follow
them:

```tsx
<Button type="button" variant="outline"
  onClick={() => { window.location.href = `${import.meta.env.VITE_API_URL}/${portal}/auth/google`; }}>
  Continue with Google
</Button>
```

`Signup.tsx` changes shape more, because registration no longer signs anyone in:

- Fields become `fullName`, `email`, `password`, optional `phone` — matching
  `registerBodySchema` (Task 1). `phone` must be E.164 (`+919876543210`); say so
  in the placeholder, or every user fails validation once.
- The avatar upload goes away. The new register endpoint takes JSON, not
  `multipart/form-data`, and there is no avatar upload endpoint in this phase
  (`avatarUrl` is populated by Google or by the migration). Keeping a file input
  that silently discards the file is worse than not having one.
- On 201, navigate to `/verify-email?portal=…&email=…`. Do **not** dispatch
  `setUser` — the API deliberately issues no session before verification (Task 7),
  so setting a user here would produce a UI that thinks it is signed in and a
  server that disagrees on the next request.
- Password minimum is 12 characters (`passwordSchema`). Show that as helper text
  rather than letting the server be the first to mention it.

- [ ] **Step 6: Add the seven new pages**

All seven read `portal` from the query string and validate it, because a
hand-edited `?portal=nonsense` must not become a URL segment:

```ts
function usePortalParam(): Portal {
  const [params] = useSearchParams();
  const raw = params.get("portal");
  return raw === "recruiter" ? "recruiter" : "seeker";   // default, never throw
}
```

**`VerifyEmail.tsx`** — `?portal=&email=`. A 6-digit input, posts
`{ email, code }` to `/${portal}/auth/verify-email`. On success the server *does*
issue a session (Task 7), so: `setPortalHint(portal)`, `dispatch(setUser(...))`,
navigate `/`. Include a "Resend code" button hitting `/resend-code`, and expect it
to be rate-limited to 3/hour/email — surface `RATE_LIMITED` as "Too many codes
requested. Try again later" rather than a raw message.

**`ForgotPassword.tsx`** — an email field, posts to `/forgot-password`, then
always shows the same confirmation regardless of the response. The endpoint is
deliberately non-committal about whether the address exists (Task 8's ghost OTP);
a UI that says "no account with that email" hands back the enumeration oracle the
backend just spent effort closing. Then navigate to
`/reset-password?portal=…&email=…`.

**`ResetPassword.tsx`** — code + new password, posts `{ email, code, newPassword }`.
On success navigate to `/login` with a toast; the server does not sign the user in
after a reset and neither should this. Handle `PASSWORD_REUSED` distinctly — that
one is actionable and its message is worth showing verbatim.

**`AuthComplete.tsx`** — the Google success landing at `/auth/complete?portal=`.
Cookies are already set by the redirect; this page only has to teach the client
what happened:

```tsx
useEffect(() => {
  setPortalHint(portal);
  apiClient.get<{ success: true; user: SessionUser }>(`/${portal}/auth/me`)
    .then((res) => { dispatch(setUser(res.data.user)); navigate("/", { replace: true }); })
    .catch(() => navigate("/auth/error?code=GOOGLE_AUTH_FAILED", { replace: true }));
}, [portal, dispatch, navigate]);
```

`replace: true` on both: without it, Back returns to a callback URL carrying a
spent `code` and `state`, which fails and looks like a bug.

**`LinkPending.tsx`** — `/auth/link-pending`. Static text: a confirmation email
has been sent, click the link in it. No parameters, nothing to submit. This is the
step-up branch from Task 9 (branch 2b), and the whole point is that the browser
cannot complete it.

**`ConfirmGoogleLink.tsx`** — `/auth/confirm-google-link?portal=&token=`. Posts
`{ token }` to `/${portal}/auth/google/confirm-link`. Render a button rather than
firing on mount: mail clients and security scanners prefetch links, and an
auto-submitting page lets a scanner burn the token before the human clicks it.
On success, tell them to sign in with Google and link to `/login`.

**`AuthError.tsx`** — `/auth/error?code=`. Maps the code to a sentence
(`GOOGLE_AUTH_FAILED` → "Google sign-in could not be completed.";
`GOOGLE_LINK_INVALID` → "That confirmation link is invalid or has expired.") with
a generic fallback, plus a link back to `/login`. Render the *mapped* string only
— never the raw query parameter, which is attacker-controlled text on a page of
yours.

Register all seven in `App.tsx` as public routes.

- [ ] **Step 7: Fix the guards and the components the type swap broke**

`ProtectedRoute.tsx` has two bugs, and only one of them is the type change:

```tsx
const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { user, bootstrapped } = useAppSelector((state) => state.auth);
  const navigate = useNavigate();

  useEffect(() => {
    // Waiting for /me is not the same as being signed out. Without this, every
    // hard reload of an admin page bounces the recruiter to the home page
    // before the answer arrives.
    if (!bootstrapped) return;
    if (!user || user.portal !== "recruiter") navigate("/", { replace: true });
  }, [user, bootstrapped, navigate]);

  // The inherited version rendered `children` while redirecting, so admin UI
  // flashed on screen for non-recruiters and its data fetches fired. Render
  // nothing until the check passes.
  if (!bootstrapped || !user || user.portal !== "recruiter") return null;
  return <>{children}</>;
};
```

The comment about this being a client-side guard only stays true and stays in the
file — server-side ownership is still 1C.

The rest is mechanical, driven by the compile errors from Step 3:

| File | Was | Becomes |
|---|---|---|
| `Navbar.tsx` | `user.role === "recruiter"` | `user.portal === "recruiter"` |
| `Navbar.tsx` | `user.role === "student"` | `user.portal === "seeker"` |
| `Navbar.tsx` | `user?.profile?.profilePhoto`, `user?.fullname` | `user?.avatarUrl ?? undefined`, `user?.fullName` |
| `Navbar.tsx` | `user?.profile?.bio` in the popover | `user?.email` — `SessionUser` has no bio, and the email is the more useful identifier anyway |
| `Home.tsx` | `user?.role === "recruiter"` | `user?.portal === "recruiter"` |
| `JobDescription.tsx` | `user?._id` | `user?.id` |

`avatarUrl` is `string | null` while `AvatarImage`'s `src` is `string | undefined`,
hence the `?? undefined` — `null` is not assignable and this is the one place the
compiler will insist.

`Navbar.tsx`'s logout also moves: `POST /${portal}/auth/logout` (the interceptor
attaches the CSRF header), then `clearPortalHint()` and `dispatch(setUser(null))`.
Read the portal from `user.portal`, not the hint — the hint is for when there is
no user.

`Profile.tsx` and `UpdateProfileDialog.tsx` need more than a rename, because
`SessionUser` carries no profile fields by design. Both move onto Task 12's
`GET /api/v1/user/profile`:

- `Profile.tsx` fetches `ProfileView` in a `useEffect`, holds it in local state
  (not redux — it is page data, not session state), and reads
  `profile.seeker?.bio`, `.skills`, `.resumeUrl`, `.resumeName`, `profile.phone`.
  Name and avatar still come from `profile.user`.
- `UpdateProfileDialog.tsx` prefills from the same object, and **the email input
  becomes read-only** with helper text — Task 12 dropped `email` from the mutable
  set, so an editable field there would silently discard what the user typed.
  It still posts `multipart/form-data` to `/user/profile/update`; the response is
  now `{ profile }`, so it dispatches `setUser(res.data.profile.user)` and hands
  the profile back to `Profile.tsx` through a callback prop.

- [ ] **Step 8: Verify what can be verified**

```bash
npm run typecheck
npm run lint --workspace @jobportal/web
npm run build --workspace @jobportal/web
```

`build` matters beyond typecheck: it catches an import that resolves in the IDE
but not under Vite's `Bundler` resolution, and this task adds nine new files.

- [ ] **Step 9: Walk the smoke checklist**

There is no test runner in this workspace, so this list *is* the test suite. Run
the API with `LEGACY_AUTH_FALLBACK=true` (its default) and walk it in a browser,
reading codes from Task 4's development mailer.

Registration and verification:
1. Sign up as a seeker → lands on verify-email, and **no session cookie is set**
   (DevTools → Application → Cookies). This is Task 7's contract and the easiest
   thing to break silently
2. Wrong code twice, then the right one → signs in, `jp_seeker_at` and
   `jp_seeker_rt` appear
3. Sign up as a recruiter with the *same* email → allowed (ADR-0001), separate
   account

Session behaviour:
4. Hard-reload while signed in → still signed in, exactly one `GET /me`
5. Delete `jp_seeker_at`, keep `jp_seeker_rt`, navigate → exactly **one**
   `POST /refresh` and the page works. Two or more means the single-flight guard
   is broken
6. Delete both cookies and navigate → signed-out state, no redirect loop
7. Sign in as a recruiter in a second browser profile → `/admin/companies` works
   there, redirects in the seeker's browser

Password reset:
8. Forgot password with a **nonexistent** address → same confirmation, and the
   response is indistinguishable from the real one
9. Reset with the emailed code, then try the old password → rejected; new one works
10. Reuse the same code → rejected

Google (needs credentials; skip and record that if unavailable):
11. Continue with Google as a new user → `/auth/complete`, signed in
12. Same Google account on the other portal → separate account, both usable

The bridge and the profile:
13. With a pre-existing legacy `token` cookie, load a domain route → still works.
    That is what `LEGACY_AUTH_FALLBACK` buys, and it is what Task 15 removes
14. Edit a profile as a seeker with **no file attached** → 200, values survive a
    reload (this is the crash Task 12's upload guard fixed)
15. The email field is read-only
16. As a recruiter, open a job's applicants → names, emails and resume links
    render, and **search the response for `passwordHash` and `$argon2id$` — both
    must be absent**

Record the outcome of each. A checklist walked in the head is not a checklist.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/lib/apiClient.ts frontend/src/lib/apiError.ts frontend/src/lib/portal.ts \
  frontend/src/hooks/useAuthBootstrap.ts frontend/src/redux/authSlice.ts \
  frontend/src/redux/store.ts frontend/src/App.tsx frontend/src/components/auth \
  frontend/src/components/shared/Navbar.tsx frontend/src/components/admin/ProtectedRoute.tsx \
  frontend/src/components/Profile.tsx frontend/src/components/UpdateProfileDialog.tsx \
  frontend/src/components/Home.tsx frontend/src/components/JobDescription.tsx
git commit -m "feat(web): move the client onto portal-scoped sessions"
```

---

### Task 14: Make the documentation true again

Every document in this repository currently describes Phase 1A plus a *plan* for
1B. After Task 13 the plan is the code, and the docs are wrong in the most
expensive direction: they list fixed defects as open, describe designs that were
amended during implementation, and — in two places — actively recommend something
that no longer works.

This is not a cosmetic pass. `SECURITY.md`'s defect table is what a reader
consults before deploying, and leaving `httpsOnly` in the "not yet fixed" column
after fixing it teaches people to distrust the whole table.

Read each file before editing it. Several claims below were checked against the
code while writing this plan and are stated as facts, but the code will have
moved by the time this task runs.

**Files:**
- Modify: `CLAUDE.md`, `SECURITY.md`, `ARCHITECTURE.md`, `README.md`, `backend/.env.example`
- Modify: `docs/adr/0001-two-account-collections.md`, `docs/adr/0002-in-house-auth.md`, `docs/adr/0005-cookie-sessions.md`

**Interfaces:** none. This task changes no code and must not.

- [ ] **Step 1: `CLAUDE.md` — the current-state section**

Replace the "Current state" block. It currently says 1B and 1C "are not yet
built" and lists seven defects as present by design; four of those are now fixed:

```markdown
## Current state

Phases 1A (foundation) and 1B (authentication) are complete. Phase 1C
(authorization and domain) is not yet built, so the following known defects are
still present *by design* and should not be treated as surprises:

- No ownership checks on any route — any authenticated recruiter can edit any
  company. Portal *scoping* exists (a seeker cannot reach a recruiter route), but
  scoping is not ownership
- `getApplicants` returns a raw Mongoose document. It no longer leaks a password
  hash (`select: false` on `passwordHash` plus the `PopulatedApplicant` type),
  but it is still not a DTO and still returns full applicant PII to any recruiter
- `$regex` search on raw user input
- Public, guessable resume URLs
- `GET /apply/:id` mutates state

Fixed in 1B: the `httpsOnly` typo, client-selected `role` (the collection is now
the role), unverified emails, no password policy, no login rate limit, and the
password-hash leak in `getApplicants`.

See `docs/superpowers/plans/2026-08-01-phase-1b-authentication.md`.
```

Then add to **Conventions**, because these are the three rules a new session is
most likely to break:

```markdown
- **Auth:** never read `passwordHash` without `{ withSecret: true }` on
  `findAccountByEmail`/`findAccountById`. The schema marks it `select: false`, so
  a plain read silently yields `undefined` and every password check fails open
  into the dummy-verify branch.
- **Portals:** `Portal` is `"seeker" | "recruiter"` and always arrives as a route
  literal, never from a request body, query or cookie. A function that takes a
  portal from user input is a bug regardless of what it does with it.
- **OTPs:** never log a code, and never resolve the account to mutate from a
  request body — it comes from the matched OTP row's `subjectId`.
```

- [ ] **Step 2: `SECURITY.md` — the defect table and the design section**

Three edits.

Move the six fixed rows out of "Not yet fixed" into a new "Fixed in Phase 1B"
list: the `httpsOnly` typo, the missing `secure` flag, body-supplied `role`,
unsanitized `findOne({ email })`, no login rate limit, no email verification, no
password policy. Add what 1B fixed that the table never listed — the logout that
did not clear cookies in production (mismatched attributes), and the
password-hash leak in `getApplicants`.

Rewrite the `getApplicants` row rather than deleting it, because the endpoint is
still wrong, just less wrong:

```markdown
| `getApplicants` returns an unprojected document | Full applicant PII to any recruiter. No longer leaks password hashes — `passwordHash` is `select: false` since 1B | 1C |
```

Then reconcile the design section with what was actually built. The two places
where implementation diverged from this document are worth stating as amendments
rather than silently overwriting, because both were driven by review findings:

- **Account linking.** This file says an unverified password account is "deleted
  and recreated from the Google identity". The implementation takes it over **in
  place**, keeping `_id`, clearing the password, and marking it verified. Same
  security property — the attacker's credential is destroyed — but deletion would
  orphan every `Application` and `Job` pointing at that `_id`. Note that the
  owner is emailed when this happens.
- **OTP storage.** Add that codes are hashed with `HMAC-SHA256(OTP_PEPPER,
  subjectId:code)` — bound to the subject, not the bare code — and that the
  failure budget is cumulative per account per purpose, not per code, so
  requesting a fresh code does not reset the attempt counter.

Add the rate-limit rows that now exist: OTP redemption 10/hour/IP, Google start
10/hour/IP. Mark the 1B rows Active.

- [ ] **Step 3: `ARCHITECTURE.md` — lifecycle, model, and auth chain**

The middleware diagram gains the auth mounts and the sweeper. The data model
section gains the six new collections:

```
seekers        auth fields + profile{headline,bio,skills,experienceYears,location}
               + resume{storageKey,originalName,mimeType,sizeBytes,uploadedAt}
recruiters     auth fields + designation, company → companies
refreshTokens  tokenHash (unique), familyId, subjectId, subjectType, expiresAt (TTL)
otpCodes       codeHash, purpose, subjectId, subjectType, expiresAt (TTL)
otpBudgets     subjectId, purpose, failures, expiresAt (TTL)
users          UNCHANGED and unread. Kept as the migration's rollback path;
               dropped in the 1C migration
```

State the `_id` preservation invariant explicitly, in the "Known problems"
section where someone reasoning about the model will find it:

```markdown
- **`seekers._id` and `recruiters._id` are the same ObjectIds as the `users`
  rows they came from.** The 1B migration copied `_id` verbatim, which is the only
  reason `applications.applicant`, `jobs.created_by` and `companies.userId`
  resolve after the split. Any future re-migration must preserve it too, and any
  script that mints fresh ids silently dangles the entire object graph.
```

Also correct the entry that says `phoneNumber` is a `Number` — that is now true
of `users` only; the account collections use a `String`.

Then the auth chain, which the file currently shows as the target
`authenticate(portal) → requireVerified → requireOwnership(resource)`. What
exists is:

```
Auth routes      authenticate(portal) → requireVerified → csrfProtection (mutations)
Domain routes    bridgeAuth(portal | "any")          ← 1B transitional
Target (1C)      authenticate(portal) → requireVerified → requireOwnership(resource)
```

with a short paragraph on why `bridgeAuth` exists and that it dies in Task 15 —
the note in the plan's Task 12 Step 2 is the source.

- [ ] **Step 4: `README.md` — and fix the three things it gets wrong**

Beyond the routine updates (status line, roadmap 1B → Complete, the new env
variables, the auth endpoint list), this file has three defects found while
writing Task 13:

1. **The `Layout` tree describes `apps/api/` and `apps/web/`.** The directories
   are `backend/` and `frontend/`. Someone following this README cannot find a
   single file.
2. **`## Scripts` appears twice** — once as the heading for the `VITE_API_URL`
   note, once for the actual table. Retitle the first `## Local configuration`.
3. **The deployment section says "If the two are on different domains, set
   `COOKIE_SAMESITE=none`."** Incomplete in a way that produces a broken deploy
   with no error: different *subdomains* of one registrable domain are same-site
   and need no change, while different registrable domains need `none` **and**
   HTTPS on both. Replace with the three-case breakdown from Task 13's
   `apiClient.ts` comment.

Add a short "Authentication" section listing the twelve endpoints per portal, and
state plainly that the same email may hold one seeker and one recruiter account
(ADR-0001) — it is the single most surprising behaviour for a new reader.

- [ ] **Step 5: `.env.example` — completeness check, not a rewrite**

Every variable added across Tasks 1, 9 and 12 must be present with an empty value
and a comment on how to obtain it. Diff it against the Zod schema rather than
against memory:

```bash
grep -oE "^  [A-Z_]+:" backend/src/config/env.ts | tr -d ' :' | sort > /tmp/schema.txt
grep -oE "^[A-Z_]+=" backend/.env.example | tr -d '=' | sort > /tmp/example.txt
diff /tmp/schema.txt /tmp/example.txt
```

A name in the schema but not the example is a variable someone will discover by
having the API refuse to boot. Note that on Windows the temp paths differ; the
comparison is what matters, not the shell.

- [ ] **Step 6: Amend the three ADRs**

Do not rewrite decision records. Append an amendment with a date, the way
ADR-0005 already does — the history of a reversed decision is the useful part.

- **ADR-0001**: change status to `Accepted (2026-07-31) — implemented in Phase
  1B`. Append a note that the migration preserved `_id`, and that the `ref`
  fields on `applications`, `jobs` and `companies` were repointed at the new
  collections rather than backfilled.
- **ADR-0002** (in-house auth): mark implemented, and record what shipped beyond
  the original scope — the transparent bcrypt→Argon2id upgrade, and the
  subject-bound peppered OTP hash.
- **ADR-0005**: mark implemented. Append an amendment recording that the CSRF
  token is **MAC-bound** (`nonce.HMAC(secret, nonce)`), not a bare random value
  as the "Decision" section describes. A bare double-submit token is forgeable by
  anyone who can set a cookie on the site — a subdomain, or a network attacker on
  plain HTTP — because the check only compares two attacker-supplied values. The
  MAC makes the server the only party that can mint a valid pair.

- [ ] **Step 7: Verify and commit**

There is nothing to typecheck, so the verification is a read-through: open each
file and confirm no sentence describes something that is no longer true. Then
grep for the words this task exists to remove:

```bash
grep -rn "not yet built\|httpsOnly\|apps/api\|apps/web" --include="*.md" .
```

Anything that survives that grep outside the plan files and the 1A plan is a
missed edit.

```bash
git add CLAUDE.md SECURITY.md ARCHITECTURE.md README.md backend/.env.example \
  docs/adr/0001-two-account-collections.md docs/adr/0002-in-house-auth.md \
  docs/adr/0005-cookie-sessions.md
git commit -m "docs: describe phase 1B as built"
```

---

### Task 15: Delete the legacy authentication

The last task, and the one that makes the phase real. Until this runs, the old
`token` cookie still signs requests, the old login endpoint still mints one, and
1B is an addition rather than a replacement.

**Do not run this task on the same day as Task 12's migration.** The
`LEGACY_AUTH_FALLBACK` flag exists so that a deploy can be rolled back without
locking out every signed-in user, and that value is zero if the fallback is
deleted before anyone has used the new login. The gate is behavioural, not
temporal: every active session should have signed in through the new endpoints at
least once. In a small deployment that is a week; the honest instruction is to
check rather than to wait a fixed time.

```javascript
// mongosh — accounts that have never held a new-style session
db.seekers.countDocuments({ _id: { $nin: db.refreshtokens.distinct("subjectId") } })
```

**Files:**
- Delete: `backend/src/middleware/isAuthenticated.ts`
- Modify: `backend/src/controllers/user.controller.ts`, `backend/src/routes/user.route.ts`, `backend/src/middleware/bridgeAuth.ts`, `backend/src/config/env.ts`, `backend/tests/setup.ts`, `backend/.env.example`, `backend/src/types/express.d.ts`
- Delete: `backend/src/models/user.model.ts`, `backend/src/scripts/migrate-phase1b.ts`, `backend/tests/auth/migration.test.ts` — **only if** Step 5's condition holds
- Modify: `frontend/src/components/auth/Login.tsx` and any remaining `LegacyUser` importer, `packages/shared/src/legacy-dto.ts`

- [ ] **Step 1: Delete the three legacy auth handlers**

From `user.controller.ts`, delete `register`, `login` and `logout` entirely, plus
the now-unused `bcrypt`, `jwt` and `env` imports. `updateProfile` and `getProfile`
stay — they were repointed in Task 12 and are the only reason this file survives.

`user.model.ts` is still imported by nothing else at this point; leave the import
removal to the compiler's error list rather than guessing.

From `user.route.ts`, the file becomes:

```ts
import express from "express";
import { getProfile, updateProfile } from "../controllers/user.controller.js";
import { bridgeAuth } from "../middleware/bridgeAuth.js";
import { singleUpload } from "../middleware/multer.js";

const router = express.Router();

router.route("/profile").get(bridgeAuth("any"), getProfile);
router.route("/profile/update").post(bridgeAuth("any"), singleUpload, updateProfile);

export default router;
```

The `/api/v1/user` mount in `app.ts` **stays** — it now serves only the profile
endpoints. Deleting the mount would 404 the profile page.

Then delete `isAuthenticated.ts`. Nothing imports it once the routes above are
rewritten; if the compiler disagrees, that import is the bug.

- [ ] **Step 2: Remove the fallback from the bridge**

In `bridgeAuth.ts`, delete the `options.legacyFallback` parameter, the
`readLegacyToken` helper, the `User` import and the entire fallback block. What
remains loops the allowed portals and 401s if none produce a session — which is
`authenticate(portal)` generalised over two portals, and the whole file is now
about fifty lines.

Delete `LEGACY_AUTH_FALLBACK` from `env.ts`, from `tests/setup.ts` and from
`.env.example` in the same commit. A flag left in the schema after its consumer is
gone is a switch that appears to do something and does nothing.

Then delete the three `bridge.test.ts` cases that exercise the fallback — the ones
named "accepts the inherited token when the fallback is on", "rejects the
inherited token when the fallback is off", and "prefers a new session over a
legacy cookie". They now test deleted code. **Keep** every case about portal
scoping and stale cookies; those describe the surviving behaviour.

- [ ] **Step 3: Tidy `req.id`**

`req.id` stays. Four domain controllers read it and repointing them is 1C's work,
not a teardown's. But its docblock in `types/express.d.ts` is now wrong — it says
"set by `isAuthenticated`", a file that no longer exists:

```ts
/**
 * Authenticated user's id, set by `bridgeAuth` from `req.auth.id`.
 *
 * Kept only because four 1C-bound domain controllers still read it. `req.auth`
 * is the real contract — it carries the portal, which `req.id` cannot express.
 * When 1C moves those controllers onto `req.auth`, this field goes with them.
 */
id?: string;
```

- [ ] **Step 4: Finish the frontend's legacy removal**

`LegacyUser` should now have exactly one consumer left: `legacy-dto.ts` itself.
Check and finish:

```bash
grep -rn "LegacyUser" frontend/src packages/shared/src
```

If Task 13 was done properly, `authSlice`, `Login.tsx` and
`UpdateProfileDialog.tsx` no longer import it, and `LegacyApplication.applicant`
is `PopulatedApplicant` (Task 12). If so, delete `LegacyUser` and
`LegacyUserProfile` from `legacy-dto.ts`. If not, the remaining consumer is a
missed Task 13 edit — fix it here rather than keeping a dead type alive to satisfy
it.

Also remove the legacy `/user/login`, `/user/register` and `/user/logout` calls if
any survive. Nothing in the app should reference them; a `grep` for `"/user/"`
should return only `/user/profile` and `/user/profile/update`.

- [ ] **Step 5: Decide on the `users` collection — deliberately, not by default**

The migration is idempotent and non-destructive, so `users`, `user.model.ts` and
`migrate-phase1b.ts` can all stay indefinitely at the cost of one unused model and
one unused script. Two options, and the choice is the deployment's, not the
plan's:

- **Keep** (recommended if this has been running for less than a month): the
  script remains re-runnable and `users` remains the rollback path. Add a one-line
  comment at the top of `user.model.ts` saying it is unread and why, so the next
  reader does not treat it as live.
- **Delete**: remove `user.model.ts`, `migrate-phase1b.ts` and
  `migration.test.ts`, and drop the collection. Only do this after confirming
  `db.users.countDocuments()` matches
  `db.seekers.countDocuments() + db.recruiters.countDocuments()` minus the rows
  the migration reported as `skippedBadRole` and `emailConflicts`. If those
  numbers do not reconcile, something never migrated and deleting the source
  destroys it.

Either way, the collection is dropped by 1C's own migration, which has a real
reason to touch it. Do not drop a collection to tidy up.

- [ ] **Step 6: Verify and commit**

```bash
npm run typecheck
npm test --workspace @jobportal/api
npm run build --workspace @jobportal/web
```

The full suite matters more here than in any other task: this is the only task
whose entire content is deletion, and the tests are what distinguish "removed the
legacy path" from "removed a path something still needed". A green suite after
deleting an auth system is the strongest signal in this plan.

Then walk three items from Task 13's checklist by hand, because no test covers
them:

1. A browser holding **only** an old `token` cookie is now signed out — not
   erroring, signed out. This is the point of the task
2. Sign in fresh through the new form → everything works
3. The profile page and the applicants table still load

```bash
git add backend/src/controllers/user.controller.ts backend/src/routes/user.route.ts \
  backend/src/middleware/bridgeAuth.ts backend/src/config/env.ts backend/tests/setup.ts \
  backend/.env.example backend/src/types/express.d.ts backend/tests/auth/bridge.test.ts \
  packages/shared/src/legacy-dto.ts
git rm backend/src/middleware/isAuthenticated.ts
git commit -m "feat(api)!: remove legacy cookie authentication

The inherited /api/v1/user auth endpoints, isAuthenticated, and the
LEGACY_AUTH_FALLBACK bridge path are gone. Sessions now come only from
the portal-scoped endpoints. Any browser holding the old token cookie is
signed out and must sign in again."
```

The `!` and the body are deliberate: this is the commit that invalidates every
remaining legacy session, and that belongs in the log where someone bisecting a
"why did everyone get logged out" report will find it.

---

