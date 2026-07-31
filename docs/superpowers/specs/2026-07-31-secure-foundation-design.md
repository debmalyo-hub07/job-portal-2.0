# Secure Foundation — Design Spec

**Date:** 2026-07-31
**Phase:** 1 of 4
**Status:** Approved for planning

## Context

This repository began as a build-along of [Surendrakumarpatel/jobportal-yt](https://github.com/Surendrakumarpatel/jobportal-yt) and carries that tutorial's structure and its defects. The goal is a job portal that can hold real users' data safely and stand next to Naukri or Internshala without apology.

An audit of the current code found broken access control on every route, a JWT cookie readable by JavaScript, credentials in public git history, and roughly twenty `catch` blocks that log and never respond. Those are addressed here.

### Scope decomposition

The full request spans four projects. This spec covers Phase 1 only.

| Phase | Content | Status |
|---|---|---|
| 0 | Containment: rotate leaked credentials, purge git history | Blocking prerequisite — see below |
| **1** | **Secure foundation: TS migration, auth, authorization, validation, docs** | **This spec** |
| 2 | Design system + full UI rebuild, seeker *and* recruiter portals | Later spec |
| 3 | Seeker features: saved jobs, search/filters, application timeline | Later spec |
| 4 | Recruiter dashboard: pipeline, bulk actions, analytics | Later spec |

### Phase 0 — containment (blocking)

`Backend/.env` was committed in `2b85f5b` and removed in `7b2a211`. Removal from a later commit does not remove it from history; the values remain readable in the public repository. Phase 1 must not begin until these are done, because Phase 1 writes new secrets into the same repository.

1. **Rotate all three.** MongoDB Atlas database-user password; a freshly generated `SECRET_KEY` (which invalidates every existing session — expected and desirable, since the old signing key is public and can forge a token for any user ID); Cloudinary API secret via console regeneration.
2. **Purge history** with `git filter-repo`, removing `Backend/.env` and all 3,262 tracked `node_modules` paths, then force-push. Collaborators must re-clone.
3. **Verify** with `git log --all --full-history -- Backend/.env` returning nothing, and `git ls-files | grep node_modules` returning nothing.
4. Restrict the Atlas IP allowlist to known deploy addresses rather than `0.0.0.0/0`.

Step 1 is what actually stops exposure; steps 2–4 are cleanup. Assume the old values are compromised permanently — rotation is not optional even after the purge, because the repository has already been cloneable for the life of those commits. The runbook is preserved in `SECURITY.md`.

### Goals

- No unauthorized actor can read or mutate a resource they do not own.
- Authentication is resistant to enumeration, brute force, token theft, and account-linking takeover.
- Every input is validated; every failure returns a response.
- Client and server cannot silently disagree about an API shape.
- A new contributor can run the project from the README without asking questions.

### Non-goals

Deliberately excluded, to keep this phase reviewable:

- Platform-admin / moderation role and audit logs. The word "admin" is retired from route names to keep this space open.
- Redis. See ADR-004.
- Visual redesign. Phase 1 keeps existing UI, changing it only where an API contract forces it.
- Saved jobs, filters, analytics, notification emails beyond auth transactional mail.
- Payments, subscriptions, resume parsing, recommendations.

## Architecture

### Repository layout

npm workspaces monorepo. Shared types are the primary justification for the TypeScript migration and require a shared package.

```
apps/
  api/                 (was Backend/)
    src/
      config/          env parsing + validation, cloudinary, brevo, db
      modules/
        auth/          controller, service, routes, guards
        seeker/
        recruiter/
        company/
        job/
        application/
      middleware/       authenticate, authorize, rateLimit, error, csrf, upload
      lib/              tokens, otp, mailer, storage, store (rate-limit backend)
      types/            express request augmentation
      app.ts            express wiring, no listen
      server.ts         listen + graceful shutdown
    tests/
  web/                 (was Frontend/)
packages/
  shared/              Zod schemas + inferred types + shared enums
```

`app.ts` exports the configured Express app without calling `listen`, so Supertest can mount it directly.

### Module boundaries

Each feature module owns `routes → controller → service → model`. Controllers handle HTTP only: parse, call service, shape response. Services hold business rules and are the only layer that touches models. Cross-module reads go through the owning module's service, never another module's model directly.

## Data model

MongoDB via Mongoose 8. Two account collections, per the two-portal decision (ADR-001).

### `seekers`

| Field | Type | Notes |
|---|---|---|
| `email` | string | unique **within this collection**, lowercased, trimmed |
| `emailVerifiedAt` | Date \| null | null until OTP confirmed |
| `passwordHash` | string \| null | null for Google-only accounts |
| `googleId` | string \| null | sparse unique index |
| `fullName` | string | 2–80 chars |
| `phone` | string \| null | E.164, validated; **string, not Number** |
| `profile.headline` | string \| null | |
| `profile.bio` | string \| null | max 2000 |
| `profile.skills` | string[] | max 50 entries |
| `profile.experienceYears` | number \| null | 0–60 |
| `profile.location` | string \| null | |
| `resume` | `{ storageKey, originalName, mimeType, sizeBytes, uploadedAt }` \| null | private asset |
| `avatarUrl` | string \| null | public asset |
| `status` | `active` \| `suspended` | |
| `failedLoginCount` | number | default 0 |
| `lockedUntil` | Date \| null | |

### `recruiters`

Same auth fields (`email`, `emailVerifiedAt`, `passwordHash`, `googleId`, `status`, lockout fields), plus `fullName`, `phone`, `designation`, and `company: ObjectId | null` (ref `companies`, null until they create one).

The shared auth fields live in a reusable Mongoose schema fragment so the auth service can operate on either collection through a common interface, without merging the collections.

### `companies`

`name` (unique), `slug` (unique), `description`, `website`, `location`, `logoUrl`, `ownerId` (ref `recruiters`, indexed), `isVerified` (bool, default false), timestamps.

### `jobs`

`title`, `slug`, `description`, `responsibilities[]`, `requirements[]`, `skills[]`, `salaryMin`, `salaryMax`, `currency` (default INR), `salaryPeriod` (`yearly`|`monthly`), `location`, `workMode` (`onsite`|`hybrid`|`remote`), `jobType` (`full-time`|`part-time`|`internship`|`contract`), `experienceMin`, `experienceMax`, `openings`, `company` (ref, indexed), `postedBy` (ref `recruiters`, indexed), `status` (`draft`|`published`|`closed`), `applicationDeadline`, `viewCount`, `applicationCount`, timestamps.

**`applications[]` is removed from this schema.** Rationale in ADR-003.

Indexes:
- text index on `title`, `description`, `skills`
- `{ status: 1, createdAt: -1 }` — the default feed query
- `{ location: 1, status: 1 }`, `{ company: 1 }`, `{ postedBy: 1 }`

`salaryMin`/`salaryMax` replace the single `salary: Number`, and `experienceMin`/`experienceMax` replace `experienceLevel: Number` — which the frontend was populating from a field named `experience`, so the value never arrived.

### `applications`

`job` (ref), `seeker` (ref), `company` (ref, denormalized so recruiters can query across their jobs without a join), `status` (`applied`|`reviewed`|`shortlisted`|`interview`|`offered`|`rejected`|`withdrawn`), `resumeSnapshot` (`{ storageKey, originalName }`), `coverLetter` (string \| null, max 5000), `statusHistory[]` (`{ status, changedBy, changedAt, note }`), timestamps.

Indexes:
- **unique compound `{ job: 1, seeker: 1 }`** — enforces apply-once in the database. The current `findOne`-then-`create` check loses a race between concurrent requests.
- `{ seeker: 1, createdAt: -1 }`, `{ company: 1, status: 1 }`

`resumeSnapshot` is captured at apply time so a later resume replacement does not retroactively alter what a recruiter received.

### `refreshTokens`

`tokenHash` (SHA-256, unique), `subjectId`, `subjectType` (`seeker`|`recruiter`), `familyId`, `userAgent`, `ip`, `expiresAt` (**TTL index**), `revokedAt`, `replacedBy`.

### `otpCodes`

`codeHash` (SHA-256), `purpose` (`verify_email`|`reset_password`), `subjectId`, `subjectType`, `email`, `attempts` (max 5), `expiresAt` (**TTL index**, 10 min), `consumedAt`.

## Authentication

One implementation parameterized by portal, mounted twice:

```
/api/v1/seeker/auth/*
/api/v1/recruiter/auth/*
```

The portal determines which collection is read and written. No request body field selects a role — the current design lets the client pick its own role string at login, which is why role is being removed from the request payload entirely.

### Password registration

1. Zod-validate body.
2. Look up email in the portal's collection; reject if taken.
3. Hash password with **Argon2id** (memory 19 MiB, iterations 2, parallelism 1 — OWASP baseline).
4. Create account with `emailVerifiedAt: null`.
5. Generate 6-digit OTP, store SHA-256 hash with 10-minute TTL.
6. Send via Brevo.
7. Return `201`. **No session is issued.**

Avatar upload is removed from the registration path. The current flow uploads to Cloudinary *before* checking whether the email exists, letting an unauthenticated caller consume storage quota indefinitely. Avatars are set from the profile screen after verification.

### Email verification

`POST /auth/verify-email` with `{ email, code }`. Compares against the stored hash, increments `attempts`, rejects after 5. On success: set `emailVerifiedAt`, mark the OTP consumed, issue a session.

### Password login

`POST /auth/login` with `{ email, password }`.

- If no account exists, still run an Argon2 verification against a dummy hash before returning. Without this, response timing reveals which emails are registered.
- Reject if `emailVerifiedAt` is null, with a distinct code so the client can offer to resend.
- Reject if `lockedUntil` is in the future.
- On failure, increment `failedLoginCount`; lock with exponential backoff from the 5th failure.
- On success, reset counters and issue a session.

Failure messaging stays uniform ("Incorrect email or password") regardless of which check failed.

### Google OAuth

Authorization-code flow with PKCE. The portal is encoded in the `state` parameter alongside CSRF nonce, so the callback knows which collection it is operating on. The ID token is verified against Google's JWKS; we require `email_verified: true`.

Resolution order on callback:

1. Match on `googleId` → sign in.
2. Else match on `email`:
   - Local account **is email-verified**, or **has no password** → link `googleId`, sign in.
   - Local account is **unverified and has a password** → **do not link.** Delete the unverified account and create a fresh one from the Google identity.
3. Else create a new account with `emailVerifiedAt: now`.

The 2b distinction closes an account-takeover path: an attacker registers `victim@gmail.com` with a password of their choosing and never verifies. If the victim later signs in with real Google and we linked unconditionally, the victim would enter an account whose password the attacker knows.

Deletion rather than credential-clearing is deliberate. An unverified account may still hold profile data the attacker seeded, and handing the victim a pre-populated account invites subtler mischief. Nothing of value is lost: an unverified account has never been able to sign in, so a legitimate user in this state has no history worth preserving.

### Sessions

| | Access token | Refresh token |
|---|---|---|
| Format | JWT (HS256) | opaque, 32 random bytes |
| Lifetime | 15 minutes | 7 days |
| Storage | httpOnly cookie | httpOnly cookie, path-scoped to `/auth/refresh` |
| Server state | none | SHA-256 hash row in `refreshTokens` |

Cookie attributes: `httpOnly` (note: the current code sets `httpsOnly`, which is not a real option and silently leaves the cookie readable by JavaScript), `secure` in production, `sameSite` from config — `strict` for same-origin deploys, `none` for split-domain deploys.

**Rotation and reuse detection.** Every refresh issues a new token and marks the old one `replacedBy`. If an already-replaced token is presented, it has been stolen: the entire `familyId` is revoked and all sessions in that family end.

**CSRF.** Because auth rides in cookies, state-changing routes carry a double-submit CSRF token: a non-`httpOnly` cookie the client echoes in an `X-CSRF-Token` header, compared server-side.

**Logout** revokes the refresh family and clears cookies using the same attributes they were set with — the current implementation omits them, so the cookie may survive in production.

### Password reset

`POST /auth/forgot-password` always returns 200 regardless of whether the email exists. If it does, a `reset_password` OTP is sent. `POST /auth/reset-password` takes `{ email, code, newPassword }`, and on success revokes every refresh-token family for that account.

## Authorization

The gap this phase exists to close. Today every route ends at `isAuthenticated`, so any logged-in user can post jobs, edit any company, read any applicant list, and change any application's status.

```
authenticate(portal) → requireVerified → requireOwnership(resource)
```

There is deliberately no `requireRole` step. With two account collections, the collection *is* the role — a token issued from the seeker portal cannot address a recruiter route, so a separate role check would be redundant state that could drift out of sync with the collection it describes. This is a direct benefit of ADR-001.

- **`authenticate(portal)`** verifies the access token and loads the subject from the matching collection. The JWT payload carries `{ sub, type }`, and the middleware asserts `type === portal` before touching the database — so a seeker token replayed against a recruiter route is rejected on signature-verified data, not on a lookup.
- **`requireVerified`** rejects unverified accounts from anything beyond profile read and resend-OTP.
- **`requireOwnership`** is new. Resolvers per resource:

| Resource | Ownership rule |
|---|---|
| `PATCH /company/:id` | `company.ownerId === subject.id` |
| `POST/PATCH /job`, `DELETE /job/:id` | `job.postedBy === subject.id` |
| `GET /job/:id/applicants` | `job.postedBy === subject.id` |
| `PATCH /application/:id/status` | application's `company` is owned by subject |
| `GET /application/mine` | filtered by `seeker === subject.id`; never accepts an ID from the client |

### Response shaping

Every handler returns an explicit DTO built by a mapper function; models are never serialized directly. `getApplicants` currently populates `applicant` with no projection and ships bcrypt hashes and full contact details to any caller. Its DTO exposes name, headline, skills, experience, application status, and a signed resume link — nothing else.

### Test matrix

For each protected resource, assert the status code returned to: an anonymous caller, a seeker, an unrelated recruiter, and the owning recruiter. This matrix is the primary artifact a reviewer should check.

## Validation and hardening

- **Zod** schemas in `packages/shared` for every route's params, query, and body. A `validate(schema)` middleware runs before controllers. The client imports the same schemas.
- **Rate limits**: global 100 req/min/IP; login 5 per 15 min per IP+email; OTP request 3/hour per email; registration 10/hour per IP.
- **`helmet`** for security headers, **`hpp`** for parameter pollution.
- **NoSQL injection**: `mongoose.set('sanitizeFilter', true)` plus Zod coercing every identifier to a string. `User.findOne({ email })` currently accepts `{"email": {"$ne": null}}` straight from the JSON body.
- **Search** moves from `$regex` on raw user input to the `jobs` text index. The current query is unindexable and lets a crafted keyword cause catastrophic backtracking.
- **Body limits** drop from 16 MB to 1 MB for JSON; multipart is bounded separately by multer.
- **CORS** origin allowlist from config, with credentials. The stray `sameSite` key in the current `corsOptions` does nothing and is dropped.
- **Env validation**: a Zod schema parses `process.env` at boot and exits with a clear message on anything missing, replacing silent `undefined` secrets.

## File uploads

Multer memory storage with per-route limits: **2 MB** avatars, **5 MB** resumes. A `fileFilter` checks declared MIME, and the handler additionally verifies **magic bytes** — a declared `application/pdf` that does not begin with `%PDF` is rejected. Validation and duplicate checks happen before any upload call.

| Asset | Cloudinary settings | Access |
|---|---|---|
| Avatar, company logo | `resource_type: 'image'`, public | Direct URL |
| Resume | `resource_type: 'raw'`, `type: 'authenticated'` | Time-limited signed URL, 5 min |

Resumes are currently uploaded as public images on guessable URLs. They contain phone numbers, addresses, and employment history, and are enumerable by anyone. `GET /application/:id/resume` authorizes the caller, then mints a short-lived signed URL.

## Error handling and observability

An `AppError` class carries `statusCode`, a machine-readable `code`, and optional `details`. An `asyncHandler` wrapper forwards rejected promises to the error middleware, replacing the ~20 `catch (e) { console.log(e) }` blocks that currently send no response and leave the client hanging until timeout.

Response envelope:

```jsonc
{ "success": false, "code": "COMPANY_NOT_OWNED", "message": "…", "details": [] }
```

Unhandled errors log with a request ID via `pino` and return a generic 500; stack traces never reach the client in production. Also fixed: the `succees` typo in the `getApplicants` response, and the missing pagination on every list endpoint (`page`/`limit`, capped at 50, returning `{ items, total, page, pages }`).

Health endpoint `GET /health` reports process and database status. `server.ts` handles `SIGTERM` with a graceful shutdown.

## Testing

Vitest + Supertest + `mongodb-memory-server`, no shared state between tests.

Coverage priority:

1. Authorization matrix (above) — highest value, catches the whole current bug class.
2. Auth flows: register → OTP → login; lockout; enumeration timing; each Google linking branch, especially the unverified-password case.
3. Refresh rotation and reuse detection revoking a family.
4. Validation rejection, including NoSQL operator payloads.
5. Upload rejection: oversized, wrong MIME, MIME/magic-byte mismatch.

CI via GitHub Actions on push and PR: typecheck → lint → test → build. `npm audit --audit-level=high` runs as a non-blocking report.

## Documentation

| File | Purpose |
|---|---|
| `CLAUDE.md` | Commands, conventions, module boundaries, guardrails, where things live |
| `README.md` | What it is, features, screenshots, setup, env vars, deployment |
| `ARCHITECTURE.md` | Module map, request lifecycle, data model diagram, scaling triggers |
| `SECURITY.md` | Threat model, auth design, reporting policy, credential-rotation runbook |
| `API.md` | Endpoint reference generated from the Zod schemas |
| `CONTRIBUTING.md` | Branch naming, commit convention, PR checklist, local setup |
| `.env.example` | Every variable, documented, no values |
| `docs/adr/` | Decision records below |

## Decision records

- **ADR-001 — Two account collections.** Seekers and recruiters are separate collections with portal-scoped routes. Mirrors Naukri and Internshala, where one person may legitimately be both. Email is unique per collection, not globally. Consequence: Google OAuth needs portal context, supplied via `state`.
- **ADR-002 — In-house auth over a managed provider.** Retains control and demonstrates the security work directly; costs more code to maintain. Revisit if MFA and SSO become requirements.
- **ADR-003 — Applications are not embedded in jobs.** An unbounded array rewrites the parent document on every insert and eventually exceeds the 16 MB document limit, at which point a popular job silently stops accepting applications. Queried via an index instead.
- **ADR-004 — No Redis in Phase 1.** Mongo TTL indexes cover token and OTP expiry; in-memory rate limiting is adequate for a single instance. Rate limiting and caching sit behind a store interface with an in-memory implementation, so adoption is a config change. **Adopt Redis when any of these becomes true:** more than one API instance is running; deployment moves to serverless; or transactional email moves to a background queue.
- **ADR-005 — Cookie-based sessions with CSRF tokens.** Chosen over `localStorage` bearer tokens because `httpOnly` cookies are not readable by injected scripts. Accepts the cost of CSRF defense.

## Migration

Existing documents predate these schemas. A one-off script in `backend/scripts/migrate-phase1.ts`:

1. Split `users` into `seekers` and `recruiters` by the existing `role` field.
2. Convert `phoneNumber` from Number to string.
3. Map `salary` → `salaryMin`/`salaryMax`, `experienceLevel` → `experienceMin`/`experienceMax`.
4. Materialize `jobs.applications[]` into `applications` documents, then drop the array.
5. Set `emailVerifiedAt` to `createdAt` for existing accounts — they cannot retroactively prove their email, and locking out current users is worse than grandfathering them.
6. Leave `password` hashes as bcrypt; the login path detects the prefix and transparently rehashes to Argon2id on next successful login.

The script is idempotent and runs against a restored dump before production.

## Risks

- **Monorepo restructure touches every import path.** Mitigated by doing it as one mechanical commit with no behavior change, before any logic work.
- **Brevo is a new external dependency in the signup path.** Failures are caught and surfaced as a retryable state; the account persists unverified, and the user can request a new code.
- **Argon2id is a native module** and can complicate some deploy targets. Fallback to bcrypt cost 12 is acceptable and documented.
- **TS migration and security fixes in one phase** means large diffs. Mitigated by ordering: restructure → migrate types mechanically → then change behavior, each as separate reviewable commits.
