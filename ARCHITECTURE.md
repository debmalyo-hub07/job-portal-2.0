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
The 2026-08-27 email-identity work added three more: `otp.service.ts` (the OTP
lifecycle shared by verify-email, reset-password, admin setup and email
change), `emailRegistry.service.ts` (the cross-portal address claim), and
`emailChange.service.ts` (the address-change flow).
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
`migratedFromLegacyAt`, `pendingGoogleLink{}`, `pendingEmailChange{}` (an
in-progress address change), `guardianConsent{}` / `pendingGuardian{}` (the
under-18 consent record and its awaiting address), `suspension{}` (the
recorded reason, timestamp and acting admin behind a suspended status), and
the lockout counters `failedLoginCount` / `lockedUntil`.

It is a shared fragment rather than a base model or discriminator precisely
because the collections must stay physically separate: duplicating the
definitions is how a lockout field gets added to one and forgotten on the other,
which is a security hole that typechecks.

One email address holds exactly one account, across all three collections
*(changed 2026-08-27; it previously allowed one seeker and one recruiter
account per address)*. The guarantee is the `emailRegistry` collection — one
row per account with a unique index on the email — written before the account
at every creation site and deleted with the account by the sweeper. The
per-collection unique indexes stay as a same-portal backstop. An address can
also be changed (`emailChange.service.ts`): password step-up at start, a code
to the new address (admins get a code to the current one first), and every
session revoked on completion — see
[ADR-0001](docs/adr/0001-two-account-collections.md) and its 2026-08-27
amendment.

Google identity resolution is portal-scoped and ordered: match the stable Google
subject id first, then the portal account email, then create a stranger only if
the cross-portal email registry permits it. Stranger seekers are active;
stranger recruiters are pending and pass through the same approval middleware
as password registrations; admins have no Google routes. A verified account
auto-links Google when the verified email matches, while preserving any
existing password, and subsequent sign-ins resolve by Google subject id rather
than by the account's possibly changed email address. Conversely, a Google-only
account (`passwordHash: null`) that attempts a password login fails with the
uniform `INVALID_CREDENTIALS` at the same Argon2 timing as a wrong password —
no oracle leaks the credential type. The account can add a password through
forgot-password, becoming dual-method; see SECURITY.md's cross-method section.

The Google callback does not issue the session it just authorized. It mints a
single-use `googleHandoff` code (60 seconds, one portal) and redirects to
`/auth/complete?portal=…&code=…`; the client posts the code to
`/:portal/auth/google/exchange`, and *that* response carries the session
cookies. The reason is [ADR-0007](docs/adr/0007-deploy-topology.md): the API and
the web app are on different registrable domains, so cookies set on the
callback's own top-level navigation are stored against the API host as a first
party and never presented on the client's cross-site request — a sign-in that
succeeded server-side three times in one day and reported "Sign-in failed" every
time. This is the one flow whose session was not established on a request the
client made itself; now none of them are.

Beyond the accounts sit two 2026-08-27 additions. `accountEvents` is the
append-only oversight history — approve, deny, suspend, reinstate per subject,
with the reason and the acting admin — written by `approval.service.ts` and
`oversight.service.ts`, never edited. Age works the other way round:
`isMinor` is **derived** from `dob` everywhere (the 16-17 band; recruiters
refuse that band at completion), and `guardianConsent` on the account is the
proof a minor completed the gate's second exit with. A minor's applications
are internships only, enforced in `applyToJob`; a suspended recruiter's
listings stay public but apply answers `JOB_OWNER_SUSPENDED`.

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
Recruiter work   authenticate("recruiter") → requireApproved → requireProfileComplete → ownership check
Seeker apply     authenticate("seeker") → requireProfileComplete → csrfProtection
Domain routes    authenticate(portal) → service-layer ownership check
Admin routes     authenticate("admin")                 ← including /admin/profile
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

### The identity gate

Every account carries `dob` and `gender` on the shared `authFields` fragment, so
all three collections gain them at once. Both are optional **at the schema level**
and neither defaults to anything but `null` — `seed:admin` and `seed:catalog` both
create accounts with no date of birth, and a schema-level `required` breaks both
on their next run. The requirement lives in middleware instead.

