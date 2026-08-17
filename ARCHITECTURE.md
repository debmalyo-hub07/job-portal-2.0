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

**Current (Phase 3A):**

```
Auth routes      authenticate(portal) → requireVerified → csrfProtection (mutations)
Recruiter work   authenticate("recruiter") → requireApproved → ownership check
Domain routes    authenticate(portal) → service-layer ownership check
Admin routes     authenticate("admin")
Public reads     optionalAuthenticate()
Seeker+recruiter authenticateAny()                     ← /api/v1/user/profile
```

`bridgeAuth` and the legacy `req.id` it populated are deleted. `authenticateAny`
is the generalisation the bridge used to provide, minus the legacy field;
`optionalAuthenticate` resolves a session when one exists and never 401s, for the
public job board.

Both of those resolve **seeker and recruiter only** — a literal list, not the
shared `PORTALS`. They answer "whoever the browser happens to be" on domain
routes, and an admin is an authority over the domain rather than a participant in
it, so an admin cookie must never silently satisfy a route that meant "some
signed-in user". Admin-only routes name their portal.

It briefly also accepted the inherited `token` cookie behind a
`LEGACY_AUTH_FALLBACK` flag, so that a deploy could be rolled back without
logging out every signed-in user. Both the flag and that branch are now deleted:
the only session-issuing endpoints are the portal-scoped ones.

### Identity and permission are separate steps

`authenticate("recruiter")` admits a **pending** recruiter deliberately. It
establishes who the caller is, which is what lets them reach `/me` and be told
why they are blocked. `requireApproved` then decides what they may do, and is
mounted on every recruiter-owned mutation: job posting, both company mutations,
and the two applicant routes.

It re-reads the account rather than trusting a claim in the access token.
Approval happens while the recruiter is signed in, and a status baked into a
15-minute token would either lock them out for the rest of its life or — worse —
leave a revoked recruiter working until it expired.

`requireApproved` answers **403 `RECRUITER_PENDING_APPROVAL`**, and is the one
deliberate exception to the 404 rule below. That rule exists so a foreign
recruiter cannot prove a resource exists; this refusal is about the caller's own
account state and discloses nothing about any resource. A 404 here would also be
a lie, since the call being refused is usually the one that would have created
the resource.

Authorization is otherwise enforced in the **service layer**, not in middleware:
the check is a query predicate (`{ _id, userId: callerId }`) rather than a fetch
followed by a comparison, so there is no window in which an unowned document is
in hand. A resource that is missing and one that belongs to someone else answer
identically — 404, same code, same message — because a 403 confirms existence.
Applications reach their owner transitively: application → job → `created_by`.

