# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Commands

| Task | Command |
|---|---|
| Install | `npm install` (workspace root only) |
| Run API | `npm run dev:api` |
| Run web | `npm run dev:web` |
| Typecheck all | `npm run typecheck` |
| Test all | `npm test` |
| Test one API file | `npm test --workspace @jobportal/api -- errors` |
| Test one web file | `npm test --workspace @jobportal/web -- navbar` |
| Colour-token check | `npm run lint:colour --workspace @jobportal/web` |
| Visual pass | `npm run test:visual --workspace @jobportal/web` (needs a dev server on 5173) |
| Contrast audit | `node frontend/tests/visual/contrast.mjs` |
| Full CI locally | `npm run ci` (takes >120s — run it in the background) |
| Audit prod deps | `npm run audit:prod` |
| 1C migration | `npm run migrate:phase1c --workspace @jobportal/api` |
| Seed first admin | `npm run seed:admin --workspace @jobportal/api -- --email <a> --name "<n>"` |
| 3A migration | `npm run migrate:phase3a --workspace @jobportal/api` |

## Layout

- `backend` — Express 5 + Mongoose 8 API
- `frontend` — React 19 + Vite client
- `packages/shared` — Zod schemas and types imported by both

`packages/shared` must be built before the API typechecks against it. The root
`ci` script does this in the right order.

## Conventions

- **ESM with `moduleResolution: NodeNext`** in `backend` and `packages/shared`.
  Every relative import needs a `.js` extension even in `.ts` files:
  `import { env } from "./config/env.js"`. `frontend` uses `Bundler` resolution
  and does *not* need extensions.
- **Module structure:** `routes → controller → service → model`. Controllers do
  HTTP only. Services hold business rules and are the only layer touching models.
  Never import another module's model directly.
- **Errors:** throw `AppError`. Never `res.status(...).json(...)` for a failure,
  and never `catch` without rethrowing — Express 5 forwards async rejections to
  the error middleware, so no `asyncHandler` wrapper is needed.
- **Responses:** build an explicit DTO. Never serialize a Mongoose document
  directly; that is how password hashes leak.
- **Config:** call `env()` from `src/config/env.ts`. Never read `process.env`
  directly. The one deliberate exception is `src/lib/logger.ts`, which reads
  `NODE_ENV` to pick a log level — going through `env()` there would force full
  config validation at import time and break the test harness.
- **New endpoints:** define the Zod schema in `packages/shared` first.
- **Auth:** never read `passwordHash` without `{ withSecret: true }` on
  `findAccountByEmail`/`findAccountById`. The schema marks it `select: false`, so
  a plain read silently yields `undefined` and every password check fails open
  into the dummy-verify branch.
- **Portals:** `Portal` is `"seeker" | "recruiter" | "admin"` and always arrives
  as a route literal, never from a request body, query or cookie. A function
  that takes a portal from user input is a bug regardless of what it does with
  it. `authenticateAny` and `optionalAuthenticate` resolve **seeker and
  recruiter only** — an admin is an authority over the domain, not a participant
  in it, so an admin cookie must never satisfy a route that meant "some
  signed-in user". Admin routes name their portal.
- **Approval:** recruiters register `pending`. `authenticate("recruiter")`
  admits them — that is identity, and they need it to reach `/me` and learn why
  they are blocked. `requireApproved` is what refuses the work, and belongs on
  every recruiter-owned mutation. It answers **403
  `RECRUITER_PENDING_APPROVAL`**, the one deliberate exception to the 404
  ownership rule below: it discloses nothing about a resource, only about the
  caller's own account. It re-reads the account rather than trusting the token,
  because approval happens mid-session.
- **OTPs:** never log a code, and never resolve the account to mutate from a
  request body — it comes from the matched OTP row's `subjectId`.
- **Operator queries:** `sanitizeFilter` is on globally, so a `$`-operator in a
  filter *value* is compared as a literal. A query that deliberately wants an
  operator must wrap it: `expiresAt: mongoose.trusted({ $gt: new Date() })`.
  Grep for `mongoose.trusted` to see every deliberate one.
- **Ownership:** a resource the caller does not own answers exactly as a missing
  one does — 404, same code, same message. Never 403, which confirms existence.
- **Frontend colour:** every colour comes from a token utility (`bg-paper`,
  `text-ink`, `text-signal-text`, `border-line`, `text-danger`…). Never a hex
  literal, never a Tailwind palette colour, never a `dark:` colour override —
  the tokens flip themselves. See the Current state section for the check.
- **Frontend spacing:** pass `density` to `PageShell` and read the resulting
  custom properties (`p-(--space-card)`, `mt-(--space-section)`). Never
  hand-tune spacing on a page.
