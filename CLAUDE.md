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
- **CSRF:** the token reaches the client in the **response body** of every
  session-issuing endpoint (`/login`, `/verify-email`, `/refresh`, `/me`) and
  lives in a module variable in `apiClient.ts`. Never read it back from
  `document.cookie`: cross-site — which the deployed app is, web on Vercel and
  API on Render — the browser stores and sends `__Host-jp_csrf` but withholds it
  from `document.cookie` regardless of `httpOnly: false`. That is cookie
  partitioning, not `httpOnly`, and same-origin dev cannot reproduce it. `/me`
  must return one too, because a reload and the Google callback's top-level
  redirect both start with empty memory — but it **echoes** the existing cookie
  rather than minting, because it runs on every bootstrap and a fresh token
  there invalidates whatever an in-flight request is already carrying. The
  server can read the cookie (`req.cookies`); only browser JS cannot. Only
  `/refresh` rotates.
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
- **Frontend chrome:** a page never mounts `Navbar` or `Footer`. Public routes
  are children of `PublicLayout` in the route table and inherit both; the
  workspace and console have their own shells (`HireShell`, `AdminShell`). The
  footer was hand-mounted in `Home.tsx` alone until 2B-4, so every other route
  had none — and nobody noticed, because it contained no links.
- **Frontend navigation:** the footer's link columns and the list of public
  informational paths live in `components/shared/siteNav.ts`
  (`FOOTER_COLUMNS`, `INFO_PATHS`); the portal-scoped primary nav stays in
  `navLinksFor`. Never hand-write a link list in a component — the navbar and
  the mobile sheet both read `navLinksFor`, the footer reads `FOOTER_COLUMNS`,
  and `publicPages.test.tsx` cross-checks the route table against both, so a
  page that is mounted but unlinked (or linked but unmounted) fails a test.
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
3B (admin console), 2B-2 (seeker pages), the deploy artifacts phase and
2B-3 (recruiter workspace) are complete. The design system, its primitives and
the compositional layer are all in place; every portal's surface is built on
them, and the application is deployable.

The platform is called **Cairn**. The wordmark is one component
(`components/shared/Wordmark.tsx`) rendering the mark and the name, with a
portal suffix — bare for seekers, `Cairn / Hire` for recruiters,
`Cairn / Console` for admins. Never hand-write it: two copies is how the navbar
kept rendering an `<h1>` for a year after `AuthLayout` had settled on a
`<span>`. The mark's top stone takes `--signal`, so it recolours per portal for
free.

What Phase 5 has closed so far:

- **The matching pipeline is user-visible in both directions.** A signed-in
  seeker gets an optional `JobDto.fit` on the public list and detail routes, and
  the job card names the largest shortfall while the detail page shows all five
  weighted factors. Anonymous visitors and recruiters get no field rather than
  a fabricated `0%`
- **The five seeker inputs are writable and three-valued.** Skills, experience,
  location, salary band and remote preference round-trip through the profile
  form. Blank numeric fields clear to `null`, and an unanswered remote preference
  stays distinct from an explicit `false`
- **Applicants are ranked before pagination.** The recruiter endpoint scores the
  complete applicant set with `scoreSeekerForJob`, sorts by score with stable
  recency/id tie-breakers, and only then slices the requested page. Sorting a
  fetched page would advertise a ranking it had not performed. `ApplicantDto.fit`
  carries the recruiter-voiced breakdown; the table does not recompute it
- **Motion and atmosphere now have real consumers.** The seeker hero owns the
  contrast-bounded WebGL field, `Reveal` drives scroll arrivals through the
  tier tokens, and `AnimatedNumber` is confined behind the library capability
  check. Workspace and console remain capped and carry no atmosphere

What 2B-3 closed:

- **A recruiter could not post a remote job.** `remote` is on
  `jobCreateBodySchema`, on the Mongo model, and drives the matching pipeline's
  `remoteFit` — and no form had ever rendered a control, so every row carried
  the schema default `false` and the seeker board's Remote facet matched
  nothing, always. It is a checkbox now, posted as the string `"true"`/`"false"`
  because the schema is `z.enum([...])` *before* its transform and a raw boolean
  fails validation
- **`jobType` is an enum, and `JOB_TYPES` is the one list.** The export existed
  in `packages/shared` with **zero importers** and lowercase values, while
  `FilterCard` carried its own hardcoded title-case literal and filtered by
  exact equality — so "Full Time" was accepted, stored, rendered on the card,
  and unfilterable. Both sides import `JOB_TYPES` now, title-case because that
  is what the facet and the existing rows agree on. Switching it broke **nine**
  test fixtures across three suites; the two in `packages/shared` surfaced only
  in full CI, because that workspace has its own suite the per-file commands
  never touch
- **Deciding on an applicant updates the screen.** The old table POSTed the
  status, toasted success, and never refetched. The mutation invalidates the
  query, which falls out of the react-query pattern rather than being a separate
  repair
