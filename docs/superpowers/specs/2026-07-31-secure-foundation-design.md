# Secure Foundation — Design Spec

**Date:** 2026-07-31
**Phase:** 1 of 4
**Status:** Approved for planning — **amended 2026-08-01** after an adversarial
review of the authentication design. See
[Amendment: authentication hardening](#amendment-2026-08-01--authentication-hardening).
Where the amendment and the original text disagree, the amendment wins; the
original wording is left in place so the reasoning stays legible.

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

`codeHash` (**HMAC-SHA-256, keyed by a server pepper and bound to `subjectId`** — see
amendment; the original `SHA-256` here is superseded), `purpose`
(`verify_email`|`reset_password`), `subjectId`, `subjectType`, `attempts` (max 5),
`expiresAt` (**TTL index**, 10 min), `consumedAt`.

The `email` column is **removed**: `subjectId` locates the account, and storing the
address alongside the code told a database reader exactly which account each
recovered code unlocked.

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
3. Hash password with **Argon2id** via `@node-rs/argon2` (memory 19 MiB, iterations 2,
   parallelism 1 — the OWASP Password Storage baseline of m=19456 KiB, t=2, p=1).
   `@node-rs/argon2` is chosen over `argon2` because it ships prebuilt N-API binaries
   for every target we deploy to — no `node-gyp`, no postinstall compile step — which
   removes the "Argon2id is a native module and can complicate some deploy targets"
   risk listed at the end of this spec. It is also roughly twice as fast per hash,
   which matters because every login pays the cost twice (once for the real verify,
   once for the dummy verify that hides account existence).
4. Create account with `emailVerifiedAt: null`.
5. Generate 6-digit OTP, store `HMAC-SHA256(code, OTP_PEPPER || subjectId)` with a
   10-minute TTL. Never a bare hash — see the data-model note on `otpCodes`.
6. Send via Brevo (`@getbrevo/brevo`).
7. Return `201`. **No session is issued.**

Avatar upload is removed from the registration path. The current flow uploads to Cloudinary *before* checking whether the email exists, letting an unauthenticated caller consume storage quota indefinitely. Avatars are set from the profile screen after verification.

### Email verification

`POST /auth/verify-email` with `{ code }` — **no `email` field.** The code identifies
its own subject; accepting an address alongside it was an account-takeover hole (see
amendment, finding 1).

Redemption is **one atomic `findOneAndUpdate`** that matches on
`{ codeHash, purpose: "verify_email", subjectType: portal, consumedAt: null, expiresAt: { $gt: now }, attempts: { $lt: 5 } }`
and `$inc`s `attempts` in the same operation. The account to mutate is then resolved
**exclusively from the returned document's `subjectId`**. On success: set
`emailVerifiedAt`, mark the OTP consumed with a second guarded update
(`{ consumedAt: null } → { consumedAt: now }`, so a concurrent second redeemer
loses), and issue a session.

### Password login

`POST /auth/login` with `{ email, password }`.

- If no account exists, still run an Argon2 verification against a dummy hash before returning. Without this, response timing reveals which emails are registered.
- If `emailVerifiedAt` is null, reject — but **only after the password has verified.**
  A wrong password against an unverified account returns the uniform
  `INVALID_CREDENTIALS`; only a *correct* password returns the distinct
  `EMAIL_NOT_VERIFIED` code that lets the client offer to resend. Returning the
  distinct code before checking the password turns login into a free existence
  oracle: one fixed dummy password replayed over a breach list maps every address
  on the platform to exists-verified / exists-unverified / absent.
- Reject if `lockedUntil` is in the future.
- On failure, increment `failedLoginCount`; lock with exponential backoff from the 5th failure.
- On success, reset counters and issue a session.

Failure messaging stays uniform ("Incorrect email or password") regardless of which check failed.

### Google OAuth

Authorization-code flow with PKCE **and** `nonce`. PKCE is not redundant for a
confidential client: the client secret stops an attacker redeeming a stolen code,
but only PKCE stops them *injecting* a code obtained in their own browser into our
legitimate token request. RFC 9700 §2.1.1 (the current BCP, January 2025)
recommends PKCE for confidential clients explicitly, and Google's discovery
document advertises `S256`. Google's web-application client type still requires
`client_secret`, so both travel together. `nonce` adds the replay protection PKCE
does not give.

**The portal does not travel in `state`.** It rides in a short-lived, `httpOnly`,
signed transaction cookie set when the flow starts, alongside the PKCE verifier and
the nonce. Putting `portal=recruiter` in a URL parameter — signed or not — lets a
user flip it, and a signed value is still *swappable* (an attacker replays their own
validly-signed state). Binding the transaction to a per-browser cookie defeats both,
and keeps application data out of URLs that Google logs. That cookie must be
`sameSite: "lax"`: the callback is a cross-site top-level GET, and a `strict`
cookie is not sent on it, so the default `COOKIE_SAMESITE=strict` would fail every
sign-in.

The ID token is verified against Google's JWKS with `audience` passed explicitly —
the library only checks `aud` when given one, and omitting it accepts any
Google-signed token from any application, a full authentication bypass. The library
does *not* check `nonce`, `email_verified`, `hd`, or `azp`; all four are the
caller's responsibility. We require `email_verified: true` and match `nonce` against
the transaction cookie. Accounts key on `sub`, never on email — email can change.

Resolution order on callback:

1. Match on `googleId` → sign in.
2. Else match on `email`:
   - Local account **has no password** → link `googleId`, sign in. Nothing can be
     taken over: there were no credentials.
   - Local account **has a password and is verified** → **do not sign in yet.**
     Send a confirmation link to the address with a 24-hour cancel window; the
     Google identity is linked only when the user confirms from their mailbox.
     Every link attempt is logged and notified.
   - Local account **has a password and is unverified** → **take the account over
     in place.** Keep `_id`; set `googleId`; null `passwordHash`; set
     `emailVerifiedAt: now`; revoke every refresh family and delete every
     outstanding OTP for that `_id`; notify the address.
3. Else create a new account with `emailVerifiedAt: now`.

Branch 2 closes an account-takeover path: an attacker registers `victim@gmail.com`
with a password of their choosing and never verifies. Linking unconditionally would
walk the victim into an account whose password the attacker knows.

**Takeover in place, not delete-and-recreate.** An earlier draft deleted the
unverified account and created a fresh one. That is worse on three counts. It
orphans every row referencing the old `_id` — team invites, draft job posts, audit
entries, anything provisioned before first sign-in — because the replacement has a
new id and inherits nothing. It destroys legitimate provisioned accounts: an admin
who creates `bob@acme.com` with a temporary password produces exactly branch 2's
preconditions, so Bob's first Google sign-in would sever his team association.
And it is not even necessary: nulling the password and revoking the sessions leaves
an attacker's plant worthless, which is the entire security goal. The takeover and
the cleanup run in one transaction.

**Step-up for verified password accounts** (the second sub-branch) exists because
Google's `email_verified` attests that Google trusts the *domain's current
operator*, not that this human ever owned the historical mailbox. If
`startup.example` lapses and an attacker re-registers it, they can stand up Workspace,
mint `alice@startup.example`, and Google will assert `email_verified: true` — an
auto-link would hand them Alice's verified recruiter account without the password and
without ever receiving mail at Alice's original mailbox. The same holds for a
malicious Workspace admin minting an identity for any employee address. Requiring
confirmation *from the mailbox* or from inside an already-authenticated session
restores the proof that Google's claim does not supply.

**Unverified accounts expire.** A sweeper hard-deletes unverified accounts and their
OTPs after 72 hours. Without it, an attacker registers a victim's address on a
mailbox with no Google identity at all — a corporate IMAP or Fastmail address — and
permanently blocks that person from registering, with no branch above able to cure it.

### Sessions

| | Access token | Refresh token |
|---|---|---|
| Format | JWT (HS256), **per-portal signing key** | opaque, 32 random bytes |
| Lifetime | 15 minutes | 7 days |
| Storage | httpOnly cookie | httpOnly cookie, `__Host-jp_{portal}_rt`, `Path=/` |
| Server state | none | HMAC hash row in `refreshTokens` |

Cookie attributes: `httpOnly` (note: the current code sets `httpsOnly`, which is not a real option and silently leaves the cookie readable by JavaScript), `secure` in production, `sameSite` from config — `strict` for same-origin deploys, `none` for split-domain deploys.

**Per-portal signing keys.** The access-token secret is derived per portal —
`HKDF(JWT_ACCESS_SECRET, "access:" + portal)` — so a seeker token does not merely
*fail a claim check* against a recruiter route, it fails **signature verification**.
Asserting `payload.type === portal` after verifying with a shared key is correct but
fragile: it puts the entire portal boundary on one comparison that a future refactor
can drop without any test necessarily noticing. Separate keys make cross-portal
replay a cryptographic impossibility rather than a policy the code must remember to
enforce. The `{ sub, type }` claim check stays as well; the two are independent.

**Cookie naming, not path scoping.** See the ADR-0005 amendment: the original
`path: "/api/v1/*/auth/refresh"` is unimplementable, because cookie `Path` is a
literal prefix and no browser treats `*` as a wildcard — the cookie would be stored
and then never sent, ending every session silently 15 minutes after login. Per-portal
`__Host-` names at `Path=/` replace it.

**The refresh handler reads the portal from the stored row, never the URL.** It
hashes the presented token, loads the row, and issues a session for that row's
`subjectType`. Deriving the portal from the mount path would let a seeker's refresh
cookie presented at the recruiter mount mint a recruiter session — privilege
escalation from a cookie the attacker legitimately holds. Per-portal cookie names
mean the wrong cookie should not arrive at all, but the handler must not rely on
that.

**Rotation and reuse detection.** Every refresh issues a new token and marks the old
one `replacedBy`. If an already-replaced token is presented, it has been stolen: the
entire `familyId` is revoked and all sessions in that family end. Rotation is a
single atomic `findOneAndUpdate` on `{ tokenHash, revokedAt: null, replacedBy: null }`
— a read-then-write loses the race between two concurrent refreshes and would mint
two live tokens from one row.

A **5-second grace window** softens the reuse trigger: if a replaced token is
presented within 5 seconds *and* its replacement is still live and unused, the
request is refused without revoking the family. Dropped responses and double-fired
requests are ordinary on mobile networks, and a design that logs users out of every
device on a retry will be worked around rather than kept. Beyond that window, or if
the replacement has itself been used, the family dies.

**Refresh token hashing uses HMAC, not bare SHA-256.** The token is 32 random bytes,
so a plain digest is not brute-forceable — but keying the hash with
`JWT_REFRESH_PEPPER` means a database dump alone yields nothing usable, matching how
OTPs are stored and removing the question of which hash is which.

**CSRF.** Because auth rides in cookies, state-changing routes carry a double-submit CSRF token: a non-`httpOnly` cookie the client echoes in an `X-CSRF-Token` header, compared server-side. The cookie value is `nonce.HMAC(secret, nonce)`; the server verifies the MAC before comparing, so an attacker who can *write* a cookie (a subdomain, an insecure sibling origin) cannot set both halves of a pair that validates. Plain double-submit trusts that only our origin can write the cookie, which is exactly what `__Host-` exists to stop assuming.

**Logout** revokes the refresh family and clears cookies using the same attributes they were set with — the current implementation omits them, so the cookie may survive in production.

### Password reset

`POST /auth/forgot-password` always returns 200 regardless of whether the email
exists. If it does, a `reset_password` OTP is sent.

**Constant work on both branches.** A uniform *body* is not a uniform *response*.
The exists branch writes an OTP document and calls Brevo — a network round trip of
roughly 50–300 ms — while the absent branch returns immediately, so the timing
alone rebuilds the existence oracle the uniform body was meant to close. The
handler therefore does the same work either way: generate and hash a code, write it
(to a discarded row for an absent account), and enqueue a send that goes nowhere.
The response is not awaited on the mail call in either branch, and a floor delay
smooths what remains.

`POST /auth/reset-password` takes `{ code, newPassword }` — **no `email` field**,
for the reason given under email verification: the account is resolved from the
OTP row's `subjectId`, never from a client-supplied address. Redemption is the same
atomic `findOneAndUpdate`, with `purpose: "reset_password"` in the match predicate
so a `verify_email` code cannot be spent here. On success every refresh-token
family for that account is revoked, and the new password is rejected if it Argon2-
verifies against the current hash.

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
- **Rate limits**: global 100 req/min/IP; login 5 per 15 min per IP+email; OTP *request* 3/hour per email; OTP *redemption* 10/hour per IP; registration 10/hour per IP.
- **Cumulative OTP failure budget — 20 failed redemptions per account per purpose per rolling 24 h**, counted on the *account*, not the code. Past that, OTP redemption for that purpose is refused entirely and the address is emailed. This is the one rate limit the design cannot omit, because the per-code cap of 5 is defeated by simply asking for another code: each new code arrives with `attempts: 0`, so nothing accumulates and the defence is time-linear forever. The arithmetic: 5 guesses per code × 3 codes/hour ≈ 15/hour, plus ~5 more by requesting codes just before the hour boundary and spending them after it — call it 20/hour, ~3 400/week, ≈ 0.34 % chance of hitting a given six-digit code in a week. Per account that is negligible; across a 10 000-address breach list it is roughly 25 successful takeovers per week, and because a redeemed `verify_email` code *issues a session* and a `reset_password` code *rotates the credential*, each hit is a full account takeover. Nothing in the per-code design ever trips an alarm, which is what makes it dangerous.
- **Account lockout is scoped so it cannot become the attack.** `lockedUntil` gates password login for that account only. It must never gate OTP redemption from a *different* subject, never lock by IP (a corporate NAT shares one), and never lock by email in a way an unauthenticated stranger can trigger for someone else — an attacker who can lock any account by submitting five wrong passwords has a denial-of-service primitive against every user on the platform. Exponential backoff caps at 15 minutes rather than escalating without bound, and a successful password verification clears the counter immediately. The lock returns the same uniform `INVALID_CREDENTIALS` as a wrong password, so it is not an existence oracle either.
- **`helmet`** for security headers, **`hpp`** for parameter pollution.
- **NoSQL injection**: `mongoose.set('sanitizeFilter', true)` plus Zod coercing every identifier to a string. `User.findOne({ email })` currently accepts `{"email": {"$ne": null}}` straight from the JSON body.
- **Search** moves from `$regex` on raw user input to the `jobs` text index. The current query is unindexable and lets a crafted keyword cause catastrophic backtracking.
- **Body limits** drop from 16 MB to 1 MB for JSON; multipart is bounded separately by multer.
- **CORS** origin allowlist from config, with credentials. The stray `sameSite` key in the current `corsOptions` does nothing and is dropped.
- **Env validation**: a Zod schema parses `process.env` at boot and exits with a clear message on anything missing, replacing silent `undefined` secrets.
- **`forgot-password` is uniform in time, not only in body.** Returning 200 either way
  is undone if the exists-branch writes an OTP row and awaits a Brevo call (~50–300 ms)
  while the absent-branch returns immediately — the timing delta rebuilds the oracle
  the uniform body was meant to close. The handler therefore enqueues the send rather
  than awaiting it and returns after a fixed floor, so both branches cost the same
  observable time. Registration gets a proof-of-work or CAPTCHA gate after N attempts
  per IP per day, since "email taken" is an unavoidable disclosure and bulk
  measurement over `/register` otherwise enumerates both collections.

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
2. **OTP binding.** A code issued to account A, redeemed against account B, must fail
   — same portal *and* cross-portal. A `verify_email` code presented to
   `reset-password` must fail. These are the two critical findings in the amendment;
   without these tests the fixes can silently regress.
3. **OTP attempt atomicity.** Fire 50 parallel redemptions with wrong codes against
   one live OTP and assert exactly 5 were honoured. A read-then-write implementation
   passes a sequential test and fails this one, which is the whole point.
4. **Cumulative OTP budget.** Exhaust a code, request a new one, repeat — assert the
   account's rolling failure counter survives across codes and eventually locks
   redemption. A per-code-only implementation passes every other OTP test.
5. Auth flows: register → OTP → login; lockout; enumeration timing; each Google
   linking branch — especially takeover-in-place preserving `_id`, and step-up being
   required for a verified password account.
6. **Cross-portal token rejection.** A seeker access token must fail *signature*
   verification on a recruiter route, not merely a claim check. A seeker refresh
   cookie presented at the recruiter mount must mint a seeker session or nothing —
   never a recruiter one.
7. Refresh rotation and reuse detection revoking a family, including two concurrent
   refreshes minting exactly one live token, and the 5-second grace window not
   revoking.
8. Validation rejection, including NoSQL operator payloads.
9. Upload rejection: oversized, wrong MIME, MIME/magic-byte mismatch.

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

- **ADR-001 — Two account collections.** Seekers and recruiters are separate collections with portal-scoped routes. Mirrors Naukri and Internshala, where one person may legitimately be both. Email is unique per collection, not globally. Consequence: Google OAuth needs portal context, carried in a signed httpOnly transaction cookie — *not* in `state`, which the user can edit.
- **ADR-002 — In-house auth over a managed provider.** Retains control and demonstrates the security work directly; costs more code to maintain. Revisit if MFA and SSO become requirements.
- **ADR-003 — Applications are not embedded in jobs.** An unbounded array rewrites the parent document on every insert and eventually exceeds the 16 MB document limit, at which point a popular job silently stops accepting applications. Queried via an index instead.
- **ADR-004 — No Redis in Phase 1.** Mongo TTL indexes cover token and OTP expiry; in-memory rate limiting is adequate for a single instance. Rate limiting and caching sit behind a store interface with an in-memory implementation, so adoption is a config change. **Adopt Redis when any of these becomes true:** more than one API instance is running; deployment moves to serverless; or transactional email moves to a background queue.
- **ADR-005 — Cookie-based sessions with CSRF tokens.** Chosen over `localStorage` bearer tokens because `httpOnly` cookies are not readable by injected scripts. Accepts the cost of CSRF defense. **Amended 2026-08-01:** per-portal `__Host-` cookie names at `Path=/` replace the original path-scoped refresh cookie, which used a `*` wildcard no browser honours.

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
- **Argon2id is a native module.** Mitigated by choosing `@node-rs/argon2`, which
  ships prebuilt N-API binaries for every target we deploy to and needs neither
  `node-gyp` nor a postinstall compile — the usual source of native-module deploy
  failures. It is also roughly twice as fast as the C++ `argon2` binding, which
  matters because hashing sits in the login path. A bcrypt cost-12 fallback stays
  documented but is not expected to be needed.
- **TS migration and security fixes in one phase** means large diffs. Mitigated by ordering: restructure → migrate types mechanically → then change behavior, each as separate reviewable commits.

---

## Amendment 2026-08-01 — findings from the pre-implementation attack review

Phase 1A shipped, and before writing the 1B plan the authentication design was
reviewed adversarially along three lenses: identity and account takeover, session
and token handling, and abuse/denial-of-service. The review found flaws in the
design *as approved above*, several of them exploitable pre-authentication. The
body of this spec has been edited in place to reflect the corrections; this section
records what was wrong and why, so the reasoning is not lost and the same mistakes
are not reintroduced.

Package and protocol choices were verified empirically rather than assumed:
`@node-rs/argon2@2.0.2` (prebuilt, `engines >= 10`) and `@getbrevo/brevo@6.0.2`
(`engines >= 18`) both run on Node 20; `google-auth-library` must be pinned to
`^10.9.1` because `11.0.0` declares `engines.node >= 22`, which this project's
Node 20 floor excludes.

### Critical — OTP redemption did not bind the code to an account

The approved design had `verify-email` and `reset-password` accept
`{ email, code }` and described validating the code against the stored hash. It
never said which account gets mutated. Read literally, the code is validated
against *any* matching OTP row while the account is resolved from `body.email` —
two independent lookups. So: register your own address, receive your own code,
then submit that code with the victim's email in the body. The code validates
(it is genuinely yours), and the password is written to the victim's account.
Pre-auth takeover of any account, needing nothing but a mailbox.

Fixed by removing `email` from both request bodies and resolving the account
**exclusively from the redeemed OTP document's `subjectId`**, inside a single
atomic `findOneAndUpdate` whose filter includes `purpose` and `subjectType`.
`purpose` in the filter matters independently: it was stored but never used as a
redemption constraint, so a low-sensitivity `verify_email` code would satisfy the
credential-rotating `reset_password` endpoint.

### Critical — Google branch 2b deleted and recreated the account

For an unverified account that has a password, the design deleted it and built a
fresh one from the Google identity. The security instinct was right — never let an
attacker's planted unverified account become the victim's — but deletion is the
wrong instrument. It orphans every row referencing the old `_id`, and it destroys
legitimate provisioned accounts, since "unverified with a temporary password" is
exactly what an admin-created or invited account looks like.

Replaced with takeover in place: keep `_id`, null the password, set `googleId`,
verify the email, revoke all sessions, notify the address, all in one transaction.
An attacker's plant is left worthless, which was the actual goal.

### High — three more, each fixed in the body above

**Auto-linking on `email_verified` alone.** Google's `email_verified` attests that
Google trusts the domain's *current* operator. A lapsed-and-re-registered domain,
or a malicious Workspace admin, can mint an identity for any address on it and
silently inherit a verified password account. Verified password-bearing accounts
now require step-up confirmation before a link activates.

**OTP brute force was free per fleet.** Five attempts per code, but the budget
lives on the code — requesting a new one resets it. About 15–20 guesses/hour/account
indefinitely, ≈0.25% per account-week, which against a 10,000-address breach list
is roughly 25 takeovers a week with nothing per-account ever tripping. Fixed with a
cumulative per-account per-purpose failure budget that survives new codes, plus IP
and global limits on the redemption endpoints.

**Unsalted SHA-256 over a six-digit space.** The full rainbow table is 32 MB. Any
read of `otpCodes` — a dump, a staging copy, a log line — converts directly into
sessions, and the plaintext `email` column on the same document named the target.
Now `HMAC-SHA256(code, pepper ‖ subjectId)`, per-subject, with the email column
dropped.

Also fixed: the attempt counter was read-then-write, so 40 parallel requests each
read `attempts < 5` and all proceeded — 40 guesses for the price of five. Both the
counter and the single-use `consumedAt` marking are now atomic.

### Medium — session and OAuth token handling

**The refresh handler derived the portal from the URL mount.** A seeker's refresh
cookie presented at the recruiter mount would have minted a recruiter session.
The portal now comes from the stored row's `subjectType`. Access tokens are signed
with per-portal derived keys, so cross-portal replay fails signature verification
rather than a single equality check a refactor could drop.

**The refresh cookie path was unimplementable.** `path: "/api/v1/*/auth/refresh"`
— cookie `Path` is a literal prefix match, `*` is not a wildcard. The cookie would
be stored and never sent, ending every session 15 minutes after login with no
error to explain it. See the ADR-0005 amendment.

**OAuth `state` carried the portal with no integrity or browser binding.** A user
could flip `seeker` to `recruiter` mid-flow, and an unbound `state` permits login
CSRF — the victim's browser lands in the attacker's account and uploads a resume
into it. The portal now travels in a signed `httpOnly` transaction cookie, never
in the URL, and the callback is portal-pinned server-side.

**Login leaked existence for free.** `EMAIL_NOT_VERIFIED` was returned before the
password was checked, so one dummy password mapped every address on the platform.
The distinct code now requires a correct password first. Relatedly,
`forgot-password` returned a uniform 200 but not uniform *timing*; it now performs
the same work on both branches.

### Design decisions that survived the review

Worth recording, because they constrain later phases: Argon2id with a dummy verify
on the absent-account branch; two collections with the mount path as the only role
selector; `authorization_code` + PKCE + `nonce` with ID tokens verified against
JWKS and an explicit `audience`; refresh rotation with family-wide revocation on
reuse; `httpOnly` cookies over `localStorage`; and revoking every session on
password reset.

One addition on the DoS axis: **account lockout must never be reachable by an
unauthenticated stranger on someone else's behalf.** A lock any attacker can
trigger with five wrong passwords is a denial-of-service primitive against every
user. Lockout stays scoped to password login for that account, capped at 15
minutes, cleared on success, and is never keyed by IP — a corporate NAT shares one.