- **Frontend portal:** a page never holds a portal in state or reads it from a
  control. It arrives as a prop from the route, the way `buildAuthRoutes` passes
  a literal. `ProtectedRoute` takes it as a required prop for the same reason —
  with three portals, an assumed one admits the wrong portal's user. The
  exception is the seven shared OAuth/OTP pages, which read `?portal=` because
  the backend redirects to portal-neutral paths — and even there `PortalScope`
  ignores the param when resolving the signal colour.
- **Frontend route prefixes:** `/hire/*` is the whole recruiter surface
  (marketing, auth, workspace) and `/admin/*` is the admin console. The
  workspace lived under `/admin/*` before 3A; those URLs redirect. A workspace
  page must go through the `workspace()` helper in `appRoutes.tsx`, which
  composes both gates in the order the API applies them.
- **Frontend motion:** go through `lib/motion.tsx`. Never import
  `framer-motion` in a page — the composables are what honour
  `prefers-reduced-motion`.
- **Frontend type:** Fraunces (`font-display`) never below 20px — `text-xl`
  (1.44rem) is the smallest permitted. Geist Mono only for aligned numeric
  comparison, never a lone value in a badge.

## Guardrails

- Never commit `.env` or any real credential. Only `.env.example` is tracked.
- Never weaken a cookie flag (`httpOnly`, `secure`, `sameSite`) to make local
  development easier — set `COOKIE_SAMESITE` in `.env` instead.
- Never add a route that touches a user-owned resource without an ownership
  check. See `ARCHITECTURE.md` for the middleware chain.
- Do not add Redis. See `docs/adr/0004-no-redis-phase-1.md` for the three
  conditions under which that changes.

## Testing

**API** — Vitest + Supertest + `mongodb-memory-server`. Mount `buildApp()`
directly; never start a listener in a test. Collections are cleared between
tests by `tests/setup.ts`, which also sets every required env var before any
import runs.

For anything touching authorization, add a case to the matrix: anonymous,
seeker, unrelated recruiter, owner — each asserting its expected status code.

**Web** — Vitest + React Testing Library + jsdom, config in
`frontend/vitest.config.ts`, specs in `frontend/tests`. Render through
`renderRoute` from `tests/helpers/renderRoute.tsx` so a component sits inside
the real `Provider` and `PortalScope`. Use its `makeStore()` rather than the
app's `@/redux/store`: the app store is wrapped in redux-persist and rehydrates
from `localStorage`, so a test that dispatches a signed-in user leaks it into
every later test and failures start depending on file order.

`tests/setup.ts` stubs `matchMedia`, which jsdom does not implement and both
next-themes and framer-motion read. Playwright specs live under `tests/visual/`
and are excluded from the jsdom run — they drive a real browser.

For a routing assertion use `renderAppAt` from the same helper: it mounts the
real route table via `useRoutes` under a plain `MemoryRouter`. Not
`createMemoryRouter` — the data router builds a `Request` per navigation, and
jsdom's `AbortSignal` is not the type undici checks against, so every redirect
throws before it resolves.

A test that scans the source tree must assert it read something. The first
version of `workspaceRoutes.test.tsx` resolved its root to a nonexistent
directory and passed over zero files.

## Current state

Phases 1A (foundation), 1B (authentication), 1C (authorization and domain),
2A (Ink & Signal design foundation), 2B-1 (design language and portal-split
authentication) and 3A (three-portal foundation) are complete. The design
system, its primitives and the compositional layer are all in place, and the
auth surfaces plus the landing page are rebuilt on them. Phases 2B-2 (seeker
pages) and 2B-3 (recruiter workspace) have not started — those pages are still
the inherited structure.

What 3A closed:

- **Anyone could self-register as a recruiter** and immediately post jobs, edit
  companies and read applicant PII for a job they invented. Recruiters now
  register `pending` and an admin approves them; `requireApproved` gates every
  recruiter-owned mutation. Google sign-in may sign in an existing recruiter but
  never create one, so registration is the only way a recruiter account begins
- `Portal` is three values, backed by three account collections — the collection
  *is* the role, so there is still no `requireRole`. See
  `docs/adr/0006-three-account-collections.md`
- The admin portal has no self-service registration anywhere: its auth router
  mounts no `/register` and no `/google`, and the client mounts no
  `/admin/signup` route (not merely a hidden link — a typed URL must not reach a
  form that cannot post). The first admin comes from `npm run seed:admin`
- The recruiter workspace moved to `/hire/*`; `/admin/*` is the admin console.
  Pre-3A URLs redirect via a prefix swap, so parameterised paths survive
- `npm run migrate:phase3a` grandfathers existing **verified** recruiters to
  `active`, so the migration does not lock out people who were already working.
  Unverified rows stay `pending`; suspended rows are untouched, because the
  filter matches `status: "pending"` only
- `status` gained `pending`, and `/me` reports it — which is what lets the client
  render the awaiting-approval state instead of a workspace whose every action
  would 403