Completeness is **derived, never stored**. `isProfileComplete(portal, account)` is
`account.dob != null`, with one exception: it returns `true` for every admin. A
persisted boolean would drift the moment anything wrote `dob` by another path, and
there are two such paths — the completion endpoint and the profile update. Admin is
ungated by decision: nothing in the platform reads an admin's date of birth, and
the one account that can unblock every other account must not depend on a new
middleware being correct.

`authenticate` and `resolveSession` both put the answer on `req.auth.profileComplete`,
so `requireProfileComplete` costs no extra query — the same arrangement
`emailVerified` has, and the reason `requireApproved` re-reads the account is only
that `status` never made it onto that object. The middleware refuses on falsy
rather than on `=== false`, so an authenticator that stopped setting the field fails
closed instead of silently disabling the gate everywhere it is mounted.

**Seven gated route sites:** `/application/apply/:id`, all four job writes
(`/post`, `/update/:id`, `/status/:id/update`, `/delete/:id`) and both company
writes (`/register`, `/update/:id`). It sits **after** `requireApproved` in the
recruiter chain, so a pending recruiter hears about approval rather than about a
birth date.

**Deliberately ungated:** `/user/profile`, `/user/profile/update`,
`/user/profile/complete`, `/application/:id/withdraw`, `/me`, refresh, logout and
every public read. The first three are how the gate is cleared, and a gate mounted
on the route that clears it is an unrecoverable lockout — the same trap
`requireVerified` documents for the resend-code route. Withdrawing undoes something
the seeker already did; gating it would trap them in a commitment made before the
field existed.

The admin console mounts `getProfile` and `updateProfile` a **second time** under
`authenticate("admin")` rather than widening `authenticateAny`. That list stays
seeker-and-recruiter for the reason above. The admin mount carries no multer, which
makes it JSON-only where `/user/profile/update` is multipart.

On the client, `landingAfterAuth(user)` is the single destination for every
post-authentication navigation, and `loginDestination` decides whether a saved
`from` may override it — it may not, while identity is unfinished, or the guard
bounces the user straight back and they experience a redirect loop. Before this,
`AuthComplete` sent a Google registration to `homePathFor(portal)`, so a Google
seeker met the gate for the first time as a 403 on their first application.

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

An application moves through five active stages — `applied`, `reviewed`,
`shortlisted`, `interview`, `offered` — and ends on one of two terminal ones,
`rejected` or `withdrawn`. The rules live in `packages/shared/src/applicationStatus.ts`
as pure functions, so the API enforces and the recruiter's status menu is built
from the same list and cannot offer a move the server would refuse. A recruiter
may move freely among active stages, including backwards, because a mis-clicked
stage must be correctable; nothing transitions out of a terminal stage, and a
repeated status is a 409 rather than a silent no-op, so a double-submit cannot
append a second history entry or send a second email. Each transition appends to
an append-only `history` array, which is what the candidate's timeline renders.

A **job** has a lifecycle of its own: `open`, or `closed` once the role is filled.
Closing removes the posting from the public board and refuses new applications
with a 409, and is reversible — the same mis-click argument that allows backward
application transitions. It deliberately does *not* touch the applicants already
in the pipeline: a role is closed because someone was hired, and the remaining
candidates still need decisions, so the recruiter's applicant list keeps working
on a closed job and the workspace shows how many are still awaiting one. A closed
job also stays resolvable at `GET /job/get/:id`, because a candidate who applied
holds that link in their own applied-jobs list.

The board filter is `status: { $ne: "closed" }` and never `status: "open"`. Mongo
does not match a missing field against an equality, so the equality form would
hide every row written before the field existed — the whole seeded catalogue, on
deploy, silently. `toJobDto` reads `doc.status ?? "open"` for the same reason,
mirroring `department ?? "Other"`. Both are wrapped in `mongoose.trusted`, since
the global `sanitizeFilter` reads a bare `$ne` as a literal value. The field is
kept out of the compound index: `$ne` cannot serve as an index prefix and its
selectivity is near zero.

