# Architecture

## Request lifecycle

Middleware order in `backend/src/app.ts`. Order is load-bearing — the comments
in that file explain why each position matters.

```
requestId            correlation id, first so every later log line carries it
pino-http            structured request logging, cookies redacted
applySecurity        helmet, CORS allowlist, 1mb body limits, hpp
cookieParser
rateLimit            100/min per IP globally; tighter per-route limits in 1B
── routes ──         /health, /api/v1/{user,company,job,application}
notFound             terminal 404 envelope
errorHandler         must be last, or thrown errors reach Express's HTML page
```

`buildApp()` returns the wired app without calling `listen`, so Supertest mounts
it directly and no test needs a real port. `server.ts` owns the listener,
connects to MongoDB *before* accepting traffic, and handles `SIGTERM`/`SIGINT`
with a 10-second forced-exit fallback.

## Module boundaries

```
routes → controller → service → model
```

Controllers handle HTTP only: read the request, call a service, shape a response.
Services hold business rules and are the only layer that touches models.
Cross-module reads go through the owning module's service, never another
module's model directly.

Phase 1A retains the tutorial's controller-calls-model shape, because
introducing a service layer at the same time as the TypeScript migration would
have made the diff unreviewable. Phase 1B introduces services for auth, and 1C
completes the pattern.

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

Current, as inherited. Phase 1C replaces this — see the design spec.

```
users          fullname, email (unique), phoneNumber, password, role, profile{}
companies      name (unique), description, website, location, logo, userId → users
jobs           title, description, requirements[], salary, experienceLevel,
               location, jobType, position, company → companies,
               created_by → users, applications[] → applications
applications   job → jobs, applicant → users, status
```

### Known problems with this model

Documented because they are deliberate carry-overs, not oversights:

- **`jobs.applications[]` is an unbounded array.** Every new application
  rewrites the whole job document, and a popular job eventually exceeds Mongo's
  16 MB document limit — at which point it silently stops accepting
  applications. Phase 1C queries `applications` by `job` with an index instead.
  See [ADR-0003](docs/adr/0003-applications-not-embedded.md).
- **No unique index on `{job, applicant}`.** Duplicate-apply is prevented by a
  `findOne` followed by a `create`, which two concurrent requests both pass.
- **`phoneNumber` is a `Number`.** This destroys leading zeros and cannot hold a
  `+91` prefix.
- **One `users` collection with a `role` string.** Phase 1B splits this into
  `seekers` and `recruiters`. See
  [ADR-0001](docs/adr/0001-two-account-collections.md).

## Authentication and authorization

**Current (Phase 1A):** a single JWT in a cookie, verified by
`isAuthenticated`, which sets `req.id` to the user id. There is no role check
and no ownership check on any route. Any authenticated user can post a job, edit
any company, read any job's applicant list, and change any application's status.
This is the central defect Phase 1B and 1C exist to fix.

**Target (Phase 1B/1C):**

```
authenticate(portal) → requireVerified → requireOwnership(resource)
```

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
