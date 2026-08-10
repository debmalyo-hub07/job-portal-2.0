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
  directly. There are exactly **two** deliberate exceptions, both bootstrap
  reads that happen before validation can run: `src/lib/logger.ts` (`NODE_ENV`
  → log level) and `resolveLogHttpMode()` in `src/lib/httpLogger.ts`
  (`LOG_HTTP`). Both are reached at import time — `buildApp()` runs at module
  scope in 16 test files, before `tests/setup.ts` assigns `MONGO_URI` in
  `beforeAll` — so calling `env()` there fails full config validation and takes
  those suites down at import. `env()` still declares and validates both, so a
  typo is still a named boot failure. Do not add a third without the same
  argument.
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
- **Frontend headings:** exactly one `<h1>` per route, and it is the page's own
  title. The navbar wordmark is a `<span>` — a site name is not a page heading,
  and making it one gave every route two competing `<h1>`s.
  `seekerBoard.test.tsx` asserts the count per route.
- **Frontend list state:** a filter, a sort or a page number lives in the URL,
  never in a slice. Two sources of truth for the same question is how the app
  ended up with two job boards, one of which nothing linked to. If a slice field
  has no writer left after a page moves to the URL, delete the field.
- **No dead controls.** A button whose handler does nothing must not ship, even
  disabled-looking or "for later" — it reads as broken. Ship the control with
  the feature.

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
authentication), 3A (three-portal foundation), 4A/4B (faceted job search),
3B (admin console), 2B-2 (seeker pages) and the deploy artifacts phase are
complete. The design system, its primitives and the compositional layer are all
in place; the auth surfaces, the landing page, the admin console and the seeker
surface are built on them, and the application is deployable. Phase
2B-3 (recruiter workspace) has not started — `components/admin/*` is still the
inherited structure.

What the deploy artifacts phase closed:

- **Every route except `/` 404'd on a static host.** The client routes on the
  client, so a host that cannot resolve a path to a file must serve
  `index.html` — measured before the fix, `/jobs`, `/hire/login`,
  `/admin/review/jobs`, `/profile` and `/browse` all 404'd while `/` served. In-app
  navigation hid it, because that is `history.pushState` and never reaches the
  host; refreshes, pasted links and bookmarks did not. `frontend/vercel.json`
  and `frontend/public/_redirects` (in `public/` so Vite copies it into `dist`
  verbatim) cover all three named hosts. The status is **200, not 302** — the
  router reads the original path off `window.location`, so a redirect would
  discard the route it was meant to preserve
- **`NotFound` at `{ path: "*" }` shipped in the same phase, and before the
  rewrite.** The rewrite is what makes it mandatory: the host answers an
  unresolved path with 200 and `index.html`, the router matches none of the
  literal paths, and the visitor gets a blank white page — strictly worse than
  the host 404 it replaced. Reversed, a half-finished phase would have shipped
  that window
- **`render.yaml` is committed, and `deployConfig.test.ts` checks it against the
  env schema in both directions.** A required variable missing from the
  blueprint, a typo'd variable the schema does not know, and a required variable
  commented out of `.env.example` each fail a named test rather than a
  production boot. Requiredness is asked of the schema
  (`envSchema.shape[key].safeParse(undefined)`), not scanned out of the source
  text, so a reformat cannot break it — which is why `envSchema` is now exported
- **`numInstances: 1` is a security parameter, not a cost choice.**
  `rateLimitStore.ts` is a single-process `Map` per ADR-0004, so every threshold
  it enforces is per-instance: two instances turn `LOGIN_LOCK_THRESHOLD` 5 into
  ~10 and `OTP_BUDGET_MAX_FAILURES` 20 into ~40. Nothing surfaces that at the
  point of change — the dashboard control is a number field beside the plan
  selector. See `docs/adr/0007-deploy-topology.md`
- **`NODE_ENV` and `COOKIE_SAMESITE` are pinned literals in the blueprint.**
  `env.ts` defaults `NODE_ENV` to `development` and `cookies.ts` keys both the
  `Secure` attribute and the `__Host-` prefix off it, so an API deployed without
  it serves over HTTPS setting insecure cookies — no error, no warning, `/health`
  still `ok`. The cookie guardrail held in the code and was silently void in
  deployment. `COOKIE_SAMESITE=none` because Render and Vercel are different
  *sites*: under `strict` sign-in succeeds and the next request is anonymous