Deleting a job is refused once any application exists (409
`JOB_HAS_APPLICATIONS`), gated on the total rather than the active count — a
rejected candidate's record matters as much as a live one's. Closing is the answer
for a role with history; delete exists for a posting made by mistake.

There is deliberately no `requireRole` step. With three account collections the
collection *is* the role: a token issued from the seeker portal cannot address a
recruiter route, so a separate role field would be redundant state able to drift
out of sync with the collection describing it. See
`docs/adr/0006-three-account-collections.md`.

`requireOwnership` resolves per resource — company edits check `userId`, job
reads check `created_by`, and a recruiter's application status change checks that
the application's job belongs to the requester. A candidate withdrawing resolves
the application by its own `applicant` instead: it is the one transition the job
owner may not perform, so routing it through job ownership would authorise the
wrong party.

Not to be confused with the `postedBy` field on `JobDto`, which is the poster
block a job page renders. That is a projection of `created_by` for display, never
an authorisation input.

## Web architecture

### The portal is a route literal on both sides

The client applies the same rule the API does. `portalForPath`
(`src/lib/portalRoutes.ts`) maps a pathname to a `Portal`, matching on a segment
boundary so `/hired` and `/administrator` stay seeker paths. `PortalScope` calls
it with `useLocation()` and sets `data-portal` — never reading a body or a
cookie.

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

`/admin/set-password` is the one admin auth path outside that table. An admin
created by another admin is stored with `passwordHash: null` and mailed a
`reset_password` code, so the screen is the same form `/reset-password` renders —
mounted with the portal as a route literal and a `setup` copy variant, because
someone who has never had a password is not choosing a *new* one and cannot have
"remembered it". It sits under `/admin` rather than among the portal-neutral
paths so `portalForPath` resolves the console's colour from the path, leaving the
invite link nothing to carry but the address. The link is navigation only: the
code is never in the URL, so a forwarded or scanned email authenticates nobody.

The seven shared OAuth/OTP surfaces are the one exception. They read `?portal=`
because the Google callback redirects to portal-neutral paths, and there the
param *is* the portal — so `portalForPath` consults it, through the same
`portalFromSearch` parser `usePortalParam` uses. The exception is an exact-match
allowlist (`PORTAL_NEUTRAL_PATHS`), not a prefix rule: `/hire/companies?portal=seeker`
stays recruiter and `/login?portal=admin` stays seeker, so a hand-edited query
cannot repaint a portal that owns its path.

`PortalScope` ignored the param for a phase, which is not a smaller version of
the same design — it is a different portal on the same page. Those seven pages
already resolved their copy, their API endpoint and their wordmark suffix from
the param, so a recruiter verifying their email read "Hire without the noise" in
seeker's teal, and the console's own recovery screen did the same. Every token
resolved to a legal value, just the wrong portal's, so no contrast check and no
broken flow ever pointed at it. Nothing here authorizes anything: the portal that
gates a request is still the server-owned mount the API is called on.

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

`/admin` is a protected session door, not a public workspace preview. It
bootstraps the admin portal and routes a matching session to the dashboard and
everyone else to the admin login. There is no admin marketing page and there will
not be one, so `AUTH_COPY.admin.homeHref` is `null` and the admin auth screens
render neither a Back link nor a linked wordmark.

`/hire` is the public employer landing page. It bootstraps the recruiter portal
and redirects to the workspace only when a recruiter session is active; anonymous
and wrong-portal visitors get the landing page, which reads no workspace data. It
was a session door from 2026-08-16 to 2026-08-18, which orphaned `HireLanding`
entirely and turned the Back link and wordmark on every recruiter auth screen into
no-ops — both point at the portal's own home, so the redirect returned the visitor
to the page they were leaving. See the amendment to ADR-0008.

Auth pages remain public in both portals, so a signed-in seeker may still open
`/hire/signup` to create a separate recruiter account.

Pre-3A URLs redirect via a prefix swap (`WorkspaceRedirect`) rather than a list
of literal targets: the workspace paths most worth bookmarking are the
parameterised ones, and enumerating literals drops exactly those.