What 2A closed:

- All colour, radius, type and motion decisions are CSS custom properties in
  `frontend/src/index.css`, mapped into Tailwind 4 via `@theme inline`. No
  component sets a colour outside the token system. 2B-1 replaced the raw grep
  with `npm run lint:colour --workspace @jobportal/web`
  (`frontend/scripts/check-colour-tokens.mjs`), widened to catch side-specific
  borders (`border-t-gray-200`) and the full neutral scale. It currently exits
  **1** with 18 known violations, all in files 2B-2 and 2B-3 own — see the
  itemised list in commit `abbab3e`. No *new* violation may appear
- Dark mode works via `ThemeProvider` (next-themes, `attribute="class"`).
  Components never branch on theme; the tokens flip themselves, so a `dark:`
  colour override in a component is a bug
- Signal is portal-scoped: `PortalScope` sets `data-portal` from the route and
  the signal tokens re-resolve. It reads the route only — never body, query or
  cookie, same rule as the API. The mapping is `portalForPath` in
  `src/lib/portalRoutes.ts` — since 3A, `/hire` → recruiter, `/admin` → admin,
  else seeker — matching on a segment boundary so `/hired` and `/administrator`
  stay seeker paths. It sits in its own module because a file exporting both a
  component and a plain function loses Fast Refresh for the component; the route
  table's components live in `src/routes/routeElements.tsx` for the same reason
- 20 primitives on tokens: the 12 rebuilt (avatar, badge, button, carousel,
  dialog, input, label, popover, radio-group, select, sonner, table) plus 8 new
  (card, tabs, dropdown-menu, tooltip, skeleton, separator, sheet, pagination)
- Semantic state is always icon **and** label, never colour alone. `Badge`
  variants `ok`/`warn`/`danger` exist, but callers pair them with a lucide icon
  — see `AppliedJobTable.tsx` for the pattern
- Filled elements carrying text use `--signal-text` fill with `--signal-fg`
  text. Base `--signal` is non-text use only (borders, indicators, dots)
- All 26 token pairings clear WCAG 4.5:1 in both themes and all three portals
  (18 from 2A, plus 8 for the admin signal added in 3A).
  Light-theme `--warn` and `--ok` are deliberately darker than their nominal
  values to reach it — if you lighten them, re-audit
- Fonts self-hosted via `@fontsource-variable` (Fraunces display, Geist sans,
  Geist Mono). No CDN
- `/_design` renders every primitive across both themes × both portals. It is
  DEV-only via `import.meta.env.DEV` + `React.lazy`, so Rollup drops it from
  production; the build is verified to not contain it

What 2B-1 closed:

- **The frontend has a test runner.** Vitest 3 + React Testing Library + jsdom,
  51 tests in `frontend/tests`. `renderRoute` (`tests/helpers/renderRoute.tsx`)
  mounts the real `Provider`/`PortalScope`. It builds a **fresh non-persisted
  store** per render — never import the app's `@/redux/store` in a test, or
  redux-persist leaks a signed-in user across files and failures depend on
  execution order
- **Authentication is split by portal and the portal selector is gone.** One
  component set mounted by `buildAuthRoutes(portal, prefix)` in
  `src/routes/authRoutes.tsx` — `/login` + `/signup`, `/hire/login` +
  `/hire/signup`, and since 3A `/admin/login` (no signup) — mirroring the API's
  `buildAuthRouter(portal)`. `Login` and `Signup` take `portal` as a **prop from
  the route**, never component state. The native radio pair is deleted: it let
  the posted endpoint disagree with the signal colour resolved from the URL
- The seven shared OAuth/OTP pages (`VerifyEmail`, `ForgotPassword`,
  `ResetPassword`, `AuthComplete`, `LinkPending`, `ConfirmGoogleLink`,
  `AuthError`) stay portal-neutral and keep reading `?portal=`, because the
  Google callback redirects to portal-neutral paths. `PortalScope` still ignores
  that param — the query never moves the portal
- `/hire` is the employer front door. Before it, an anonymous visitor wanting to
  hire was bounced to the seeker home and shown "Get Your Dream Job"
- Four layout primitives in `src/components/layout` — `PageShell`, `PageHeader`,
  `EmptyState`, `FormField` — plus `AuthLayout`/`PortalPanel` in
  `src/components/auth`. `FormField` wires `aria-describedby` and `aria-invalid`
  onto the control it wraps
- **Density is a parameter, not a per-component judgement.** `PageShell` sets
  `data-density`, which resolves `--space-section`/`-card`/`-row`/`-field`/
  `-page-top`, exactly as `data-portal` resolves signal colour. Never hand-tune
  spacing on a page; pass `density`. It follows the surface's job, not the
  portal — `/hire` is recruiter-scoped but spacious, because it is marketing