- **`startCommand` is `node backend/dist/server.js`, never `npm start`.** Render
  sends SIGTERM on every redeploy; through npm the signal lands on npm, which
  need not forward it, so `server.ts`'s graceful shutdown would never run
- **`cd.yml` is the only check that runs the built artifacts.** `npm test`
  mounts `buildApp()` from source and never executes `dist/server.js`. The
  workflow boots the real server against a `mongo:7` service container and
  asserts `/health` reports both `status: ok` **and** `db: connected` — `status`
  alone would pass with a disconnected database — then inspects the web bundle
  for a hashed entry chunk, the `_redirects` copy, and any `_design` leak.
  Deploys go out by **deploy hook, never a CLI token**: a hook is scoped to one
  project and branch, a `VERCEL_TOKEN` acts on the whole account. A missing
  secret skips its step with a `::notice::` rather than failing the run
- **`secrets: inherit` on the calling job is load-bearing.** A reusable workflow
  sees none of the caller's secrets without it, and both deploy steps skip
  quietly by design — so the omission would look exactly like success

What 2B-2 closed:

- **There were two job boards and the landing page pointed at the wrong one.**
  `/jobs` was the 4B rebuild (react-query, URL-as-state, facets, skeletons);
  `/browse` was the pre-4B original (redux `allJobs`, keyword-only, a fixed
  `grid-cols-3`, no loading state, no pagination). The hero search and every
  category chip navigated to `/browse`, so the faceted board was reachable only
  by clicking "Jobs" directly. `/browse` is now `BrowseRedirect` — it forwards
  to `/jobs` carrying `search` and `hash`, because `/jobs` reads `keyword` from
  the URL as its own state, so a shared link survives the move untranslated
- **`searchedQuery` is gone from `jobSlice`.** With the hero and the carousel
  writing the URL it had no writers left. It was the second source of truth for
  a question the URL already answered, and its last reader was a bug: the
  landing page's "Latest openings" filtered itself by a stale search while its
  heading still claimed to show the latest. Adding it back is how the two-board
  split returns
- **The wordmark is a `<span>`, not an `<h1>`.** Every page in the application
  had two top-level headings — the site name in the navbar and the page's own
  title — so a screen-reader user navigating by heading hit "JobPortal" first on
  every route. `AuthLayout` had already settled this; the navbar had not.
  `seekerBoard.test.tsx` asserts exactly one `<h1>` per route
- **`Pager` moved to `components/layout/`** and the seeker board is its second
  consumer. The board asked for `limit=50` and rendered whatever came back, so
  results 51+ were unreachable — the pagination gap the docs recorded. `page` is
  a URL param like every other filter, so paging is an ordinary navigation and
  the back button works
- **`FilterCard` renders the three facets it was already clearing.** `clearAll`
  and the has-filters check handled `salaryMax`, `experienceMax` and `remote`
  from 4B onward while no control existed for any of them, so "Clear all" could
  appear for filters the rail gave no way to set. Ceilings are radios with an
  explicit "Any" rather than click-to-unset, which no keyboard can reach.
  Clearing filters deliberately keeps `keyword` — that came from the hero or a
  shared link, and discarding it is not what "clear filters" means
- **The job card's two save affordances are gone.** The Bookmark button and
  "Save For Later" both rendered as real controls and called nothing at all.
  Saved jobs is still Phase 3; a control that silently ignores a click is worse
  than an absent one, so they return with the feature. The card is now one link
  rather than a card containing a "Details" button — one tab stop per result
- **`Profile` has an `AvatarFallback`.** Same defect 2B-1 fixed in the navbar:
  `AvatarImage` with a null `src` renders nothing, and `avatarUrl` is null for
  every account created through the standard flow. `initialsOf` moved to
  `src/lib/initials.ts` so the two surfaces cannot drift. Loading is tracked
  separately from `profile === null`, which could not distinguish "still
  fetching" from "the fetch failed"
- **`maxWorkers: 4` in `vitest.config.ts`.** Vitest forks one worker per core;
  a jsdom environment carrying React, framer-motion and embla costs a few
  hundred MB, so twelve at once made this machine swap and tests needing ~1s of
  wall-clock blew the 5s timeout. *Which* tests failed changed between runs,
  which reads exactly like flakiness rather than contention. Raising the timeout
  would have hidden the thrash instead of removing it

What 3B closed:

- **The admin console exists.** `frontend/src/components/console/` — dashboard
  (`/admin/dashboard`), approvals queue (`/admin/recruiters`), and two
  moderation tables (`/admin/review/jobs`, `/admin/review/companies`). Approval
  no longer has to be driven against the API with curl