Both client gates compose in one place (`appRoutes.tsx`), in the order the API
applies them — `ProtectedRoute portal="recruiter"` then `RequireApproved` — so a
new workspace page cannot ship with one of them missing. `RequireApproved` is
presentation only; the API is what actually refuses the write.

Route chrome also has one owner. `PublicLayout` supplies the navbar and footer
for public and seeker surfaces, while recruiter and admin workbench components
own `WorkbenchShell`, including their navbar and sub-navigation. A route whose
component owns a workbench shell must sit outside `PublicLayout`; nesting both
renders two headers and gives two layouts responsibility for the same surface.
Leaf pages such as `CompleteProfile` remain chrome-free and rely on their route
layout instead of mounting `Navbar` themselves.

Because that navbar stays mounted across seeker route changes, its account
popover must be closed by the click that navigates: Radix dismisses a popover
on *outside* interactions only, so the panel would otherwise stay floating over
the page it sent the user to. The workbench shells remount per route and never
had the problem — which is why it surfaced as a seeker-only bug.

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

**Resolved 2026-08-20.** Three of those tokens once did not follow the portal.
`--signal-edge`, `--signal-ring` and `--signal-muted` were declared once in the
`:root` block as functions of `--signal-text` and `--signal`. A custom property's
`var()` is substituted where that property is *computed* — on `<html>` — and the
resulting literal then inherits; it is never re-resolved per consumer. The
`[data-portal]` overrides sit on a `<div>` that `PortalScope` renders below
`<html>`, so they could not feed a value back into an alias already resolved.
Measured in Chromium, all three were the seeker's hue 200 in every portal: on
recruiter and admin, every filled primary's border, every focus ring and every
`bg-signal-muted` wash carried the wrong portal's colour — including the very
3:1 boundary the recruiter gold is documented below as depending on.

All three are now declared inside each of the six portal blocks. That
duplication is the fix rather than a compromise: an alias is computed where its
input is declared, so for a portal-scoped input there is no non-duplicating
form. `lint:colour` could not have caught the original by resolving values,
because `scope()` merges `:root` with the portal block and therefore computes
the value the author intended rather than the one the browser paints. It asserts
the **declaration site** instead — every portal block, in both themes, must
carry its own derivation. That is the honest check, and it is what `/design`
depends on too, since that page puts three `data-portal` blocks on one
document.
Density follows the surface's job rather than the portal — `/hire` is
recruiter-scoped but runs spacious, because it is a marketing page.

#### Triad on Bone

The palette is organised by the 60/30/10 rule, and the three portal hues sit
exactly 120° apart on the OKLCH wheel — a triad, in Adobe's sense, computed in a
perceptually uniform space rather than HSB.

| Band | Tokens | Role |
|---|---|---|
| 60 — ground | `paper`, `-sunken`, `-raised`, `overlay`, `ink`, `-muted`, `-faint` | Warm bone — surfaces at 80°, ink ramp at 70° |
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
- **Chroma on the ground is load-bearing, not decoration.** At L 0.95 a chroma
  of 0.003 is at or below the just-noticeable difference, so the light theme
  shipped a `--paper` of `#efedeb` — 1.7% red-to-blue spread against dark mode's
  24-35% on the same hue. The palette is named for bone and light mode painted
  neutral gray; the two themes were not one family. `lint:colour` now holds both
  themes' `--paper` and `--paper-sunken` to a chroma floor and requires the two
  themes' pages to agree, because no contrast, gamut or hue check can see a hue
  that is merely invisible.

Light mode has only ~0.09 of lightness above a page that still reads as paper,
so its four ground surfaces sit at the 1.09:1 minimum and `--elevate-1/2/3`
carries the rest — the popover-above-card step is delegated to shadow entirely
and `lint:colour` records that exemption at the assertion. A delegation is only
as good as what receives it: the shadows shipped at 6-7% of `--shade`, so for a
time neither mechanism separated anything and the theme read as one flat field
while 551 checks passed. Each grade is now layered — contact, form, and on
grades 2 and 3 a wide ambient. Dark mode needs none of this; its ladder has the
whole range below the page.