- `.tsx` files are actually linted now. `eslint.config.js` matched
  `**/*.{js,jsx}` only, so every `.tsx` resolved to "no matching configuration"
  and `npm run lint` passed vacuously
- Motion goes through `src/lib/motion.tsx` (`FadeIn`, `StaggerList`,
  `StaggerItem`, `HoverLift`, `SharedElement`), each short-circuiting under
  `prefers-reduced-motion`. Never call `framer-motion` directly in a page
- Three bugs fixed: the account menu was unreachable (`AvatarImage` with a null
  `src` renders nothing and had no `AvatarFallback` sibling, so the popover
  trigger was a zero-content circle — and `avatarUrl` is null for every account
  created through the standard flow); the login form's primary action was
  `--ink` while the navbar's was the portal signal; and `index.html` loaded
  `/src/main.jsx`, which does not exist and only resolved via Vite's dev-only
  extension fallback
- `frontend/tests/visual/` holds two Playwright scripts: `contrast.mjs` (18
  token pairings, all clearing WCAG 4.5:1) and `run.mjs`
  (`npm run test:visual`, needs a dev server on 5173). The contrast script
  resolves colours **through the browser**; parsing `oklch()` components as if
  they were sRGB reported 2.42:1 for a pairing that measures 9.08:1

What 1C closed, so these are no longer open questions:

- Ownership checks on every route that touches a user-owned resource. Missing
  and foreign both answer **404** with the same body — a foreign recruiter must
  not be able to prove a resource exists
- `getApplicants` returns `ApplicantDto` — name, email, phone, headline, skills
  and a resume link, nothing else
- Keyword search escapes user input before it reaches a `RegExp`
- Resumes upload as Cloudinary `authenticated` assets; the DB stores the
  `public_id` and every read mints a ~10-minute signed URL
- Applying is `POST /application/apply/:id`, deduped by a unique
  `{job, applicant}` index rather than a read-then-write
- All list endpoints paginate (`{ items, total, page, pages }`, `limit` capped
  at 50)
- `bridgeAuth` and `req.id` are gone. Domain routes use `authenticate(portal)`,
  `authenticateAny()` or `optionalAuthenticate()`
- `mongoose.set("sanitizeFilter", true)` is on globally
- The legacy `users` collection is dropped by `npm run migrate:phase1c`
  --workspace @jobportal/api (also drops the pre-1C global `name_1` company
  index; run it once per existing database)

Known gaps, deliberately deferred:

- **There is no admin console UI.** 3A built the admin portal's foundation —
  the collection, the auth router, `seed:admin`, and the two approval endpoints
  (`GET /admin/recruiters/pending`, `POST /admin/recruiters/:id/approve`) — but
  no page that calls them. Approval currently has to be driven against the API
  directly. Worse, `Login.tsx` sends any non-recruiter to `/`, so an admin who
  signs in lands on the **seeker job board**. Both belong to 3B, which builds
  the console; the post-login destination should move with it rather than being
  patched to point at a page that does not exist yet
- Keyword search is an unindexed regex scan. A `$text` index is a Phase 3
  decision, made when there is data and a UI to tune against
- No pagination UI — clients request `limit=50` and show that. The `Pagination`
  primitive exists but is not wired to any list yet
- Replacing a company logo orphans the previous Cloudinary asset
- The seeker pages (`Job`, `JobDescription`, `FilterCard`, `Profile`,
  `UpdateProfileDialog`) and the recruiter workspace (`components/admin/*`)
  still carry inherited non-token neutrals and ad-hoc spacing — 18 occurrences,
  itemised by file and line in commit `abbab3e`. 2B-2 and 2B-3 replace them as
  they rebuild each page
- Two `react-hooks/exhaustive-deps` warnings remain in `AdminJobs.tsx` and
  `Companies.tsx`. Neither is a live bug (`dispatch` is referentially stable);
  they are recorded in `docs/superpowers/plans/2026-08-05-phase-2b-lint-debt.md`
  and belong to 2B-3, whose rebuild will likely replace those effects outright
- `CategoryCarousel` is still centred while the rebuilt landing around it runs
  on one left axis. Same two-axis problem 2B-1 fixed in the hero; the file
  belongs to 2B-2
- `packages/shared/src/legacy-dto.ts` is vestigial. 1C replaced the endpoints it
  described with projected DTOs, and nothing imports the `Legacy*` types any
  more

See `docs/superpowers/plans/2026-08-04-phase-1c-authorization-domain.md`,
`docs/superpowers/plans/2026-08-05-phase-2a-ink-signal-foundation.md`,
`docs/superpowers/plans/2026-08-05-phase-2b-design-language-auth.md` and
`docs/superpowers/plans/2026-08-06-phase-3a-three-portal-foundation.md`.
