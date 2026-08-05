# Phase 2B-1 — Design Language and Portal-Split Authentication (Design)

Date: 2026-08-05. Status: approved by user (direction C — one language, two
densities; split-screen auth with a portal panel; one active session at a time;
`/hire` for recruiter marketing and auth with the workspace staying at
`/admin/*`; frontend test runner folded into this slice).

## Goal

Establish the compositional design language 2A deliberately deferred, and apply
it to the product's front door: the seeker landing, a new employer landing, and
all nine authentication surfaces split by portal.

2A replaced the palette. It did not decide layout, hierarchy, density, or where
motion belongs, and it left page structure inherited from the original template.
The result is a recoloured template: correct tokens, no design. This slice
decides the missing rules once and proves them on real pages, so the two later
slices apply a settled language instead of inventing one per page.

Exit criteria:

- No auth form contains a portal selector. Portal is a route literal on every
  auth surface that has one.
- `/hire` exists and is reachable by an anonymous visitor.
- All three bugs in [Bugs found](#bugs-found) are fixed, each with a regression
  test.- Four layout primitives and two auth primitives exist and are the only way
  these pages express page structure, empty state, and form rhythm.
- A frontend test runner exists and covers the routing, redirect, and session
  behaviour this slice introduces.
- `npm run ci` passes, the 2A colour exit grep still returns nothing, and the
  OKLCH contrast audit passes for every new token pairing.

This slice is frontend-only. No backend change is required — see
[Backend impact](#backend-impact).

## Evidence

The current state was inspected by running the app and driving it with
Playwright: 17 surfaces across both portals, authenticated and anonymous, in
both themes. A backend was run against a live database and seeded with a
recruiter, a company, four jobs, and a seeker, because the empty-state
rendering hides several defects.

### Bugs found

Three defects, each with a regression test in this slice. Bugs 1–2 are visible
on the auth surfaces; bug 3 was found only by signing in with a seeded account.

1. **The portal selector is a native browser control.** `Login.tsx:100` and
   `Signup.tsx:118` use `<Input type="radio">` rather than the Radix
   `RadioGroup` 2A rebuilt. The rendered dot is Chrome's `accent-color`: outside
   the token system, unaffected by theme, unaffected by portal signal. It is the
   only control in the app that cannot be styled. This slice deletes the control
   rather than fixing it.
2. **Two competing primary buttons on one surface.** `--color-primary` maps to
   `--ink`, so a form's submit button is black in light theme and near-white in
   dark, while the navbar's primary is the portal signal colour. The page's main
   action does not look like the application's main action. Observed on
   `/login`, `/signup`, `/admin/companies` ("New Company"), `/admin/jobs`
   ("New Jobs"), and `/admin/jobs/create` ("Post new job").
3. **The account menu is unreachable, so sign-out is unreachable.**
   `Navbar.tsx` renders an avatar-triggered popover containing sign-out for a
   signed-in user, but `Navbar.tsx:88` and `:95` render `AvatarImage` with no
   `AvatarFallback` sibling. `avatarUrl` is null for every account created
   through the standard flow, so `AvatarImage` renders nothing, the trigger
   collapses to an empty circle, and the menu cannot be opened. Observed on both
   portals. `AvatarFallback` exists and is already token-styled
   (`components/ui/avatar.tsx:39`) — it is simply never used.

#### Investigated and dismissed: dark-mode link contrast

An earlier review of the dark-theme `/login` screenshot recorded
`Forgot password?` as a contrast failure. It is not. Measured in-browser, the
link computes to `rgb(169,170,255)` on `rgb(26,25,24)` — **9.08:1**, well above
the 4.5:1 floor. `--signal-text` resolves correctly to its dark-theme seeker
value at both `:root` and the `[data-portal]` scope; the cascade in
`index.css:135-142` behaves as intended.

All six audited pairings pass:

| Pairing | Ratio |
|---|---|
| dark seeker `--signal-text` on `--paper` | 9.08:1 |
| dark recruiter `--signal-text` on `--paper` | 10.90:1 |
| light seeker `--signal-text` on `--paper` | 7.18:1 |
| light recruiter `--signal-text` on `--paper` | 6.51:1 |
| dark `--ink` on `--paper` | 17.21:1 |
| dark `--ink-muted` on `--paper` | 6.69:1 |

The false positive came from judging a small-text colour by eye on a large dark
screenshot. It is recorded here because it is the argument for the scripted
audit in [Verification](#static-and-visual-checks): visual review produced a
confident wrong answer about the one thing it is least able to judge, and the
same mistake in the other direction would have shipped a real failure.

### Structural defects this slice fixes

- Auth cards are `w-1/2` top-aligned inside a `max-w-7xl` flex row, leaving
  roughly two-thirds of the viewport empty with no vertical composition.
- Labels sit directly against their inputs with no rhythm; there is nowhere for
  a hint to live, so `Signup.tsx:113` hardcodes one as a bare `<p>`.
- Signup asks for the portal *after* full name, email, phone, and password. The
  first decision is presented last.
- `"Job seeker"` wraps to two lines beside its radio; `Forgot password?` is
  baseline-misaligned against the radio row.
- The landing centres its hero and then left-aligns the following section
  header, breaking the page's axis.
- The footer reads `Job Hunt` / `© 2024 Your Company. All rights reserved.` —
  inherited placeholder copy in the shipped application.
- **A signed-in user has no visible account menu and no way to sign out**, on
  either portal. `Navbar.tsx` does render an avatar-triggered popover containing
  sign-out for a signed-in user, but `Navbar.tsx:88` and `:95` render
  `AvatarImage` with no `AvatarFallback` sibling. `avatarUrl` is null for every
  account created through the standard flow, so `AvatarImage` renders nothing,
  the trigger collapses to a zero-content circle, and the menu becomes
  unreachable. The signed-in navbar is therefore visually identical to the
  anonymous one minus the auth buttons. `AvatarFallback` exists and is already
  token-styled (`components/ui/avatar.tsx:39`) — it is simply never used.
- Five empty states render as unstyled text: `No skills listed`,
  `No resume available`, `No applied jobs found`, `No jobs found`,
  `No Job Available`.
- An anonymous visit to `/admin/companies` redirects to the seeker landing.
  There is no employer-facing surface anywhere; someone arriving to hire is
  shown "Get Your Dream Job."
- Fraunces renders at roughly 14px for the `/jobs` filter group headings
  ("Location", "Job Type", "Salary"), where a display face reads as weight
  rather than voice.
- `framer-motion` composables exist in `frontend/src/lib/motion.tsx` and are
  imported by exactly one file: the DEV-only `/_design` gallery. The shipped
  application has no motion.

### Defects recorded but deferred

These were confirmed and belong to later slices. They are listed so they are
not rediscovered:

- `Job.tsx:52` renders `{job.position} Positions`, producing "Analytics
  Positions" — `position` is a department string in `jobCreateBodySchema`, not a
  count. (2B-2)
- The job card grid orphans a fourth card on a second row with two empty cells,
  and cards carry no apply, save, or posted-date affordance. (2B-2)
- `/jobs` filters are radios, so multiple locations cannot be selected and a
  chosen filter cannot be cleared. (2B-2)
- `PostJob`'s Description and Requirements are single-line `<Input>`s; the
  form has no heading, no hints, no cancel, and mislabels `position` as
  "Positions". (2B-3)
- Workspace tables show no applicant count and no job status, repeat the company
  name per row, render raw ISO dates, and place their caption *below* the table.
  (2B-3)
- The `Pagination` primitive from 2A is still unwired. (2B-2)
- `frontend/index.html:11` loads `/src/main.jsx` while the entry file is
  `main.tsx`. Vite's extension fallback resolves it in dev; this should be
  corrected before it matters in a production build. (housekeeping — may be
  taken opportunistically in this slice, as a one-line fix)
- `Footer.tsx:5` uses `border-t-gray-200`. The 2A exit grep matches
  `border-gray-[0-9]` but not the side-specific `border-t-gray-[0-9]`, so this
  non-token neutral survives a passing grep. This slice rebuilds the footer
  anyway; the grep pattern itself should be widened to catch side-specific
  variants (`border-[trbl]-`) so the next one does not hide.

## Design

### 1. Route architecture

Three groups, each with its own shell:

| Group | Routes | Shell |
|---|---|---|
| Seeker / public | `/`, `/login`, `/signup`, `/jobs`, `/browse`, `/description/:id`, `/profile` | marketing nav, spacious |
| Recruiter | `/hire`, `/hire/login`, `/hire/signup`, `/admin/*` | marketing nav on `/hire*`, workspace shell on `/admin/*` (2B-3) |
| Shared auth | `/verify-email`, `/forgot-password`, `/reset-password`, `/auth/complete`, `/auth/link-pending`, `/auth/confirm-google-link`, `/auth/error` | `AuthLayout`, reads `?portal=` |

New in this slice: `/hire`, `/hire/login`, `/hire/signup`.

`PortalScope` currently derives the portal from
`pathname.startsWith("/admin")`. It becomes an explicit route-literal map:
paths under `/hire` or `/admin` resolve to recruiter, everything else to seeker.
It continues to read the route only — never a body, query, or cookie — per
CLAUDE.md.

#### The portal selector is deleted, not restyled

`Login.tsx` and `Signup.tsx` lose their `useState<Portal>` and their radio
group. The portal comes from the route the component is mounted on and is passed
in as a prop by the router, so `apiClient.post(\`/${portal}/auth/login\`)`
targets an endpoint that cannot disagree with the visual signal.

This is the substantive correctness gain of the slice. The portal is presently
smeared across three sources — component state in the form, a `?portal=` query
param on shared pages, and a `localStorage` hint for the refresh interceptor —
and the first of those contradicts `PortalScope`, which always renders seeker
iris on `/login` regardless of which radio is selected. Removing the control
removes the contradiction.

The `localStorage` hint stays exactly as it is. It is not a portal *source*; it
records which portal this browser last authenticated against so the bootstrap
`/me` and the refresh interceptor know which mount to call. `frontend/src/lib/portal.ts`
documents why it cannot be a credential, and that reasoning is unchanged.

#### Shared auth pages keep `?portal=`

The seven shared pages are reached by redirect from the Google callback and by
link from either portal, so the query param is load-bearing. They continue to
read it via `usePortalParam()`.

`PortalScope` deliberately does **not** consult it. Consequence: a recruiter
verifying their email sees seeker iris, not recruiter teal.

This is a known, accepted inconsistency. Letting `PortalScope` read a query
param would trade the route-literal invariant — which the backend enforces and
CLAUDE.md states twice — for a cosmetic gain on four low-traffic pages. The
invariant is worth more. If the inconsistency becomes intolerable, the fix is to
duplicate these pages under `/hire/*` so the portal is again a route literal;
that is a later decision, not a reason to weaken the rule now.

#### Cross-portal navigation

Each auth surface links to its counterpart — "Hiring instead?" on the seeker
side, "Looking for a job?" on the recruiter side. For an anonymous visitor this
is the only path between the two worlds, so it is required on every auth page
and on both landings, not optional.

#### Session model

One active session, tracked frontend-side. The backend already isolates
sessions per portal — `backend/src/lib/cookies.ts:22-28` names them
`jp_seeker_at` and `jp_recruiter_at`, so a browser can physically hold both —
but the frontend tracks one `user` and one portal hint. Signing into a portal
replaces the tracked session. Switching portals means signing out and in.

`redux/authSlice`, `useAuthBootstrap`, and `ProtectedRoute` keep their current
shape. No per-portal session map is introduced.

`Home.tsx` presently bounces a recruiter to `/admin/companies` from a
`useEffect` after render. It becomes a redirect resolved before the seeker
landing paints, so the wrong page does not flash. `/hire` performs the mirror
check for a signed-in seeker.

### 2. Design language

Direction: one language, two densities. The same rules across both portals, with
density as a parameter. Not two design systems, and explicitly not two component
sets.

#### 2.1 Type roles

| Face | Role | Constraint |
|---|---|---|
| Fraunces (display) | h1–h3, hero, wordmark, page titles | **Never below 20px.** Display sizes only. |
| Geist Sans (UI) | all interface text, labels, body, buttons, small headings | default for anything under 20px |
| Geist Mono (data) | aligned numeric comparison — table columns of salary, dates, counts, IDs | not for a single value floating in a badge |

The 20px floor fixes the `/jobs` filter headings, where Fraunces at ~14px reads
as weight rather than voice. The mono rule fixes `18LPA`: mono earns its place
when a column of figures must align for scanning, and loses it in an isolated
badge. Salary in a card becomes `₹18 LPA` in Geist; salary in a workspace table
column stays mono.

#### 2.2 Left axis

Content aligns to a strong left edge. Centring is reserved for genuinely
centred moments — a standalone empty state, a confirmation, the auth form column
within its own half of the split.

This is the rule the current landing breaks: a centred hero followed by a
left-aligned section header. Under it, the hero moves left and the page reads on
one spine.

#### 2.3 Density as a parameter

Two values, `spacious` (seeker and marketing surfaces) and `compact` (recruiter
workspace), expressed as steps on the existing spacing scale:

| | spacious | compact |
|---|---|---|
| section gap | 96px | 32px |
| card padding | 24px | 16px |
| table row height | 56px | 40px |
| form field stack gap | 20px | 12px |
| page top padding | 64px | 32px |

This table is normative. Density is a prop on the layout primitives, not a
per-component judgement — the ad-hoc `my-10` / `my-5` / `p-4` spacing in the
current pages is what happens without it.

`/hire` and `/hire/*` are marketing surfaces and run **spacious**, even though
they are recruiter-scoped. Density follows the surface's job, not the portal.

#### 2.4 One primary per surface

The main action on any surface uses the portal signal: `--signal-text` fill with
`--signal-fg` text, per 2A's rule that a filled element carrying text must use
`--signal-text` rather than base `--signal`. `--ink` fills drop to secondary and
neutral use.

This resolves bug 2. A surface has exactly one signal-filled action; everything
else is outline, ghost, or link.

#### 2.5 Motion

The four composables in `frontend/src/lib/motion.tsx` gain real consumers:

| Composable | Applied to |
|---|---|
| `FadeIn` | page entry, auth panel entry |
| `StaggerList` | job lists, table rows, card grids |
| `HoverLift` | interactive cards |
| `SharedElement` | reserved; no consumer in this slice |

Input and button state changes use `--dur-fast` (120ms) with
`--ease-out-quint`. All four composables already short-circuit under
`prefers-reduced-motion: reduce`, so reduced motion needs no per-consumer
handling — that is why the guard lives in the composable.

No parallax, no scroll-driven animation, no entrance animation on content a user
is waiting to read.

### 3. Composition primitives

Four layout primitives in `frontend/src/components/layout/`, each accepting
`density`:

| Primitive | Responsibility | Replaces |
|---|---|---|
| `PageShell` | container width, page padding, nav slot | inconsistent `max-w-7xl` / `max-w-6xl` wrappers |
| `PageHeader` | h1 + optional description + action slot | nothing — workspace screens have no heading at all |
| `EmptyState` | icon + heading + body + optional CTA | five bare-text empty states |
| `FormField` | label + control + hint + error, consistent rhythm | cramped label/input pairs and the hardcoded hint `<p>` |

Two auth primitives in `frontend/src/components/auth/`:

- **`AuthLayout`** — full-height split: form column and portal panel. No
  marketing navbar; the wordmark sits in the form column. Below the `md`
  breakpoint the panel collapses and the form takes the full width.
- **`PortalPanel`** — the portal-specific half. Differs from its counterpart by
  **content and signal token only**, never by structure. Carries the
  cross-portal link.

`PortalPanel` is the component most at risk of forking into two. It must remain
one component taking props. If implementation produces a `SeekerPanel` /
`RecruiterPanel` pair — or any `SeekerCard` / `RecruiterCard` — direction C has
failed and the choice between an editorial or a structural single language
should be revisited rather than papered over.

#### Panel content and the zero-data problem

The seeker panel shows proof numbers: open roles and hiring companies.
`GET /job/get` returns `total` without authentication, so this needs no new
endpoint.

On a fresh or sparse install this reads "0 open roles," which is worse than
showing nothing. Required behaviour: below a threshold of 10 open roles, the
panel renders its value proposition copy with no figures. The numbers are an
enhancement to an already-complete panel, never the panel's only content, and
the panel must not shift layout when they arrive — reserve the space or render
the fallback.

The recruiter panel carries hiring-side value copy. It shows no candidate counts
in this slice; exposing supply-side figures to employers is a product decision,
not a layout one.

### 4. Surfaces

| Surface | Route | Work |
|---|---|---|
| Seeker login | `/login` | `AuthLayout`, selector deleted, signal primary |
| Seeker signup | `/signup` | `AuthLayout`, selector deleted, `FormField` hints |
| Recruiter login | `/hire/login` | new route, teal panel |
| Recruiter signup | `/hire/signup` | new route, teal panel |
| Employer landing | `/hire` | **new page** — the missing front door |
| Seeker landing | `/` | left axis, `EmptyState` for no jobs, footer copy |
| verify-email | shared | `AuthLayout`, reads `?portal=` |
| forgot-password | shared | `AuthLayout` |
| reset-password | shared | `AuthLayout` |
| auth/complete, link-pending, confirm-google-link, error | shared | `AuthLayout`, consistent treatment |

Also in scope:

- **`Navbar` account menu — bug 3.** The popover and its sign-out already exist;
  its avatar trigger renders empty because `AvatarImage` has no `AvatarFallback`
  sibling and `avatarUrl` is null for standard accounts. Adding the fallback
  (initials, over `bg-paper-sunken`) makes the existing menu reachable. This is a
  functional fix, not a styling preference: sign-out is currently unreachable on
  both portals. Regression test asserts the trigger renders non-empty content
  when `avatarUrl` is null.
- **Footer copy.** `Job Hunt` / `© 2024 Your Company. All rights reserved.` is
  replaced with the product's own name and a current year derived at build or
  render time rather than hardcoded.

`/hire` content: headline and subhead addressed to an employer, a primary action
to `/hire/signup`, a secondary to `/hire/login`, a short "how it works" band,
and the cross-link to the seeker side. No pricing, no testimonials, no logo
wall — there is nothing true to put in them yet.

### 5. Verification

#### Test runner

Vitest + React Testing Library + jsdom, configured in `frontend`. The frontend
has had no test runner; 2A was verified by typecheck, lint, build, a colour
grep, a scripted contrast audit, and gallery review. That was defensible for a
slice that only changed colour values. This slice introduces routing, redirect,
and session behaviour, where "it typechecks" proves close to nothing.

Behaviour under test:

- `PortalScope` maps each route group to the correct portal, **including that a
  `?portal=` query param does not influence it**
- each auth form posts to the endpoint matching its route's portal
- a signed-in recruiter at `/` redirects to the workspace; a signed-in seeker at
  `/hire` redirects to the seeker landing
- `ProtectedRoute` renders nothing until `bootstrapped` is true
- auth forms surface validation errors, and `EMAIL_NOT_VERIFIED` redirects to
  `/verify-email` with the portal and email preserved

Regression cases, one per bug:

1. no `input[type="radio"]` appears in the DOM of any auth surface
2. each rebuilt surface renders exactly one signal-filled primary action
3. the navbar avatar trigger renders non-empty content when `avatarUrl` is
   null, and the account menu it opens contains a working sign-out

Plus, not tied to a bug but to the language: every link and text token pairing
on the rebuilt surfaces clears 4.5:1 in both themes, asserted by the contrast
audit rather than by eye.

#### Static and visual checks

- `npm run ci` — build, typecheck, lint, test across workspaces
- **ESLint must actually cover `.tsx`.** `frontend/eslint.config.js:10` matches
  `**/*.{js,jsx}` only, so every `.tsx` file in the frontend currently resolves
  to "File ignored because no matching configuration was supplied" and
  `npm run lint` exits 0 vacuously. Verified by probe: a file containing an
  unused variable passes. `typescript-eslint` is already a devDependency and is
  never wired up. This slice adds a `**/*.{ts,tsx}` block using it, so that
  "lint passes" is a meaningful claim about the code this slice writes. Expect
  the newly-linted existing files to surface violations; fixing those is in
  scope only where they fall in files this slice already touches, and otherwise
  recorded for a later slice rather than silently disabled.
- the 2A colour exit grep returns nothing:
  `grep -rE '(bg|text|border)-\[#|(bg|text|border)-(red|blue|purple|green|yellow|pink|indigo|orange|teal|cyan)-[0-9]' frontend/src`
- the OKLCH contrast audit extended to cover every new pairing introduced by the
  panels, including any gradient or tinted fill. New pairings are audited by
  script before review, never by eye. The dismissed dark-mode finding above is
  the argument: visual review produced a confident, wrong verdict on a 9.08:1
  pairing, and the same error in the opposite direction ships a real failure.
  The audit must resolve colours through a real colour pipeline — parsing
  `oklch()` components as if they were sRGB channels yields nonsense.
- a Playwright pass over each rebuilt route in both themes and both portals,
  asserting no console errors and capturing screenshots for review
- `/_design` continues to render every primitive and gains the six new
  composition primitives

## Backend impact

None. Verified against the code:

- `buildAuthRouter` is mounted per portal and takes the portal as a literal
  (`backend/src/routes/auth.route.ts:43`), so `/recruiter/auth/*` endpoints
  already exist and are what `/hire/*` will call.
- The Google callback redirects to `${WEB_BASE_URL}/auth/complete?portal=…`,
  `/auth/link-pending`, and `/auth/error?code=…`
  (`backend/src/controllers/auth.controller.ts:139-146`), and the link
  confirmation to `/auth/confirm-google-link?portal=…&token=…`
  (`backend/src/services/googleAuth.service.ts:218`). All four are portal-neutral
  paths carrying the portal as a query param. Keeping those pages shared means
  no redirect target changes.

If a later slice moves the shared auth pages under `/hire/*`, those redirect
targets become portal-dependent and the backend does change. Not in this slice.

## Out of scope

- Seeker inner surfaces — `/jobs`, `/browse`, `/description/:id`, `/profile`,
  applied-jobs, and pagination wiring (2B-2)
- Recruiter workspace — `/admin/*`, the workspace shell, applicant counts, job
  status, and the `PostJob` form (2B-3)
- Renaming `/admin/*` to `/hire/*`. The marketing-and-auth prefix is `/hire`;
  the workspace stays at `/admin`. Renaming would touch every recruiter
  component, `PortalScope`, and `ProtectedRoute` for no gain this slice needs.
  The split is defensible: crossing from marketing into the product is a context
  shift, and the URL marks it.
- Concurrent seeker and recruiter sessions in one browser. The cookies permit
  it; the frontend does not model it.
- Any backend change.