There is deliberately no `requireRole` step. With three account collections the
collection *is* the role: a token issued from the seeker portal cannot address a
recruiter route, so a separate role field would be redundant state able to drift
out of sync with the collection describing it. See
`docs/adr/0006-three-account-collections.md`.

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
buildAuthRoutes("seeker", "")                          →  /login       /signup
buildAuthRoutes("recruiter", "/hire")                  →  /hire/login  /hire/signup
buildAuthRoutes("admin", "/admin", {withSignup:false}) →  /admin/login
```

That is deliberately the same shape as the server's `buildAuthRouter(portal)`
mounted at `/seeker/auth`, `/recruiter/auth` and `/admin/auth`: one component
set, three mounts, the portal named only at the mount site. Before this, `Login`
held the portal in `useState` behind a radio pair, so the endpoint the form
posted to and the accent colour the URL resolved could disagree.

Admin has no signup **route**, not merely a hidden link — the API's admin router
mounts no `/register`, so a typed URL must not reach a form that cannot post.

The seven shared OAuth/OTP surfaces are the one exception. They read `?portal=`
because the Google callback redirects to portal-neutral paths — but even there
`PortalScope` ignores the param, so the query changes the form's target endpoint
and never the resolved portal.

`localStorage["jp.portal"]` is a **hint, not a credential**. It is a reload and
new-tab fallback for the last active portal; once a tab resolves a route,
`activatePortal(portal)` pins refresh retries to that route's portal. Authority
lives in portal-scoped `httpOnly` cookies, so tampering with the hint can only
select an endpoint whose cookie validation then fails.

Browser auth state is also portal-scoped. Redux stores `sessions[portal]` and
`bootstrappedPortals[portal]`; each `ProtectedRoute`, `GuestRoute`, and bare
portal redirect calls `useAuthBootstrap(requiredPortal)` and verifies that
specific cookie through `/<portal>/auth/me`. Cached users persist only to avoid
a signed-out flash. Bootstrap flags do not persist, so a reload always asks the
server before protected content renders.

Access, refresh, and CSRF cookies all use portal-specific names. The Axios
client mirrors that boundary with one in-memory CSRF token and one in-flight
refresh promise per portal. A seeker and recruiter session can therefore
coexist, and signing out of one clears only that portal. See ADR-0008.

### Three prefixes, three portals

`/admin` belongs to the **admin** portal as of Phase 3A. The recruiter workspace
that lived there through 2B-1 moved to `/hire/*`, so the whole recruiter surface
— auth and workspace — sits under one prefix and resolves one signal colour.

The bare `/hire` and `/admin` paths are protected session doors, not public
workspace previews. They bootstrap the destination portal and route a matching
session to its workspace or an anonymous/wrong-role visitor to that portal's
login. Auth pages remain public, so a signed-in seeker may still open
`/hire/signup` to create a separate recruiter account.

Pre-3A URLs redirect via a prefix swap (`WorkspaceRedirect`) rather than a list
of literal targets: the workspace paths most worth bookmarking are the
parameterised ones, and enumerating literals drops exactly those.

Both client gates compose in one place (`appRoutes.tsx`), in the order the API
applies them — `ProtectedRoute portal="recruiter"` then `RequireApproved` — so a
new workspace page cannot ship with one of them missing. `RequireApproved` is
presentation only; the API is what actually refuses the write.

Wrong-role sessions never satisfy a destination guard. The redirect goes to the
destination portal's login, not the current user's home. This is navigation
behavior, not the security boundary: every API route still authenticates its
literal portal server-side. The admin URL is intentionally ordinary and
discoverable; obscuring or encrypting a path would not replace authorization.

### Tokens resolve, components do not branch

Every colour, radius, type size and duration is a CSS custom property in
`src/index.css`, exposed to Tailwind 4 through `@theme inline`. Two attributes
re-resolve those properties beneath them:

| Attribute | Set by | Resolves |
|---|---|---|
| `data-portal` | `PortalScope`, from the route | `--signal*`, `--container` — one hue per portal |
| `data-density` | `PageShell`, from a prop | `--space-section`, `-card`, `-row`, `-field`, `-page-top` |

Both work the same way and for the same reason: a component reads a token and
asks no questions. Nothing branches on the theme, the portal or the surface.
Density follows the surface's job rather than the portal — `/hire` is
recruiter-scoped but runs spacious, because it is a marketing page.

#### Triad on Bone

The palette is organised by the 60/30/10 rule, and the three portal hues sit
exactly 120° apart on the OKLCH wheel — a triad, in Adobe's sense, computed in a
perceptually uniform space rather than HSB.

| Band | Tokens | Role |
|---|---|---|
| 60 — ground | `paper`, `-sunken`, `-raised`, `overlay`, `ink`, `-muted`, `-faint` | Warm bone, house hue 70° |
| 30 — structure | `line`, `line-strong`, `container`, `container-ink`, `shade` | Chrome; `container` is the portal hue desaturated to a field |
| 10 — signal | `signal`, `-hover`, `-pressed`, `-text`, `-fg`, `-edge`, `-muted` | The only chromatic fill in the layout |

Portal hues: seeker 200°, recruiter 80°, admin 320°. Status hues sit clear of all
three — danger 25°, warn 55°, ok 145° — so identity and meaning are never
confusable.

Four distinctions carry most of the weight, and each exists because collapsing it
shipped a bug:

- **`line` vs `line-strong`.** `line` is a 12% wash for decorative dividers,
  which WCAG 1.4.11 exempts. A control's boundary is not exempt, so inputs,
  selects, radios, and badge outlines take `line-strong` at 3:1. Roughly twelve
  of ninety `border-line` sites are controls.
- **`signal` vs `signal-text`.** `signal` is the fill and the portal's identity;
  `signal-text` is the darkened grade that carries 4.5:1 as type on paper. Using
  the text grade as a fill is what made the recruiter button olive rather than
  gold.
- **A fill grade and a text grade per status.** A tinted badge is a wash of its
  own status colour, so darkening the type darkens the wash by the same
  proportion and the ratio barely moves — `bg-ok/15 text-ok` measured 4.01:1 in
  every portal. Type on a wash takes `-text`; the fill takes `-fg`.
- **`shade` vs `ink`.** A scrim must dim its backdrop in both themes, so it
  cannot use a token that flips with the theme.

Two shapes are forced rather than chosen. Recruiter gold is a *light* fill
(L 0.80) with dark text, because gold below L 0.60 reads olive — so its fill
polarity is inverted relative to seeker and admin, and it needs `signal-edge` to
supply the 3:1 boundary its own lightness cannot. And every interaction ramp must
move in the direction that increases contrast with *that fill's own* foreground,
which is why the dark-mode ramps brighten while the light-mode ramps darken.

`npm run lint:colour` enforces this in CI, with no palette of its own — it parses
`index.css`, replays the cascade for each of the six theme×portal scopes, and
checks 440 pairings against the 4.5:1 and 3:1 floors plus sRGB gamut and the 120°
triad. It also fails on a *dead class*: a palette token used as `bg-x` without a
`--color-x` alias emits no CSS and renders uncoloured, silently.

Composition is four primitives in `src/components/layout` — `PageShell`,
`PageHeader`, `EmptyState`, `FormField` — plus `AuthLayout`/`PortalPanel` for the
auth split. `FormField` is the load-bearing one: it clones its child to attach
`aria-describedby` and `aria-invalid`, so a hint or error is announced rather
than merely displayed.

Motion goes through `src/lib/motion.tsx`. Each composable short-circuits to a
plain `<div>` under `prefers-reduced-motion`, which is why pages never import
`framer-motion` directly.

### Client state

Redux Toolkit with redux-persist. The auth subtree persists the per-portal user
cache, but blacklists `activePortal`, loading, and every bootstrap flag. The root
persistor blacklists `auth` so the nested persistor manages auth in isolation. The
server remains authoritative after every reload while users avoid a signed-out
flash.

Persistence is why tests must build their own store:
`tests/helpers/renderRoute.tsx` exports `makeStore()` with the same reducers and
no persistence, because a test that dispatched a signed-in user into the app's
store would rehydrate it into every later test and make failures depend on file
order.

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