- **The console lives under `/admin/review/*`, never `/admin/jobs` or
  `/admin/companies`.** Those two prefixes belong to the pre-3A recruiter
  workspace redirects. An exact route would outrank the splat and silently
  break a recruiter's bookmark: it would match the console, hit the admin
  portal gate, and bounce them away from the workspace they asked for.
  `workspaceRoutes.test.tsx` scans source for either literal outside the route
  table — **including inside comments**. The API mirrors the client names
  (`/api/v1/admin/review/*`) so one vocabulary holds end to end
- **`homePathFor(portal)` in `src/lib/portalHome.ts` is the only portal→landing
  mapping.** That ternary was hand-written in five places (`Login`, `Signup`,
  `AuthComplete`, `VerifyEmail`, `Home`), each reading `recruiter ? /hire : /`,
  which sent an admin to the seeker job board. Never write it inline again.
  `ProtectedRoute` uses it too, so a wrong-portal user lands at their *own*
  home rather than a generic `/`
- **Deny is deliberately not idempotent, unlike approve.** `POST
  /admin/recruiters/:id/deny` answers 409 on an already-active recruiter rather
  than overwriting an approval a colleague just made. It sets `suspended`,
  never deletes — the row is the evidence the address was reviewed. The reason
  is required and emailed, so it goes through `escapeHtml`: it is the first
  free text a human types that reaches an email body
- The console's DTOs live in `packages/shared/src/admin.ts` and are **narrow
  projections, not the domain DTOs**. A moderation list must not become a bulk
  export because someone later adds a field to `JobDto`
- `tests/setup.ts` stubs `IntersectionObserver` and `ResizeObserver` beside
  `matchMedia`. jsdom implements none; embla (`CategoryCarousel`) constructs
  both on mount, so every test whose assertion ends at `/` died in the observer
  constructor before reaching its own assertion

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
  borders (`border-t-gray-200`) and the full neutral scale. It is a **hard
  zero** — any violation fails CI. It used to allow 18 known ones, which is
  exactly how drift to 23 landed unnoticed; a baseline that tolerates n
  violations cannot tell you when n grows
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
  production. That was true by construction and unchecked until the deploy
  phase; `.github/workflows/cd.yml` now greps the built bundle for it and fails
  the run if it reappears

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

- Keyword search is an unindexed regex scan. A `$text` index is a Phase 3
  decision, made when there is data and a UI to tune against
- Replacing a company logo orphans the previous Cloudinary asset
- The recruiter workspace (`components/admin/*`) is still the inherited
  structure — ad-hoc spacing, no `PageShell`, no headings. 2B-3 rebuilds it
- Two `react-hooks/exhaustive-deps` warnings remain in `AdminJobs.tsx` and
  `Companies.tsx`. Neither is a live bug (`dispatch` is referentially stable);
  they are recorded in `docs/superpowers/plans/2026-08-05-phase-2b-lint-debt.md`
  and belong to 2B-3, whose rebuild will likely replace those effects outright
- `/profile` is not behind `ProtectedRoute`, so an anonymous visitor reaches a
  page whose two requests both 401 and which then renders its own empty state.
  Harmless — the API refuses correctly and no data leaks — but it should
  redirect to `/login` instead. Belongs with the seeker session work
- `packages/shared/src/legacy-dto.ts` is vestigial. 1C replaced the endpoints it
  described with projected DTOs, and nothing imports the `Legacy*` types any
  more
- **CD triggers deploys, it does not verify them.** A deploy hook answers 202
  once the deploy is queued and says nothing about whether it succeeded, so a
  green `cd.yml` means "both hosts accepted the request". Polling each host's
  API for the resulting deploy status needs the account-scoped tokens the hook
  design deliberately avoids
- **Two dashboard settings live outside the repository.** `render.yaml` carries
  `autoDeploy: false`, but Vercel's equivalent is a project setting — left on,
  it deploys on push while CI is still running, which is exactly what routing
  deploys through the workflow was for. Both are recorded in the README's
  Continuous delivery section

See `docs/superpowers/plans/2026-08-04-phase-1c-authorization-domain.md`,
`docs/superpowers/plans/2026-08-05-phase-2a-ink-signal-foundation.md`,
`docs/superpowers/plans/2026-08-05-phase-2b-design-language-auth.md`,
`docs/superpowers/plans/2026-08-06-phase-3a-three-portal-foundation.md` and
`docs/superpowers/plans/2026-08-10-deploy-artifacts.md`.
