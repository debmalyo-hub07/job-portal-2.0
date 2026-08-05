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
`session.service.ts`), and Phase 1C completed the pattern across the domain
modules — `company`, `job`, `application` and `resume` all have services now.
No controller issues a query. The only remaining `models/` reference from a
controller is a **type-only** import of `SeekerDocument`/`RecruiterDocument` in
`user.controller.ts`, which erases at compile time and touches nothing.

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

The account collections are Phase 1B's; the domain collections were reshaped by
Phase 1C.

```
seekers        auth fields + profile{headline,bio,skills,experienceYears,location}
               + resume{storageKey,originalName,mimeType,sizeBytes,uploadedAt}
recruiters     auth fields + designation, company → companies
refreshTokens  tokenHash (unique), familyId, subjectId, subjectType, expiresAt (TTL)
otpCodes       codeHash, purpose, subjectId, subjectType, expiresAt (TTL)
otpBudgets     subjectId, purpose, failures, expiresAt (TTL)
users          DROPPED by the 1C migration, along with the pre-1C global name_1
               company index. Run it once per pre-existing database

companies      name, description, website, location, logo, userId → recruiters
               unique on {userId, name} — two recruiters may each have a
               "Acme", one recruiter may not have two
jobs           title, description, requirements[], salary, experienceLevel,
               location, jobType, position, company → companies,
               created_by → recruiters
applications   job → jobs, applicant → seekers, status
               unique on {job, applicant}
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

- **`phoneNumber` was a `Number`** — on `users` only, which is now dropped. It
  destroyed leading zeros and could not hold a `+91` prefix. The account
  collections use a `String` named `phone`, validated as E.164.
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

Two problems listed here before Phase 1C are now closed:

- **`jobs.applications[]` was an unbounded array.** Every new application
  rewrote the whole job document, and a popular job would eventually exceed
  Mongo's 16 MB limit and silently stop accepting applications. The field is
  gone from the schema; applications are queried by `job` instead. See
  [ADR-0003](docs/adr/0003-applications-not-embedded.md).
- **No unique index on `{job, applicant}`.** Duplicate-apply was prevented by a
  `findOne` followed by a `create`, which two concurrent requests both pass.
  The unique index now rejects the second write, so the race cannot be won.

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

## Web architecture

### The portal is a route literal on both sides

The client applies the same rule the API does. `portalForPath`
(`src/lib/portalRoutes.ts`) maps a pathname to a `Portal`, matching on a segment
boundary so `/hired` and `/administrator` stay seeker paths. `PortalScope` calls
it with `useLocation().pathname` and sets `data-portal` — never reading a body,
query or cookie.

Auth pages take `portal` as a **prop from the route**, supplied by
`buildAuthRoutes(portal, prefix)`:

```
buildAuthRoutes("seeker", "")        →  /login       /signup
buildAuthRoutes("recruiter", "/hire") →  /hire/login  /hire/signup
```

That is deliberately the same shape as the server's `buildAuthRouter(portal)`
mounted at `/seeker/auth` and `/recruiter/auth`: one component set, two mounts,
the portal named only at the mount site. Before this, `Login` held the portal in
`useState` behind a radio pair, so the endpoint the form posted to and the
accent colour the URL resolved could disagree.

The seven shared OAuth/OTP surfaces are the one exception. They read `?portal=`
because the Google callback redirects to portal-neutral paths — but even there
`PortalScope` ignores the param, so the query changes the form's target endpoint
and never the resolved portal.

`localStorage["jp.portal"]` is a **hint, not a credential**: it decides which
mount `/refresh` and `/me` are sent to. Authority lives in the `httpOnly` cookie,
whose key is derived per portal, so a tampered hint can only produce a 401.

### Tokens resolve, components do not branch

Every colour, radius, type size and duration is a CSS custom property in
`src/index.css`, exposed to Tailwind 4 through `@theme inline`. Two attributes
re-resolve those properties beneath them:

| Attribute | Set by | Resolves |
|---|---|---|
| `data-portal` | `PortalScope`, from the route | `--signal*` — violet for seekers, teal for recruiters |
| `data-density` | `PageShell`, from a prop | `--space-section`, `-card`, `-row`, `-field`, `-page-top` |

Both work the same way and for the same reason: a component reads a token and
asks no questions. Nothing branches on the theme, the portal or the surface.
Density follows the surface's job rather than the portal — `/hire` is
recruiter-scoped but runs spacious, because it is a marketing page.

Composition is four primitives in `src/components/layout` — `PageShell`,
`PageHeader`, `EmptyState`, `FormField` — plus `AuthLayout`/`PortalPanel` for the
auth split. `FormField` is the load-bearing one: it clones its child to attach
`aria-describedby` and `aria-invalid`, so a hint or error is announced rather
than merely displayed.

Motion goes through `src/lib/motion.tsx`. Each composable short-circuits to a
plain `<div>` under `prefers-reduced-motion`, which is why pages never import
`framer-motion` directly.

### Client state

Redux Toolkit with redux-persist. The persistence is why tests must build their
own store: `tests/helpers/renderRoute.tsx` exports `makeStore()` with the same
reducers and no persistence, because a test that dispatched a signed-in user
into the app's store would rehydrate it into every later test and make failures
depend on file order.

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