- **Accept and reject are reachable by keyboard.** They were `<div onClick>` —
  no role, no `tabIndex`, no focus ring. They are `DropdownMenu` items now
- **Owned jobs takes a keyword, and it is server-side.** Both list pages fetched
  `limit=50` and filtered in the browser. That survives only while nothing
  paginates: a client-side filter over a server-paginated list searches the rows
  on screen while presenting itself as searching everything. Companies keeps its
  local filter deliberately — `/company/get` returns every owned row — and its
  control says "Filter companies" rather than "Search" to keep the distinction
  visible
- **`components/admin/*` is gone.** The recruiter workspace is
  `components/workspace/*`, the admin console stays `components/console/*`, and
  the two route guards are `components/routing/*` — the console no longer
  imports from a directory named for the other portal. `CompanySetup` is
  `CompanyEdit`, which is what it does
- **Two of four redux slices stopped existing.** `companySlice` and
  `applicationSlice` lost their last readers when the workspace moved to
  react-query, and three legacy fetch hooks went with them. `persistConfig` goes
  to version 3 to discard the orphaned subtrees — which costs nothing at the
  session layer, because `auth` persists at its own key and rehydrates
  independently
- **A deleted module cannot be asserted with `expect(import(...)).rejects`.**
  Vite's import-analysis resolves even a dynamic specifier at transform time, so
  the import fails the whole file at collection rather than rejecting inside the
  test. `workspace.test.tsx` checks the filesystem and the store's key set
  instead — which is what actually matters

What 2B-4 closed:

- **The footer was reachable from exactly one route.** `Footer` was mounted by
  hand inside `Home.tsx`, so every other page in the application — the job
  board, the profile, all five auth screens — simply had no footer. It rendered
  three social icons and **zero links**, which is why nothing noticed: there was
  nothing in it to miss. `PublicLayout` (`components/layout/PublicLayout.tsx`) is
  an `<Outlet />` layout route carrying navbar and footer, and every public path
  mounts inside it. A page never mounts its own chrome again
- **`siteNav.ts` holds the footer's columns and the informational paths.**
  `FOOTER_COLUMNS` and `INFO_PATHS` live in `components/shared/siteNav.ts` — a
  plain data module, no JSX, beside the existing `navLinksFor`. Adding an
  informational page is one edit there plus one route, and
  `publicPages.test.tsx` iterates `INFO_PATHS`, so a page in the registry that
  is not mounted fails a test instead of 404ing in production
- **Cairn holds resumes and had no privacy policy.** Not a missing page — a
  missing disclosure, and the resume story is the part a candidate cannot
  discover for themselves: uploads are Cloudinary `authenticated` assets and
  every read mints a ~10-minute signed URL. `/privacy` and `/terms` say so, and
  both carry `LegalDraftNotice` — a `role="alert"` banner naming what is
  genuinely unfilled (operating entity, jurisdiction, sub-processor list). The
  behaviour they describe was written from the code and is accurate; what only
  counsel can supply is marked missing rather than invented, because fabricated
  legal text presented as final reads as a commitment nobody made
- **Contact is a `mailto:`, deliberately.** A form needs an endpoint — schema,
  rate limit, honeypot, `escapeHtml` into the mail body — and a form that POSTs
  nowhere is the dead control the guardrail forbids. The address is
  `SUPPORT_EMAIL` in `src/lib/contact.ts` so no page hand-writes a second
  mailbox. The interactive version ships with its endpoint, not before
- **`/help` answers what does *not* exist.** It states outright that withdrawing
  an application and editing a posted job are not built yet, and that recruiters
  wait for admin approval. An omitted answer reads as "it probably works", which
  is how a support inbox fills up with questions the FAQ was supposed to absorb.
  It is a `<dl>`, not an accordion — five short answers collapsed cost a click
  each to hide nothing worth hiding
- **External links must carry `rel="noopener noreferrer"`.**
  `publicPages.test.tsx` walks every footer anchor whose `href` starts with
  `http` and asserts both tokens. It passes vacuously today — the footer has no
  external links since the social icons went — so it is a guard for the next one
  added, not evidence of a fix. The same test asserts no link points at a
  social platform *homepage*: `https://twitter.com` with no handle is a link to
  somebody else's front page, which is what the placeholder icons were

What the first live deployment closed:

- **Every write in the deployed app answered 403, and it presented as the
  session logging itself out.** `readCsrfToken()` matched `__Host-jp_csrf` out of
  `document.cookie`. Cross-site — web on Vercel, API on Render — the browser
  stores and sends that cookie but withholds it from `document.cookie` despite
  `httpOnly: false`; measured in a real browser, three cookies stored and
  `document.cookie` empty. So no `X-CSRF-Token` was ever attached. Reads worked
  for the 15 minutes an access token lives, then `/refresh` (a POST) 403'd, and
  `apiClient` recovers only 401 — the session died with no route back. The token
  now travels in the response body of `/login`, `/verify-email`, `/refresh` and
  `/me` and lives in memory. `/me` carries one because a reload and the Google
  callback's top-level redirect both start empty