Two shapes are forced rather than chosen. Recruiter gold is a *light* fill
(L 0.80) with dark text, because gold below L 0.60 reads olive — so its fill
polarity is inverted relative to seeker and admin, and it needs `signal-edge` to
supply the 3:1 boundary its own lightness cannot. And every interaction ramp must
move in the direction that increases contrast with *that fill's own* foreground,
which is why the dark-mode ramps brighten while the light-mode ramps darken.

`npm run lint:colour` enforces this in CI, with no palette of its own — it parses
`index.css`, replays the cascade for each of the six theme×portal scopes, and
checks 556 assertions against the 4.5:1 and 3:1 floors plus sRGB gamut, the 120°
triad, the elevation and interaction *steps*, and the ground's chroma floor. It
also fails on a *dead class*: a palette token used as `bg-x` without a
`--color-x` alias emits no CSS and renders uncoloured, silently.

Composition is four primitives in `src/components/layout` — `PageShell`,
`PageHeader`, `EmptyState`, `FormField` — plus `AuthLayout`/`PortalPanel` for the
auth split. `FormField` is the load-bearing one: it clones its child to attach
`aria-describedby` and `aria-invalid`, so a hint or error is announced rather
than merely displayed.

Motion goes through `src/lib/motion.tsx`. Each composable short-circuits to a
plain `<div>` under `prefers-reduced-motion`, which is why pages never import
`framer-motion` directly.

Pointer tracking is not framer-motion either, and for the same reason it is not
per-event: `pointermove` fires several times per frame on a fine mouse, so the
hero's handler (`ImageHero`) records the latest position and writes the custom
properties once per frame from `requestAnimationFrame`, with the element's box
measured only when a scroll or resize has invalidated it. Elements that follow
the pointer are positioned through `translate`/`transform`, never `top`/`left` —
layout properties updated at pointer rate invalidate layout under the hero's
blend-mode layers, which is the stutter the reticle showed before this rule.

Public release notes live at `/updates`. `src/data/updates.ts` is the canonical
registry: entries have a stable id, ISO date, category, user-facing summary and
detail list, and are kept newest first — asserted by test rather than sorted at
render, so an entry appended to the end of the array fails CI instead of
publishing invisibly below a list the page labels "Newest first". The page reads
that contract directly and exposes category filters in the URL, so publishing is
a reviewed content change rather than a database operation, and an entry ships in
the same commit as the change it describes. The shape is intentionally
API-ready; when volume or multiple publishers justify a service, the registry
can move behind a paginated endpoint without changing the page model.

### Client state

Two stores with a strict boundary. React Query owns every server read; Redux
owns session identity and client-only state; the URL owns every filter, facet
and page. A server list held in a slice is the recurring bug this rule exists to
prevent — `searchedQuery`, `searchJobByText`, `allAdminJobs` and `allJobs` were
each removed for it, and two sources of truth for one question is how the app
ended up with two job boards, one of which nothing linked to.

Server reads carry more than their rows. `allJobs` kept only the `items` from
the landing query and discarded the pagination envelope's `total`, so the
landing page fetched the open-role count on every visit, threw it away, and
printed a hardcoded number in its place — which went stale the moment the
catalogue grew. An empty initial array also made "no openings" indistinguishable
from "not loaded yet", so the empty state flashed on every load. React Query's
`isPending` distinguishes them; a `length === 0` check cannot.

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

### Figures on marketing surfaces

Every count the landing page prints is derived from what it claims to count:
open roles from the API's `total`, verified teams from `CATALOGUE_COMPANIES`,
disciplines from the list of rows rendered beside them. All three were once
literals — accurate when written against a nine-employer seed, silently wrong
after the catalogue reached twenty-seven, and asserted by nothing.

`lib/displayCount.ts` renders an em dash rather than `0`, covering loading,
failure and a genuinely empty board with one expression: "0 open roles" on a job
marketplace's landing page is worse than declining to say. The employer strip
names its own ratio (`9 of 27`) because it is a curated selection, not the
roster — a positional counter implied it was the whole list.

### Figures on the admin console

