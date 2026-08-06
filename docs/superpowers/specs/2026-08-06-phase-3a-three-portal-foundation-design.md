# Phase 3A — Three-Portal Foundation (Design)

Date: 2026-08-06. Status: approved by user (three roles — seeker, recruiter,
admin — each with dedicated portal, auth, routes and UI; recruiter access gated
by admin approval; Google may sign in an existing recruiter but never create
one; admins never self-register).

## Goal

Turn the two-portal split into a three-portal one, and close the gap that
motivated it: today **anyone can self-register as a recruiter**, which makes the
portal boundary decorative on the side where it matters most.

`register()` in `backend/src/services/auth.service.ts` is identical for both
portals — there is no gating of any kind. `POST /api/v1/recruiter/auth/register`
is open to the world. A second door exists in
`backend/src/services/googleAuth.service.ts`: the "complete stranger" branch of
`resolveIdentity` creates an account on whichever portal it was called from, so
"Continue with Google" on `/hire/signup` self-provisions a recruiter too.

This slice adds the admin portal, gates recruiters behind admin approval, closes
both doors, and moves the recruiter workspace off `/admin/*` so that prefix can
belong to the portal it names.

Exit criteria:

- `Portal` is `"seeker" | "recruiter" | "admin"` and every portal-shaped
  function accepts all three without a special case.
- No unauthenticated caller can create a recruiter or admin account by any
  route, including the Google callback.
- A recruiter account exists in `pending` until an admin approves it, and every
  recruiter-owned write and applicant read refuses while pending.
- `/admin/*` resolves to the admin portal; the recruiter workspace lives under
  `/hire/*`. `portalForPath` still treats `/hired` and `/administrator` as
  seeker paths.
- The admin auth router exposes neither `/register` nor `/google`.
- An admin access token fails **signature verification** on a recruiter route,
  not merely a claim check.
- `npm run ci` passes. `npm run lint:colour` introduces no new violation. The
  contrast audit passes for the admin signal pairings in both themes.

This slice is the first of five. It is deliberately foundation-only: no
redesigned surface ships here.

## Program context

The user's request — "rebuild everything with premium animations … world class
award level and uniqueness" plus three fully separated roles — decomposes into
five sub-projects, each with its own spec, plan and build:

| | Sub-project | Depends on |
|---|---|---|
| **3A** | Three-portal foundation (this document) | — |
| 3B | Motion & interaction foundation (Lenis + GSAP behind `lib/motion.tsx`) | — |
| 3C | Seeker experience redesign | 3A, 3B |
| 3D | Recruiter experience redesign | 3A, 3B |
| 3E | Admin experience (landing, console, approval queue) | 3A, 3B |

3A runs first because it moves routes and changes the page inventory;
redesigning a surface that is about to relocate is wasted work. 3C/3D/3E absorb
the scope previously planned as 2B-2 and 2B-3, which are superseded.

## Evidence

The current state was inspected by running both servers against the live
database and driving 9 routes × 2 themes with Playwright, signed out and signed
in as a seeded recruiter and seeker.

Verified defects this slice fixes:

- `POST /api/v1/recruiter/auth/register` succeeds for any caller. Confirmed by
  registering `audit.recruiter@example.com` against the running API (HTTP 201).
- The Google stranger branch would create a recruiter for any Google identity
  arriving at the recruiter callback.
- `portalForPath` maps `/admin` to **recruiter**, so the admin prefix is already
  taken by the wrong portal.
- `getPortalHint()` hard-codes `raw === "seeker" || raw === "recruiter"`
  (`frontend/src/lib/portal.ts:21`); an admin session would never bootstrap.
- `ProtectedRoute` hard-codes `user.portal !== "recruiter"`
  (`frontend/src/components/admin/ProtectedRoute.tsx:23`).

Live data at design time: 1 seeker, 1 recruiter, 1 company, 4 jobs, 0
applications; the legacy `users` collection exists but is empty.

## Design

### §1 A third portal, not a role flag

`portalSchema` (`packages/shared/src/auth.ts:3`) gains `"admin"`. A new `admins`
collection is defined from the existing `authFields` fragment via `defineModel`,
exactly as `seekers` and `recruiters` are. `accountModel(portal)`
(`backend/src/services/account.service.ts:20`) needs no logic change — it is a
lookup into a `MODELS` record keyed by portal, so it takes a third **entry**,
not a third branch. Widening `portalSchema` is what makes the missing entry a
type error, which is how the compiler finds the rest of the call sites.

`backend/src/lib/keys.ts` and `backend/src/lib/cookies.ts` need **no change**.
`accessTokenKey(portal)` already derives `hkdf(..., "access:" + portal)` and
`accessCookieName(portal)` already yields `jp_${portal}_at`, so the admin key
and cookie come into existence from the type change alone.