- **The suite could not have caught it.** jsdom has no site boundaries, so it
  returns whatever was assigned to `document.cookie`; a test that seeded the
  cookie and asserted the header would have passed throughout the outage.
  `frontend/tests/csrfToken.test.ts` asserts the mechanism instead — the header
  is present *with an empty cookie jar* — and
  `backend/tests/auth/csrfDelivery.test.ts` asserts the body carries a token that
  actually verifies, and that `/refresh` returns the **rotated** one rather than
  the token it was called with

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
  Its deploy steps use a **deploy hook, never a CLI token** — a hook is scoped to
  one project and branch, a `VERCEL_TOKEN` acts on the whole account — but they
  are inert while auto-deploy is on, and were inert before it for want of the
  secrets. See the Known gaps entry
- **`secrets: inherit` on the calling job is load-bearing.** A reusable workflow
  sees none of the caller's secrets without it, and both deploy steps skip
  quietly by design — so the omission looks exactly like success. It did, for a
  phase and a half
- **`VITE_API_URL` is required to *build*, and its absence fails as success
  twice over.** The value is inlined as a literal, so unset it lets Rolldown
  prove `apiClient.ts`'s import-time throw always fires, treat the rest as
  unreachable, and tree-shake the entire application away: exit 0, a well-formed
  275 kB bundle against a real 874 kB, correct hashed filename, zero routes,
  blank page, clean console. It also killed ten web suites at collection — green
  locally for a week, because `.env.local` is gitignored and every developer had
  one. Three guards now: `vite.config.js` refuses the build, `vitest.config.ts`
  supplies the suite's own value via `test.env` (never read `.env.local` from a
  test), and `cd.yml` greps the built bundle for route literals — the old check
  looked for a hashed chunk name, which the hollow bundle has

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
- `getApplicants` returns `ApplicantDto` — the established contact/profile
  projection, a short-lived resume link, and the derived fit breakdown for the
  owned job. It never returns the seeker document or raw fit-input fields
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
- `jobType` is title-case rather than a lowercase slug with a display mapping.
  Slugs are the better data shape, but adopting them means rewriting every
  stored `jobType`, and the pre-2B-3 rows are free text — guesswork. The enum
  gates new posts only, so rows posted before it may still be unfilterable
- Applicant search. The list paginates but has no keyword; applicant search is a
  new capability rather than a port of an existing one
- The application status vocabulary is still two-outcome.
  `APPLICATION_STATUSES` defines seven values and
  `applicationStatusBodySchema` accepts two
- `WorkspaceCompanies` filters in the browser. That is correct only while
  `GET /company/get` returns every owned row unpaginated — the day it paginates,
  the filter must move to the server the same day, or it silently searches one
  page while presenting itself as searching everything. See `useOwnedJobs` for
  the shape it would take
- `/profile` is not behind `ProtectedRoute`, so an anonymous visitor reaches a
  page whose two requests both 401 and which then renders its own empty state.
  Harmless — the API refuses correctly and no data leaks — but it should
  redirect to `/login` instead. Belongs with the seeker session work
- `packages/shared/src/legacy-dto.ts` is vestigial. 1C replaced the endpoints it
  described with projected DTOs, and nothing imports the `Legacy*` types any
  more
- **CD does not gate deploys, and since 2026-08-11 does not trigger them
  either.** Both hosts deploy on push (`autoDeploy: true`, Vercel's Git
  integration at its default), so `cd.yml` runs *beside* the hosts' builds
  rather than in front of them: a push that fails the suite has already reached
  users. The gate it was designed to be never operated — `autoDeploy: false`
  shipped but the two hook secrets did not, so both deploy steps skipped with a
  `::notice::` on every run and every deploy was a manual dashboard click.
  Restoring the gate means adding the secrets **and** setting `autoDeploy:
  false`, in one change; doing the second alone returns to no automatic deploys
  at all. `deployConfig.test.ts` asserts whichever value is current. See the
  amendment in `docs/adr/0007-deploy-topology.md`

See `docs/superpowers/plans/2026-08-04-phase-1c-authorization-domain.md`,
`docs/superpowers/plans/2026-08-05-phase-2a-ink-signal-foundation.md`,
`docs/superpowers/plans/2026-08-05-phase-2b-design-language-auth.md`,
`docs/superpowers/plans/2026-08-06-phase-3a-three-portal-foundation.md`,
`docs/superpowers/plans/2026-08-10-deploy-artifacts.md` and
`docs/superpowers/plans/2026-08-10-phase-2b-3-recruiter-workspace.md`.