The same rule, applied where the reader is an operator rather than a visitor, and
enforced in the DTO instead of at the component: `AdminInsightsDto` types every
unmeasurable figure as `number | null`. `applicationsPerJob` is `null` when there
are no open roles to divide by, and the card renders an em dash and a sentence.
Zero applications per role is a finding about demand; "nothing to divide by" is a
fact about the catalogue, and a dashboard that draws them identically is lying
about one of them.

The counterpart rule is that a named *stage* at zero is information, so
`pipeline.byStatus` always carries all seven keys of `APPLICATION_STATUSES`,
zeros included — seeded from the shared enum rather than from the rows the
aggregation returned. A ranked slice is the opposite case: `composition` omits
entries at zero, because a ranking lists what exists. The two behave differently
on purpose.

The dashboard reads three endpoints rather than one, split by how fast each goes
stale — `/admin/overview` (counters), `/admin/insights` (aggregations, triage and
the eight-week jobs series), `/admin/activity` (a merged feed). One endpoint
would impose the shortest cache policy on all three and re-run eleven
aggregations to refresh a count.

That split is also what the polling rests on. Every live console and workspace
read carries a `refetchInterval` equal to its own `staleTime` — 15s for the
approval queue, 30s for counters, activity, owned jobs and applicants, 60s for
the insights aggregations — so nothing is asked for again before it can have
changed. `refetchIntervalInBackground` stays at its default of false throughout,
so a tab in another window stops asking; the dashboard keeps its manual refresh
control and its server-stamped "as of", because an admin who has just acted
should not have to wait out a tick. Single-record reads (`useCompany`, `useJob`)
deliberately do not poll: they back edit forms, where a background write would
fight what the recruiter is typing.

Background refetches are also **silent**: the dashboard dims only between a
manual refresh and its completion, where the button's spinner is already
speaking. It used to dim on every fetch including the 30-second polls, which
read as the page stuttering twice a minute. The console's side band carries a
live clock and calendar (`ConsoleClock`) — the browser's `Intl` timezone with
an Asia/Kolkata default, chosen per-browser — because the "as of" stamp
describes the data, not the time an admin works against.

The listings (`useAdminRecruiters`, `useAdminSeekers`, `useAdminJobs`,
`useAdminCompanies`) have no interval by design — a mutation is their refresh
path, so the mutation must invalidate them. Console mutations therefore
invalidate the `["admin", <plural>]` prefix rather than any one listing's key:
an approval moves a row on the recruiters screen, a dashboard counter and the
triage band all at once, and prefix invalidation reaches every screen the
decision lands on. The approval mutation once invalidated only the pending
queue's key, which left the Project D monitoring listing showing Approve on a
row it had already approved until the next manual reload — the regression test
in `tests/oversight.test.tsx` pins this.

Account **status** is the one live value that does not live in react-query.
`useAuthBootstrap` writes the session into Redux once, at startup, and every
route guard reads it from there — correct for identity, wrong for a recruiter's
`pending`, which an admin flips from another session entirely. `RequireApproved`
therefore polls `/recruiter/auth/me` through `useSessionRefresh`, gated on
`status === "pending"` and stopping the moment it is not, since an approved
recruiter cannot revert. It is deliberately not folded into `useAuthBootstrap`:
that hook's `bootstrapped` flag gates every protected route, and re-entering its
effect is how protected pages ended up permanently empty once already. Poll
failures are silent — the apiClient interceptor already refreshes on 401 and
clears a genuinely dead session, and a transient blip must not sign anyone out.

Two invariants the API upholds so no client has to reconstruct them:
`jobsPostedSeries` is dense and ascending with gaps zero-filled, because a chart
that silently closes a gap draws a trend the data does not contain; and open jobs
are counted with `status: { $ne: "closed" }`, never equality on `"open"`, since
every one of production's 198 postings predates the field and equality matches
none of them.

Data marks use `--signal-text`, not `--signal`. Measured against `--paper-raised`,
`--signal` is 5.28:1 in the admin portal and **1.66:1** in the recruiter one —
gold on bone effectively disappears — while `--signal-text` clears 4.5:1 on every
surface in all three portals and is already gated there. The distinction matters
because a recruiter analytics surface is planned and these components are
portal-agnostic.

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