The cheaper alternative — an `isAdmin` boolean on recruiters — is rejected. The
portal boundary is currently *cryptographic*: a seeker token presented to a
recruiter route fails signature verification, independent of any claim check. A
role flag would put admins and recruiters on one signing key and reduce the
boundary to a single comparison, which is precisely the fragility
`accessTokenKey`'s comment was written to avoid. Supersedes ADR-0001; a new
**ADR-0006: three account collections** records this.

Admin-specific profile fields are deliberately none for now. The `admins`
schema is `authFields` alone.

### §2 Recruiter gating

`status` (`backend/src/models/authFields.ts:33`) goes from
`enum: ["active", "suspended"]` to `["pending", "active", "suspended"]`, keeping
`default: "active"` so seekers and admins are unaffected.

`register(portal, input)` sets `status: "pending"` when `portal === "recruiter"`
and leaves seekers `active`. Admins are never created by this path (§4).

A pending recruiter **can sign in**. Blocking login would leave them staring at
a generic failure with no way to learn why.

This is the subtlest part of the slice, because the refusal is not in the login
path alone. There are five call sites that currently gate on
`status !== "active"`, and one of them runs on *every authenticated request*:

| Site | Runs on |
|---|---|
| `middleware/authenticate.ts:34` | every authenticated request |
| `middleware/authenticate.ts:103` | the optional/any-portal variant |
| `services/auth.service.ts:350` | password login |
| `services/googleAuth.service.ts:123` | Google sign-in, known `sub` |
| `services/googleAuth.service.ts:158` | Google sign-in, matched by email |

All five become an explicit `status === "suspended"` refusal so `pending` passes
through. Authorization then happens one layer later, in `requireApproved`. The
ordering matters and is the whole design: **`authenticate` establishes who you
are and admits pending; `requireApproved` decides what a pending account may
do.** Collapsing the two — gating in `authenticate` — is what makes it
impossible to show the user why they are blocked.

`/me` carries the status so the client can render an awaiting-approval state.

Authorization is enforced server-side by a new `requireApproved` middleware,
mounted after `authenticate("recruiter")` on every route that creates,
mutates or reads recruiter-owned data:

- company create, update, logo upload
- job create, update, delete
- `getApplicants`
- application status changes

It answers **403 `RECRUITER_PENDING_APPROVAL`**. This is a deliberate exception
to the 404 ownership rule in `CLAUDE.md`. That rule exists so a foreign
recruiter cannot prove a resource exists; here the refusal is about the
caller's own account state and discloses nothing about any resource. A 404
would be actively misleading — the resource may not exist yet at all.

Approval is a single service call flipping `pending → active` and dispatching a
notification mail through the existing `dispatch(sendRendered(...))` path. The
admin *UI* for it is 3E; 3A ships the service and its route so the flow is
testable and can be driven by script.

### §3 Google, per portal

`resolveIdentity` gains the portal-aware rule in its stranger branch:

- `seeker` — create the account, as today.
- `recruiter` — return `{ kind: "failed" }`. No row is created.
- `admin` — unreachable; the route is not mounted.

Branches 1 (known `sub`), 2a (no password), 2b (step-up link) and 2c (unverified
takeover) are **unchanged** for recruiters, so an existing or linking recruiter
still signs in with Google. Only creation is refused.

`buildAuthRouter(portal)` skips the three `/google*` routes entirely when
`portal === "admin"`. The route does not exist rather than existing and
refusing.

No Google Cloud console change is required: `googleRedirectUri` is only called
for portals that mount the callback, so the two registered redirect URIs remain
correct and no admin URI is needed.

### §4 Admin bootstrap

`buildAuthRouter("admin")` omits `/register`. There is no public admin signup
surface to attack, rate-limit or reason about.

The first admin comes from a new script,
`npm run seed:admin --workspace @jobportal/api`. It takes a name and email,
creates the account with `passwordHash: null` and `emailVerifiedAt` set, and
issues a set-password OTP through the existing forgot-password machinery, so no
password is ever passed as a CLI argument or written to a log. It refuses to run
when an admin already exists unless explicitly forced.

Admin-invites-admin is deferred to 3E.

### §5 Routing

| Portal | Landing | Auth | Workspace |
|---|---|---|---|
| Seeker | `/` | `/login`, `/signup` | `/jobs`, `/browse`, `/description/:id`, `/profile` |
| Recruiter | `/hire` | `/hire/login`, `/hire/signup` | `/hire/companies`, `/hire/companies/create`, `/hire/companies/:id`, `/hire/jobs`, `/hire/jobs/create`, `/hire/jobs/:id/applicants` |
| Admin | `/admin` (sign-in door) | `/admin/login` | `/admin/console/*` |

