# Architecture

## Request lifecycle

Middleware order in `backend/src/app.ts`. Order is load-bearing — the comments
in that file explain why each position matters.

```
requestId            correlation id, first so every later log line carries it
pino-http            structured request logging, cookies redacted
applySecurity        helmet, CORS allowlist, 1mb body limits, hpp
cookieParser
rateLimit            100/min per IP globally; tighter per-route limits below
── routes ──         /health
                     /api/v1/seeker/auth/*     portal-scoped auth
                     /api/v1/recruiter/auth/*  same routers, second mount
                     /api/v1/{user,company,job,application}
notFound             terminal 404 envelope
errorHandler         must be last, or thrown errors reach Express's HTML page
```

The two auth mounts are the *same* router factory called twice with a different
`Portal` literal. That is what makes portal isolation structural rather than
conditional: no handler branches on a portal it received from the caller, so
there is no branch to get wrong.

`buildApp()` returns the wired app without calling `listen`, so Supertest mounts
it directly and no test needs a real port. `server.ts` owns the listener,
connects to MongoDB *before* accepting traffic, and handles `SIGTERM`/`SIGINT`
with a 10-second forced-exit fallback. It also starts the **unverified-account
sweeper**, which deletes accounts that never verified their address after the
retention window — a periodic timer, not a request path, so it lives with the
listener rather than the app.

## Module boundaries

```
routes → controller → service → model
```

Controllers handle HTTP only: read the request, call a service, shape a response.
Services hold business rules and are the only layer that touches models.
Cross-module reads go through the owning module's service, never another
module's model directly.

Phase 1A retained the tutorial's controller-calls-model shape, because
introducing a service layer at the same time as the TypeScript migration would
have made the diff unreviewable. Phase 1B introduced services for auth
(`auth.service.ts`, `googleAuth.service.ts`, `account.service.ts`,
`session.service.ts`), so the pattern now holds on every auth path. The domain
modules still call models from controllers; 1C completes the pattern.

## Error handling

`AppError` carries a `statusCode`, a machine-readable `code`, and optional
`details`. Handlers throw it; the error middleware renders it.

```jsonc
{
  "success": false,
  "code": "COMPANY_NOT_OWNED",
  "message": "You do not own this company",
  "details": [],
  "requestId": "fde5a1ac-9c67-4e06-86b6-e3a29bae0650"
}
```

Anything that is not an `AppError` is logged with its request id and returned as
a generic 500, so internal details never reach a client.

Express 5 forwards rejected promises from async handlers to error middleware
natively. There is deliberately no `asyncHandler` wrapper — it would be dead
weight. This only holds on Express 5; under Express 4 the wrapper is mandatory.

## Data model

The account collections are Phase 1B's; the domain collections are still as
inherited and are Phase 1C's work.

```
seekers        auth fields + profile{headline,bio,skills,experienceYears,location}
               + resume{storageKey,originalName,mimeType,sizeBytes,uploadedAt}
recruiters     auth fields + designation, company → companies
refreshTokens  tokenHash (unique), familyId, subjectId, subjectType, expiresAt (TTL)
otpCodes       codeHash, purpose, subjectId, subjectType, expiresAt (TTL)
otpBudgets     subjectId, purpose, failures, expiresAt (TTL)
users          UNCHANGED, and no longer has a model or any reader. Left on disk
               only so the split is reversible by hand; dropped in the 1C migration

companies      name (unique), description, website, location, logo, userId → recruiters
jobs           title, description, requirements[], salary, experienceLevel,
               location, jobType, position, company → companies,
               created_by → recruiters, applications[] → applications
applications   job → jobs, applicant → seekers, status
```

"Auth fields" is the set shared by both account collections, defined once in
`models/authFields.ts` as a fragment: `email` (unique per collection),
`fullName`, `passwordHash` (`select: false`, nullable for Google-only accounts),
`emailVerifiedAt`, `googleId` (**partial** unique index, not sparse — the field
defaults to `null`, and a sparse index would let only one account exist without
Google), `phone`, `avatarUrl`, `status`, `sessionsInvalidatedAt`,
`migratedFromLegacyAt`, `pendingGoogleLink{}`, and the lockout counters
`failedLoginCount` / `lockedUntil`.

It is a shared fragment rather than a base model or discriminator precisely
because the collections must stay physically separate: duplicating the
definitions is how a lockout field gets added to one and forgotten on the other,
which is a security hole that typechecks.

The same email may hold one seeker account *and* one recruiter account. The
unique index is per collection, which is the point of the split — see
[ADR-0001](docs/adr/0001-two-account-collections.md).

### Known problems with this model

Documented because they are deliberate carry-overs, not oversights:

- **`jobs.applications[]` is an unbounded array.** Every new application
  rewrites the whole job document, and a popular job eventually exceeds Mongo's
  16 MB document limit — at which point it silently stops accepting
  applications. Phase 1C queries `applications` by `job` with an index instead.
  See [ADR-0003](docs/adr/0003-applications-not-embedded.md).
- **No unique index on `{job, applicant}`.** Duplicate-apply is prevented by a
  `findOne` followed by a `create`, which two concurrent requests both pass.
- **`phoneNumber` is a `Number`** — on `users` only. This destroys leading zeros
  and cannot hold a `+91` prefix. The account collections use a `String` named
  `phone`, validated as E.164.
- **One `users` collection with a `role` string.** Split by Phase 1B into
  `seekers` and `recruiters`. See
  [ADR-0001](docs/adr/0001-two-account-collections.md).
- **`seekers._id` and `recruiters._id` are the same ObjectIds as the `users`
  rows they came from.** The 1B migration copied `_id` verbatim, which is the
  only reason `applications.applicant`, `jobs.created_by` and `companies.userId`
  resolve after the split. Any future re-migration must preserve it too, and any
  script that mints fresh ids silently dangles the entire object graph.
- **`sanitizeFilter` was deliberately off.** It is **on** as of Phase 1C
  (`src/config/db.ts`), so an operator-shaped value reaching a filter through a
  string field is compared as a literal. Queries that legitimately want an
  operator opt in with `mongoose.trusted({ $gt: … })`. That is a backstop; the
  defence is still Zod at the request boundary plus explicit projection on every
  query — never `select: false` alone.

## Authentication and authorization

**Current (Phase 1C):**

```
Auth routes      authenticate(portal) → requireVerified → csrfProtection (mutations)
Domain routes    authenticate(portal) → service-layer ownership check
Public reads     optionalAuthenticate()
Both portals     authenticateAny()                     ← /api/v1/user/profile
```

`bridgeAuth` and the legacy `req.id` it populated are deleted. `authenticateAny`
is the generalisation over two portals that the bridge used to provide, minus the
legacy field; `optionalAuthenticate` resolves a session when one exists and never
401s, for the public job board.

It briefly also accepted the inherited `token` cookie behind a
`LEGACY_AUTH_FALLBACK` flag, so that a deploy could be rolled back without
logging out every signed-in user. Both the flag and that branch are now deleted:
the only session-issuing endpoints are the portal-scoped ones.

Authorization is enforced in the **service layer**, not in middleware: the check
is a query predicate (`{ _id, userId: callerId }`) rather than a fetch followed
by a comparison, so there is no window in which an unowned document is in hand.
A resource that is missing and one that belongs to someone else answer
identically — 404, same code, same message — because a 403 confirms existence.
Applications reach their owner transitively: application → job → `created_by`.

There is deliberately no `requireRole` step. With two account collections the
collection *is* the role: a token issued from the seeker portal cannot address a
recruiter route, so a separate role field would be redundant state able to drift
out of sync with the collection describing it.

`requireOwnership` resolves per resource — company edits check `ownerId`, job
edits check `postedBy`, application status changes check that the application's
job belongs to the requester.

## Configuration

`backend/src/config/env.ts` parses `process.env` through a Zod schema and
freezes the result. Missing or malformed variables abort startup with each
offending name listed. `env()` is lazy so the test harness can populate
`process.env` before the first read.

One deliberate exception: `lib/logger.ts` reads `NODE_ENV` directly. The logger
is imported by the error middleware, which loads before any request is served;
calling `env()` there would force full validation at import time and break tests.
`NODE_ENV` is a low-risk enum that needs no validation to pick a log level.

## Scaling triggers

Rate limiting and any future caching sit behind the `RateLimitStore` interface
in `lib/rateLimitStore.ts`, with a single-process in-memory implementation.
Swapping in Redis is a new class and a config line.

**Adopt Redis when any one of these becomes true**
([ADR-0004](docs/adr/0004-no-redis-phase-1.md)):

1. **More than one API instance runs.** Two instances with in-memory limiting
   means an attacker gets 2× the login attempts and lockout counters disagree.
   This is the real trigger.
2. **Deployment moves to serverless.** In-memory state is meaningless there —
   immediate, not eventual.
3. **Transactional email moves to a queue.** Brevo is currently called inside
   the request; a BullMQ queue on Redis fixes that properly.

Until then, Mongo TTL indexes handle token and OTP expiry at no extra
infrastructure cost.

## Observability

Pino, with cookies, authorization headers, passwords, hashes, and tokens
redacted — without that, a log aggregator becomes a session-token store. Every
request carries an `x-request-id` (honoured from an inbound header if present
and ≤64 characters, otherwise generated) which appears on the response, in every
log line, and in every error envelope.

`GET /health` reports process uptime and database connection state.
