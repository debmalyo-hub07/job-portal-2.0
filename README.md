# Cairn

A job portal for the Indian market — job seekers find and apply to roles,
recruiters post them and manage applicants. Built with security and access
control as the starting point rather than an afterthought.

A cairn is a stack of stones one traveller leaves to mark the path for the next.

> **Status:** Phases 1A (foundation), 1B (authentication), 1C (authorization),
> 2A (design system), 2B-1 (design language and portal-split auth), 3A
> (three-portal foundation), 4A/4B (faceted job search), 3B (admin console),
> 2B-2 (seeker pages), 2B-3 (recruiter workspace) and 2B-4 (navigation and
> informational surfaces) are complete. Ownership checks are in place on every
> route touching a user-owned resource, recruiter approval has a UI rather than
> needing curl, both the seeker board and the recruiter workspace are faceted,
> paginated and built on the design system, and the site has a footer that
> links it plus public about, contact, help, privacy and terms pages. Seeker job
> cards now explain their profile fit, and recruiter applicant lists are ranked
> by the reverse score before pagination. See
> [Roadmap](#roadmap).

## Tech stack

| Layer | Choice |
|---|---|
| API | Node 22/24, Express 5, TypeScript, Mongoose 8 |
| Database | MongoDB (Atlas) |
| Web | React 19, Vite 8, TypeScript, Redux Toolkit, TanStack Query, Tailwind 4, Radix primitives |
| Design | "Triad on Bone" token system — CSS custom properties via `@theme inline`, 60/30/10 bands, 120° portal triad, dark mode, self-hosted Fraunces/Geist |
| Validation | Zod 4, shared between client and server |
| Email | Brevo (transactional) |
| Media | Cloudinary |
| Testing | Vitest — Supertest + `mongodb-memory-server` on the API, React Testing Library + jsdom on the web, Playwright for the visual and contrast passes |
| Logging | Pino |

## Quick start

### Prerequisites

- **Node 22.22+ or 24.15+** — jsdom 30 and the undici 8 it pulls in read
  `markAsUncloneable` from `node:worker_threads` unguarded, so the web test
  suite cannot even import on older releases. Node 20 is EOL as of April 2026
- npm 10+
- A MongoDB database — [Atlas](https://www.mongodb.com/atlas) free tier is fine

### Setup

```bash
git clone https://github.com/debmalyo-hub07/job-portal-2.0.git
cd job-portal-2.0
npm install          # workspace root only — installs all three packages
cp .env.example backend/.env
```

Fill in `backend/.env` (see [Environment](#environment) below), then run the
two apps in separate terminals:

```bash
npm run dev:api      # http://localhost:8000
npm run dev:web      # http://localhost:5173
```

Verify the API is healthy:

```bash
curl http://localhost:8000/health
# {"status":"ok","uptime":1.23,"db":"connected"}
```

If a variable is missing or malformed, the API refuses to start and names it
exactly — it will not boot with a broken config.

### Create the first admin

Recruiters register as `pending` and cannot post a job until an admin approves
them, so a fresh database needs one admin before the recruiter flow works end to
end. There is no self-service admin registration — the admin router mounts no
`/register`:

```bash
npm run seed:admin --workspace @jobportal/api -- \
  --email you@example.com --name "Your Name"
```

No password is accepted as an argument — a CLI argument lands in shell history,
process listings and CI logs. The account is created without one and a
set-password code is mailed, the same path forgot-password uses; redeem it at
`/admin/set-password` and sign in at `/admin/login`. The script refuses if an admin already exists, so a
stray re-run during deployment cannot quietly mint a second authority (`--force`
overrides).

Later admins are invited from the admin dashboard by an existing admin. The
server requires that admin's authenticated cookie, the matching admin CSRF
token, and `ADMIN_PROVISIONING_SECRET`; the canonical secret belongs only in the
API environment and must never be added to a `VITE_*` variable or browser
bundle. The invite is rate-limited, the request field is redacted from logs,
and the new admin receives a short-lived password setup code rather than a
password chosen by the inviter.

The invite email links to `/admin/set-password` with the address prefilled. The
code is deliberately **not** in that link: a URL that authenticated on click
would be a magic link into the highest-privilege portal, and links leak through
mail scanners, referrer headers and browser history in a way a typed code does
not. The link opens the form; the code is still entered by hand.

On a database that predates Phase 3A, run
`npm run migrate:phase3a --workspace @jobportal/api` once as well: it
grandfathers existing **verified** recruiters to `active`, so the migration does
not lock out people who were already working. An unverified pre-existing row is
left `pending` — it never completed registration, so it has no claim to be
grandfathered.

### Seed an empty demo marketplace

An empty database can be given a realistic, clearly labelled catalogue:

```bash
npm run seed:catalog --workspace @jobportal/api -- --confirm-database jobportal
```

Replace `jobportal` with the exact database name in `MONGO_URI` — for local work
that is `jobportal_dev`, never the deployed one. The explicit confirmation
prevents a typo from targeting MongoDB's implicit `test` database. The script
creates 27 companies and 198 roles under a synthetic recruiter that has no
password or Google identity: nine global product companies and IT majors, nine
Indian IT services firms, and nine consumer-internet, fintech and SaaS
companies, spanning engineering, data, product, design, consulting, sales,
marketing, finance, HR, operations, customer service, and legal. Each employer
posts a curated role set of its own rather than one list repeated across the
roster.

The roster lives in `packages/shared/src/catalogue.ts` and is the single source
for the seed, the board's company facet, and the landing search suggestions —
the facet matches employer names by exact equality, so a name that drifts
between those three returns an empty board rather than an error. The seed is
idempotent, upgrades the original three-company preview, reconciles away
listings the catalogue no longer describes, and refuses to add seeded jobs to a
catalog that already holds real ones unless `--allow-nonempty` is supplied
deliberately.

Each company mark is stored as a path (`/images/companies/<company>.png|svg`),
not an absolute URL, so it resolves against whatever origin serves the page and
works in development and production from one seeded value. They are files in
`frontend/public/`, so in production the logos appear once the frontend deploys.
Recruiter-uploaded logos stay absolute — those genuinely live on Cloudinary.

## Environment

| Variable | How to obtain |
|---|---|
| `MONGO_URI` | Atlas → Create free M0 cluster → Database Access → add user → Network Access → allowlist your IP → Connect → Drivers. **Include a database name in the path** — `jobportal_dev` locally, and never the one a deployment uses. Production refuses to boot without one; development otherwise writes to a database called `test`. |
| `JWT_ACCESS_SECRET` | `openssl rand -base64 48`. Minimum 32 characters. |
| `JWT_REFRESH_PEPPER` | `openssl rand -base64 48`. Must differ from the above. |
| `OTP_PEPPER` | `openssl rand -base64 48`. Must differ from the other four. |
| `CSRF_SECRET` | `openssl rand -base64 48`. Must differ from the other four. |
| `ADMIN_PROVISIONING_SECRET` | `openssl rand -base64 48`. Required for an existing admin to invite another admin; must differ from the other four. |
| `CLIENT_URLS` | Comma-separated browser origins allowed by CORS. Local: `http://localhost:5173` |
| `API_BASE_URL` | Public origin of this API. The two Google redirect URIs are derived from it. Local: `http://localhost:8000` |
| `WEB_BASE_URL` | Public origin of the frontend. Local: `http://localhost:5173` |
| `COOKIE_SAMESITE` | `strict` when API and web share a domain, `none` when they do not (requires HTTPS). |
| `CLOUDINARY_*` | Cloudinary → Dashboard → Product Environment Credentials |
| `BREVO_API_KEY` | Brevo → SMTP & API → API Keys → Create a new API key |
| `BREVO_SENDER_EMAIL` | A sender address verified in Brevo |
| `GOOGLE_CLIENT_ID` / `_SECRET` | Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID → Web application |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile widget secret. Server-only and required in production. |

The redirect URI is not configured directly. Both are derived from `API_BASE_URL`
— `<API_BASE_URL>/api/v1/seeker/auth/google/callback` and the `recruiter`
equivalent — and **both** must be registered on that OAuth client. Google matches
`redirect_uri` byte-for-byte, so a mismatch fails at consent time, not at boot.

`.env` is never committed. Only `.env.example` is tracked.

## Layout

```
backend/                Express API
  src/
    config/             env parsing, database connection
    controllers/        HTTP handling
    middleware/         requestId, security, rateLimit, auth, csrf, error, notFound
    models/             Mongoose schemas
    routes/             route definitions
    services/           business rules — the only layer touching models
    lib/                AppError, logger, crypto primitives, mailer, rate-limit store
    scripts/            one-off migrations
    app.ts              buildApp() — wired app, does not listen
    server.ts           listen, sweeper, graceful shutdown
  tests/
frontend/               React client
  src/
    components/
      auth/             login, signup, OAuth/OTP surfaces, AuthLayout, PortalPanel
      layout/           PageShell, PageHeader, EmptyState, FormField
      theme/            ThemeProvider, ThemeToggle, PortalScope
      ui/               21 primitives on design tokens, incl. PasswordInput
      admin/            recruiter workspace
      shared/           Navbar
      design/           DEV-only token gallery at /_design
    pages/              HireLanding
    routes/             buildAuthRoutes — one auth component set, mounted per portal
    hooks/              data fetching, auth bootstrap
    lib/                api client, portal hint, error readers, motion composables
    redux/              store and slices
    index.css           the entire token system
  tests/                Vitest + Testing Library specs
    helpers/            renderRoute — real providers, non-persisted store
    visual/             Playwright contrast audit and screenshot pass
packages/
  shared/               Zod schemas and types used by both apps
docs/
  adr/                  architecture decision records
  superpowers/          design specs and implementation plans
```

The API and web app remain fully independent processes and deploy separately.
The workspace root exists so both can share `packages/shared` — which makes a
client/server contract mismatch a compile error rather than a runtime surprise.

## Local configuration

Copy `frontend/.env.example` to `frontend/.env.local`:

```
VITE_API_URL=http://localhost:8000/api/v1
```

**Save it as plain UTF-8 with no byte-order mark.** A BOM becomes part of the
first key name, so Vite parses `<BOM>VITE_API_URL` and `import.meta.env.VITE_API_URL`
reads `undefined`. On Windows, PowerShell's `>` and `Set-Content` both write a
BOM by default — use `-Encoding utf8NoBOM`. `apiClient.ts` throws at import when
the variable is missing rather than letting axios default `baseURL` to the page
origin, where the dev server answers `index.html` with a 200 and the app appears
online while every call silently fails. `frontend/tests/envFiles.test.ts` fails
if either `.env.example` regains a BOM.

**`VITE_API_URL` is a build-time requirement, not only a runtime one.** The
value is inlined as a literal, so with it unset Rolldown proves that
import-time throw always fires, treats everything downstream as unreachable, and
tree-shakes the whole application away. That build *succeeds* — a well-formed
275 kB bundle against a real 874 kB, correct hashed filename, no route and no
page in it, serving a blank screen with a clean console. `vite.config.js`
refuses to produce it, and `cd.yml` greps the built bundle for route literals so
the artifact is checked as well as the process. Set the variable in the host's
environment before the first deploy.

The test suite supplies its own value through `test.env` in
`frontend/vitest.config.ts` and never reads `.env.local` — that file is
gitignored, so a suite depending on it passes for whoever wrote it and fails on
every fresh checkout.

Backend config lives in `backend/.env` (copy `backend/.env.example`). Two
optional logging variables:

| Variable | Values | Effect |
|---|---|---|
| `LOG_LEVEL` | pino levels | Defaults to `info` in production, `debug` in development, forced to `silent` under `NODE_ENV=test`. At `debug`, request lines also carry the query string and the authenticated `{id, portal}`. |
| `LOG_HTTP` | `summary` \| `all` \| `off` | `summary` (default) logs one line per request and skips `/health`; `all` includes it; `off` disables request logging. |

Request lines carry the same correlation id as the error envelope, so a client
error and a server log can be joined. Bodies, cookies and headers are never
logged at any level.

In development the log is pretty-printed and stamped in **the machine's own
timezone**, so a line lines up with the request you just made. Production emits
JSON with `time` as epoch millis instead — sortable across hosts, and what a log
aggregator expects. Lines appear about 300ms after the response: pino's pretty
transport runs in a worker thread, so a line that has not shown up yet is not
evidence the request went unlogged.

## Authentication

Every endpoint below exists once per portal — `/api/v1/seeker/auth/...`,
`/api/v1/recruiter/auth/...` and `/api/v1/admin/auth/...` — from the same router
mounted with a different portal literal.

The admin mount omits `/register` and both `/google` routes: there is no
self-service admin registration, so the routes do not exist rather than being
guarded. See [Create the first admin](#create-the-first-admin).

| Method | Path | Purpose |
|---|---|---|
| POST | `/register` | Create an account. Issues **no session**; sends a code |
| POST | `/verify-email` | Redeem the code. This is what issues the first session |
| POST | `/resend-code` | New verification code, 3/hour/portal+email |
| POST | `/login` | Password login |
| POST | `/logout` | Revoke this session's refresh family and clear cookies |
| POST | `/refresh` | Rotate the refresh token and mint a new access token |
| POST | `/forgot-password` | Send a reset code. Answers identically whether or not the address exists |
| POST | `/reset-password` | Redeem the reset code and set a new password |
| GET | `/me` | The current `SessionUser` |
| GET | `/google` | Start the OAuth flow (top-level redirect, not XHR) |
| GET | `/google/callback` | OAuth return; redirects into the web app |
| POST | `/google/confirm-link` | Confirm linking Google to an existing password account |

**The same email address may hold one seeker account and one recruiter
account.** They are separate rows in separate collections with separate
passwords, and signing into one grants nothing on the other. This is the single
most surprising behaviour for a new reader, and it is deliberate — see
[ADR-0001](docs/adr/0001-two-account-collections.md), extended to a third
collection for admins in
[ADR-0006](docs/adr/0006-three-account-collections.md).

The same browser may also hold seeker, recruiter, and admin sessions at once.
Access, refresh, and CSRF cookies are named per portal
(`jp_<portal>_at`, `jp_<portal>_rt`, `jp_<portal>_csrf`, with `__Host-` in
production), and the web client keeps a separate cached user, bootstrap flag,
CSRF token, and refresh promise for each portal. Signing in or out of one portal
does not overwrite another portal's session. See
[ADR-0008](docs/adr/0008-portal-scoped-browser-sessions.md).

### Recruiters need approval

A recruiter registers as `pending` and can sign in, but every recruiter-owned
mutation — posting a job, creating or editing a company, reading or deciding on
applicants — answers **403 `RECRUITER_PENDING_APPROVAL`** until an admin
approves the account. Signing in is deliberately allowed while pending: it is
what lets them reach `/me` and be told why they are blocked rather than
bouncing off a login that refuses them for no stated reason.

Google sign-in may sign in an existing recruiter but never creates one, so
registration is the only way a recruiter account can begin — and therefore the
only state it can begin in is `pending`.

## Web app

### Three front doors

The portal is a **route literal** on the client exactly as it is on the server.
One auth component set is mounted three times by `buildAuthRoutes(portal, prefix)`,
mirroring the API's `buildAuthRouter(portal)`:

| Route | Portal | Notes |
|---|---|---|
| `/` | seeker | Marketing landing: hero search, role shortcuts, latest openings |
| `/jobs` | seeker | The job board. Every filter lives in the URL, so a search is a shareable link |
| `/description/:id`, `/profile` | seeker | Job detail is public; the profile requires a seeker session |
| `/login`, `/signup` | seeker | |
| `/hire` | recruiter | Employer landing page. Redirects to the workspace only when a recruiter session is active |
| `/hire/login`, `/hire/signup` | recruiter | |
| `/hire/companies`, `/hire/jobs`, applicants | recruiter | The workspace. Gated on admin approval |
| `/admin` | admin | Protected session door: dashboard with an admin session, otherwise admin sign-in |
| `/admin/login` | admin | Internal console login. No signup route - admins are seeded, then invited by an admin |
| `/admin/set-password` | admin | Where a seeded or invited admin redeems their setup code. Reached from the emailed link |
| `/verify-email`, `/forgot-password`, `/reset-password`, OAuth landings | either | Portal-neutral, carried in `?portal=` because the Google callback redirects here |

The workspace lived under `/admin/*` before Phase 3A. Those URLs redirect to
their `/hire` equivalent, parameters and query intact.

Public visitors can browse the landing page, job board, and job details. An
anonymous Apply action navigates to `/login` and preserves the job detail URL so
successful seeker authentication can return there; the API still independently
requires a seeker-signed session before creating an application. A seeker
session does not block `/hire/signup`, because one person may later create a
separate recruiter account.

`/browse` was a second, weaker job board until Phase 2B-2 — keyword-only, with
no facets, pagination or loading state — and it was where the hero search and
every category chip sent you, so the faceted board was reachable only by
clicking "Jobs". It now redirects to `/jobs` carrying the query, since `/jobs`
reads `keyword` from the URL as its own state.

There is no control anywhere that picks a portal. `PortalScope` derives it from
`useLocation().pathname` and nothing else — never a body, query or cookie —
matching on a segment boundary so `/hired` and `/administrator` stay seeker
paths. A `?portal=` query cannot move it.

### One roster behind the search box and the sidebar

The hero and the board share a `JobSearchCombobox`, and its suggestions —
employers, cities, departments — are **derived** from
`packages/shared/src/catalogue.ts` rather than typed out, as is the board's
company facet. That is not tidiness. `?company=` is matched against the employer
name exactly, anchored and case-insensitively, so a hand-written name that drifts
from the seeded spelling does not error: it returns an empty board. The same is
true of `location`, which is why every seeded employer sits in one of the eight
cities the facet offers and both Gurugram and Noida are written "Delhi NCR".
Tests pin the sidebar's employers to the suggestion list, and every suggested
role and skill to something a listing actually asks for.

Two traps live in that combobox. Its input is a `PopoverAnchor`, not a
`PopoverTrigger` — and `triggerRef` is the only element Radix exempts from the
outside-interaction check that dismisses the list. Opening on focus therefore
armed a layer that caught the very `focusin` that opened it, read the input as
outside itself, and closed again: one frame of suggestions on every click, on
both pages. `onInteractOutside` now exempts the anchor by hand. The second trap
is why that shipped at all — `fireEvent.focus` dispatches a React-synthetic
event that never reaches `document`, so the test that focused the input and found
the listbox passed throughout. Reproducing it needs a real bubbling `focusin`.

The company facet opens on eight of the twenty-seven employers with a toggle for
the rest, because the full list is an 800px wall in a rail that also carries
location, type and department. A checked employer is always rendered even when
collapsed — the facet is driven by the URL, so a shared link filtered to Zensar
has to show that box ticked rather than hide the filter it applied.

### Design system — "Triad on Bone"

Every colour, radius, type size and motion duration is a CSS custom property in
`frontend/src/index.css`, mapped into Tailwind 4 through `@theme inline`. No
component sets a colour directly, and none branches on the theme — the tokens
flip themselves, so a `dark:` colour override in a component is a bug.

The palette is organised by the 60/30/10 rule — ground, structure, accent — on a
warm bone house hue, and the accent is portal-scoped: `data-portal` on the tree
re-resolves it to one of three hues sitting exactly 120° apart on the OKLCH wheel
(seeker 200°, recruiter 80°, admin 320°), an Adobe-style triad computed in a
perceptually uniform space. Spacing works the same way — `data-density` on
`PageShell` resolves `--space-*`, so pages pass a `density` prop rather than
hand-tuning padding. See [ARCHITECTURE.md](ARCHITECTURE.md#triad-on-bone) for the
token bands and the four distinctions that carry the weight.

`npm run lint:colour` enforces the system in CI: 440 pairings across all six
theme×portal scopes against the WCAG 4.5:1 text and 3:1 UI floors, plus sRGB
gamut, the 120° triad, and dead colour classes. It parses `index.css` in pure
Node and holds no palette of its own. `frontend/tests/visual/contrast.mjs` remains
as a runtime cross-check through a real browser; it needs a dev server, so it is
not part of `npm run ci`.

In development, `/_design` renders every primitive across both themes × all three
portals, plus the token bands and interaction ramps. It is DEV-only via
`import.meta.env.DEV` + `React.lazy`, so Rollup drops it from production builds.

## Scripts

| Command | Effect |
|---|---|
| `npm run dev:api` | API in watch mode via tsx |
| `npm run dev:web` | Vite dev server (use `--port 5173 --strictPort`; CORS is pinned to it) |
| `npm run build` | Build all workspaces |
| `npm test` | Test all workspaces |
| `npm run typecheck` | Typecheck all workspaces |
| `npm run lint` | Lint all workspaces |
| `npm run ci` | Everything CI runs, in order. Takes over two minutes |
| `npm run audit:prod` | Audit production dependencies only |
| `npm run check:mail` | Authenticate with Brevo and verify the configured sender without sending an email |
| `npm run lint:colour --workspace @jobportal/web` | Fail on any colour outside the token system |
| `npm run test:visual --workspace @jobportal/web` | Playwright screenshots + portal assertions, needs a dev server |
| `npm run migrate:phase1c --workspace @jobportal/api` | Drop the legacy `users` collection. Run once per existing database |
| `npm run seed:admin --workspace @jobportal/api` | Create the first admin: `-- --email <address> --name "<name>"`. Mails a set-password code redeemable at `/admin/set-password`; refuses if an admin exists |
| `npm run seed:catalog --workspace @jobportal/api` | Populate an empty marketplace with labelled demo companies/jobs. Requires `-- --confirm-database <name>`; idempotent and refuses a non-demo catalog by default |
| `npm run migrate:phase3a --workspace @jobportal/api` | Grandfather existing recruiters to `active`. Run once per existing database |

## Deployment

Both apps deploy independently from this monorepo. Build commands run from the
repository root so npm can resolve the workspace symlink, and
`@jobportal/shared` must be built before either app.

**Setting it up for the first time:
[`docs/deployment-runbook.md`](docs/deployment-runbook.md)** — the ordered
walkthrough, including the three circular URL values and the two settings that
fail silently at their defaults. The rest of this section is reference.

**API — Render.** [`render.yaml`](render.yaml) is a blueprint: point Render at
this repository and it reads the build command, start command, health check,
instance count and the full list of required variables from that file. Every
operator-supplied value is `sync: false`, so Render prompts for it and the
repository never carries a secret. `NODE_ENV=production` and
`COOKIE_SAMESITE=none` are pinned as reviewed literals; see
[ADR-0007](docs/adr/0007-deploy-topology.md) for why `NODE_ENV=production` and
`numInstances: 1` are not cosmetic.

**Web — Vercel.** Root directory `frontend`, output `dist`, and two public build
variables:

```
Build:  npm ci && npm run build -w @jobportal/shared && npm run build -w @jobportal/web
Output: dist
Env:    VITE_API_URL=https://<your-api-host>/api/v1
        VITE_TURNSTILE_SITE_KEY=<Cloudflare public site key>
```

### The SPA fallback is not optional

The client routes on the client, so a static host must serve `index.html` for
any path it cannot resolve to a file. Without that rule only `/` works: every
deep link, refresh and bookmark 404s, and in-app navigation still works — which
makes it easy to miss until someone shares a link.

Both files ship, so any of the three named hosts works out of the box:

| Host | File | Rule |
|---|---|---|
| Vercel | `frontend/vercel.json` | `/(.*)` → `/index.html` |
| Netlify, Cloudflare Pages | `frontend/public/_redirects` | `/* /index.html 200` |

The status is **200, not 302**. The router reads the original path off
`window.location`, so a redirect rewrites the URL and loses the route.

### Continuous delivery

**Both hosts deploy on push.** `render.yaml` sets `autoDeploy: true` and
Vercel's Git integration is left at its default, so pushing to `main` deploys.

`.github/workflows/cd.yml` runs after both CI jobs pass on `main`. It builds
both apps, boots the real `backend/dist/server.js` against a `mongo:7` service
container and asserts `/health` reports `status: ok` and `db: connected`, then
inspects the web bundle. It is an **artifact check, not a gate** — it runs in
parallel with the hosts' own builds, so a push that fails it has already
deployed. It will also trigger deploys itself if the two hook secrets below are
set, which is redundant while auto-deploy is on.

That trade is deliberate (changed 2026-08-11). The original design gated
deploys behind CI, with `autoDeploy: false` and `cd.yml` POSTing a deploy hook
once the suite passed — but the hook secrets were never added, so `cd.yml`
skipped both deploy steps with a `::notice::` on every run and every deploy was
manual. Restoring the gate means doing both halves at once: add the secrets
**and** set `autoDeploy: false`.

| Secret | Where to get it |
|---|---|
| `RENDER_DEPLOY_HOOK_URL` | Render → service → Settings → Deploy Hook |
| `VERCEL_DEPLOY_HOOK_URL` | Vercel → project → Settings → Git → Deploy Hooks |

Hook URLs rather than API tokens on purpose: a hook can deploy one project from
one branch, while a `VERCEL_TOKEN` can act on every project in the account.

A missing secret **skips that deploy with a note in the run log** rather than
failing the build — a red check for a deploy nobody configured teaches everyone
to ignore red checks. The cost of that choice is on the record above: a skip is
indistinguishable from success unless you read the log.

### Cookies and where you host the two apps

`COOKIE_SAMESITE` defaults to `strict`, and SameSite compares *sites*
(registrable domains), not origins. The distinction decides whether your deploy
works, and getting it wrong produces a login that succeeds and a next request
that is anonymous — with no error anywhere.

| Setup | Same site? | What to do |
|---|---|---|
| Both behind one proxy on one origin | Yes | Nothing |
| `app.example.com` → `api.example.com` | Yes — different origin, same site | Nothing. Cookies are sent under `strict`; just allowlist the exact origin in `CLIENT_URLS` |
| `app.vercel.app` → `api.onrender.com` | **No** | Set `COOKIE_SAMESITE=none`, and serve both over HTTPS |

Only the third case needs the variable. Setting `none` when you did not need it
weakens CSRF defence in depth for no benefit; leaving it `strict` when you did
need it withholds every session cookie.

`__Host-` prefixed cookies work in all three cases: the prefix forbids a
`Domain` attribute, so each origin sets its own cookie rather than one cookie
spanning both. All three session-cookie families, including CSRF, are
portal-scoped so concurrent seeker, recruiter, and admin sessions do not
overwrite one another. See [ADR-0005](docs/adr/0005-cookie-sessions.md) and
[ADR-0008](docs/adr/0008-portal-scoped-browser-sessions.md).

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1A | Monorepo, TypeScript, config validation, error handling, logging, security middleware, CI, docs | Complete |
| 1B | Two-collection accounts, Argon2id, Brevo OTP verification, Google OAuth, refresh-token rotation | Complete |
| 1C | Ownership-based authorization, response DTOs, pagination, private resume storage, migration | Complete |
| 2A | "Ink & Signal" design system: tokens, dark mode, portal-scoped accent, 20 primitives | Complete |
| 2B-1 | Frontend test runner, layout primitives, density, portal-split auth, `/hire` landing, landing rebuild | Complete |
| 3A | Three portals, admin collection, recruiter approval gate, `seed:admin`, workspace moved to `/hire/*` | Complete |
| 4A/4B | Faceted job search on a compound index, URL-driven filters, react-query | Complete |
| 3B | Admin console: dashboard, approvals queue, deny action, job/company moderation | Complete |
| 2B-2 | Seeker pages: one faceted job board, pagination, profile | Complete |
| Deploy | SPA fallback, not-found route, Render blueprint, CD on green main | Complete |
| 2B-3 | Recruiter workspace: companies, jobs, applicants, remote + jobType fixes | Complete |
| 2B-4 | Navigation and informational surfaces: about, contact, help, legal | Complete |
| Auth fixes | `/hire` landing restored as a public page, admin door controls, password reveal on every form, Google mark + pending state | Complete |
| 3 | Application status pipeline: seven stages, candidate timeline, withdraw, status emails | Complete |
| 3 | Job lifecycle: edit a posting, close a filled role, delete an unapplied one | Complete |
| 3 | Saved jobs | Planned |
| 4 | Recruiter dashboard: applicant pipeline, bulk actions, analytics | Planned |

Recruiter approval is now end to end. Sign in at `/admin/login` with an account
from `npm run seed:admin` and the queue is at `/admin/recruiters`; denial
requires a reason and emails it. Moderation lists live under `/admin/review/*`
— not `/admin/jobs`, which still redirects a pre-3A recruiter bookmark to
`/hire/jobs`.

The public informational surfaces are live: `/about`, `/contact`, `/help`,
`/privacy` and `/terms`. They mount inside a `PublicLayout` that also carries
the navbar and footer, which replaced the hand-mounted copies that left the
footer reachable only from the landing page. Contact is a mailto for now — the
form ships with its endpoint. The legal pages carry a draft notice pending
counsel; a public companies directory and a contact form are the next
candidates for a phase.

Durable architectural decisions live in `docs/adr/`. Keep implementation
planning in issues or pull requests rather than adding repository plan archives.

## Security

Please read [SECURITY.md](SECURITY.md) before deploying. It documents the threat
model, the authentication design, and a credential-rotation runbook.

Phase 1C closed the authorization gap: every route touching a user-owned
resource now resolves it by a predicate that includes the caller, and a resource
you do not own answers exactly as a missing one does. The remaining known issues
are listed in SECURITY.md under "Not yet fixed" — none is an access-control
defect, but read them before pointing this at real user data.

### Security boundary summary

- The browser never receives `MONGO_URI`, database credentials, or server secrets.
  MongoDB has no safe browser-facing "public database key"; all database access
  stays behind the API.
- MongoDB does not implement SQL-style row-level security. The service layer is
  the equivalent boundary: private queries include the authenticated owner (or
  the job owner transitively), and foreign records return the same 404 as missing
  records. Configure an Atlas database user with only the target database role.
- Passwords use Argon2id; legacy bcrypt hashes are upgraded after login. OTPs and
  refresh tokens are peppered or hashed before storage. Email and phone fields are
  still application-readable for login and recruiter workflows; database
  encryption at rest and encrypted backups must be enabled and verified in Atlas.
- Production rejects plaintext API URLs, uses secure `httpOnly` session cookies,
  CSRF checks on cookie-authenticated mutations, Cloudflare Turnstile on account
  entry points, strict input schemas, content-sniffed uploads, and a production
  dependency audit.

## Licence

ISC