`/admin` is a sign-in surface, not a marketing page — there is no public to
market an internal console to. Its designed identity is 3E's work.

Frontend changes:

- `portalForPath` becomes 3-way on the same segment-boundary comparison, so
  `/hired` and `/administrator` remain seeker paths. A test asserts this for all
  three prefixes.
- `getPortalHint()` accepts `"admin"` (`frontend/src/lib/portal.ts:21`).
- `ProtectedRoute` takes the required portal as a **prop from the route**,
  never from state — the same rule as `Login`/`Signup`. `buildAuthRoutes` gains
  an admin mount that omits the signup route.
- The seven shared OAuth/OTP pages keep reading `?portal=` and must now
  validate it against three values.

The old `/admin/companies` and `/admin/jobs` paths redirect to their `/hire/*`
equivalents so existing bookmarks do not land on the admin portal.

### §6 Admin signal colour

Seeker is hue 282 (violet), recruiter 185 (teal). Admin takes **hue ~330**
(magenta), which stays clear of `warn`, `ok` and `danger` and is unambiguous
against the other two. Exact lightness and chroma are chosen to clear WCAG
4.5:1 for all pairings in both themes, verified by
`node frontend/tests/visual/contrast.mjs` — which resolves colours through the
browser, so the values are measured rather than computed from `oklch()`
components. Light-theme values will likely need to be darker than nominal, as
`--warn` and `--ok` already are.

### §7 Migration

A migration script, run once per database:

- Grandfathers every existing verified recruiter to `status: "active"` (1 row
  today), so the approval gate does not retroactively lock out real accounts.
- Drops the empty legacy `users` collection, which phase 1C's migration never
  ran against on this database.

## Out of scope

Deferred to 3E: the admin console UI, the approval queue screen,
admin-invites-admin, audit logging, job moderation, and account suspension from
the UI. Deferred to 3B/3C/3D: every visual change. No page is redesigned in this
slice; pages move and gain guards only.

## Testing

**API.** The authorization matrix in `CLAUDE.md` extends from four actors to
six — anonymous, seeker, pending recruiter, approved recruiter, unrelated
approved recruiter, admin — each asserting its expected status code on every
gated route. New cases:

- Every `requireApproved` route answers 403 `RECRUITER_PENDING_APPROVAL` for a
  pending recruiter and its normal code for an approved one.
- A pending recruiter can log in and `/me` reports the pending status.
- A suspended account still cannot log in, and a suspended account holding an
  already-issued access token is refused by `authenticate` — one case per portal,
  since §2 relaxes both `authenticate` call sites.
- A pending recruiter passes `authenticate` and is refused only by
  `requireApproved`, asserting the two layers stay separate.
- The Google callback on the recruiter portal returns `failed` and creates **no
  row** for an unknown identity; asserted by counting the collection before and
  after.
- The Google callback still signs in a recruiter whose `googleId` is known, and
  still issues the step-up link for branch 2b.
- `GET /api/v1/admin/auth/google` and `POST /api/v1/admin/auth/register` are
  404 — not 401, not 405.
- An admin access token presented to a recruiter route fails signature
  verification.
- `seed:admin` refuses to create a second admin unless forced.

**Web.** `renderRoute` with its fresh non-persisted `makeStore()`:

- `portalForPath` for all three prefixes plus `/hired` and `/administrator`.
- `PortalScope` resolves `data-portal="admin"` under `/admin`.
- `ProtectedRoute` admits only the portal passed as its prop.
- The `/admin/companies` → `/hire/companies` redirect.
- A pending recruiter sees the awaiting-approval state rather than the
  workspace.

## Risks

The route move is the largest source of breakage: there are **23 hard-coded
`"/admin` string literals** in `frontend/src`, and a stale one becomes a dead
link rather than a compile error. Six are the route definitions themselves in
`App.tsx`; the rest are `navigate()` calls inside the admin components, **plus
three post-login redirects outside them** — `Login.tsx:45`, `Login.tsx:60` and
`AuthComplete.tsx:32` all send a recruiter to `/admin/companies` after
authenticating. Mitigation: the grep is an explicit plan step with the count
asserted, plus the redirects in §5 as a runtime backstop.

Relaxing `status !== "active"` to `status === "suspended"` (§2) touches five
call sites, two of them in `authenticate` and therefore on the path of every
authenticated request on **all three portals**. An error in the permissive
direction would admit suspended accounts everywhere at once. Each call site is
changed individually with a test asserting suspended still fails, never by a
blanket find-and-replace.
