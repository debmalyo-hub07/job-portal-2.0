# Job Portal

A job portal for the Indian market — job seekers find and apply to roles,
recruiters post them and manage applicants. Built with security and access
control as the starting point rather than an afterthought.

> **Status:** Phases 1A (foundation), 1B (authentication), 1C (authorization),
> 2A (design system), 2B-1 (design language and portal-split auth), 3A
> (three-portal foundation), 4A/4B (faceted job search), 3B (admin console) and
> 2B-2 (seeker pages) are complete. Ownership checks are in place on every route
> touching a user-owned resource, recruiter approval has a UI rather than
> needing curl, and the seeker surface is one faceted, paginated job board. The
> recruiter workspace is still the inherited UI and is next. See
> [Roadmap](#roadmap).

## Tech stack

| Layer | Choice |
|---|---|
| API | Node 22/24, Express 5, TypeScript, Mongoose 8 |
| Database | MongoDB (Atlas) |
| Web | React 19, Vite 8, TypeScript, Redux Toolkit, TanStack Query, Tailwind 4, Radix primitives |
| Design | "Ink & Signal" token system — CSS custom properties via `@theme inline`, portal-scoped accent, dark mode, self-hosted Fraunces/Geist |
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
set-password code is mailed, the same path forgot-password uses; redeem it and
sign in at `/admin/login`. The script refuses if an admin already exists, so a
stray re-run during deployment cannot quietly mint a second authority (`--force`
overrides).

Later admins are created by an existing admin. On a database that predates Phase
3A, run `npm run migrate:phase3a --workspace @jobportal/api` once as well: it
grandfathers existing **verified** recruiters to `active`, so the migration does
not lock out people who were already working. An unverified pre-existing row is
left `pending` — it never completed registration, so it has no claim to be
grandfathered.

## Environment

| Variable | How to obtain |
|---|---|
| `MONGO_URI` | Atlas → Create free M0 cluster → Database Access → add user → Network Access → allowlist your IP → Connect → Drivers. **Include a database name in the path**, or Mongoose silently uses one called `test`. |
| `JWT_ACCESS_SECRET` | `openssl rand -base64 48`. Minimum 32 characters. |
| `JWT_REFRESH_PEPPER` | `openssl rand -base64 48`. Must differ from the above. |
| `OTP_PEPPER` | `openssl rand -base64 48`. Must differ from the other three. |
| `CSRF_SECRET` | `openssl rand -base64 48`. Must differ from the other three. The API refuses to boot if any two of the four match. |
| `CLIENT_URLS` | Comma-separated browser origins allowed by CORS. Local: `http://localhost:5173` |
| `API_BASE_URL` | Public origin of this API. The two Google redirect URIs are derived from it. Local: `http://localhost:8000` |
| `WEB_BASE_URL` | Public origin of the frontend. Local: `http://localhost:5173` |
| `COOKIE_SAMESITE` | `strict` when API and web share a domain, `none` when they do not (requires HTTPS). |
| `CLOUDINARY_*` | Cloudinary → Dashboard → Product Environment Credentials |
| `BREVO_API_KEY` | Brevo → SMTP & API → API Keys → Create a new API key |
| `BREVO_SENDER_EMAIL` | A sender address verified in Brevo |
| `GOOGLE_CLIENT_ID` / `_SECRET` | Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID → Web application |

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
      ui/               20 primitives on design tokens
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
| POST | `/resend-code` | New verification code, 3/hour/email |
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
| `/description/:id`, `/profile` | seeker | Job detail and the seeker's own profile |
| `/login`, `/signup` | seeker | |
| `/hire` | recruiter | Employer front door |
| `/hire/login`, `/hire/signup` | recruiter | |
| `/hire/companies`, `/hire/jobs`, applicants | recruiter | The workspace. Gated on admin approval |
| `/admin`, `/admin/login` | admin | Internal console. No signup route — admins are seeded, then created by an admin |
| `/verify-email`, `/forgot-password`, `/reset-password`, OAuth landings | either | Portal-neutral, carried in `?portal=` because the Google callback redirects here |

The workspace lived under `/admin/*` before Phase 3A. Those URLs redirect to
their `/hire` equivalent, parameters and query intact.

`/browse` was a second, weaker job board until Phase 2B-2 — keyword-only, with
no facets, pagination or loading state — and it was where the hero search and
every category chip sent you, so the faceted board was reachable only by
clicking "Jobs". It now redirects to `/jobs` carrying the query, since `/jobs`
reads `keyword` from the URL as its own state.

There is no control anywhere that picks a portal. `PortalScope` derives it from
`useLocation().pathname` and nothing else — never a body, query or cookie —
matching on a segment boundary so `/hired` and `/administrator` stay seeker
paths. A `?portal=` query cannot move it.

### Design system — "Ink & Signal"

Every colour, radius, type size and motion duration is a CSS custom property in
`frontend/src/index.css`, mapped into Tailwind 4 through `@theme inline`. No
component sets a colour directly, and none branches on the theme — the tokens
flip themselves, so a `dark:` colour override in a component is a bug.

The accent ("signal") is portal-scoped: `data-portal` on the tree re-resolves it
to violet for seekers and teal for recruiters. Spacing works the same way —
`data-density` on `PageShell` resolves `--space-*`, so pages pass a `density`
prop rather than hand-tuning padding.

All 26 token pairings clear WCAG 4.5:1 in both themes and all three portals,
verified
by `frontend/tests/visual/contrast.mjs`, which resolves colours through a real
browser rather than parsing `oklch()` as if it were sRGB.

In development, `/_design` renders every primitive across both themes × both
portals. It is DEV-only via `import.meta.env.DEV` + `React.lazy`, so Rollup drops
it from production builds.

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
| `npm run lint:colour --workspace @jobportal/web` | Fail on any colour outside the token system |
| `npm run test:visual --workspace @jobportal/web` | Playwright screenshots + portal assertions, needs a dev server |
| `npm run migrate:phase1c --workspace @jobportal/api` | Drop the legacy `users` collection. Run once per existing database |
| `npm run seed:admin --workspace @jobportal/api` | Create the first admin: `-- --email <address> --name "<name>"`. Mails a set-password code; refuses if an admin exists |
| `npm run migrate:phase3a --workspace @jobportal/api` | Grandfather existing recruiters to `active`. Run once per existing database |

## Deployment

Both apps deploy independently from this monorepo. Build commands must run from
the repository root so npm can resolve the workspace symlink, and
`@jobportal/shared` must be built before the API.

**API** (Render, Railway, Fly):

```
Root directory: backend
Build:  npm ci && npm run build -w @jobportal/shared && npm run build -w @jobportal/api
Start:  npm start
```

**Web** (Vercel, Netlify, Cloudflare Pages):

```
Root directory: frontend
Build:  npm ci && npm run build -w @jobportal/shared && npm run build -w @jobportal/web
Output: dist
```

Set `VITE_API_URL` on the web host and every variable from `.env.example` on the
API host.

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
spanning both. See [ADR-0005](docs/adr/0005-cookie-sessions.md).

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
| 2B-3 | Recruiter workspace: companies, jobs, applicants | Next |
| 3 | Saved jobs, application status timeline | Planned |
| 4 | Recruiter dashboard: applicant pipeline, bulk actions, analytics | Planned |

Recruiter approval is now end to end. Sign in at `/admin/login` with an account
from `npm run seed:admin` and the queue is at `/admin/recruiters`; denial
requires a reason and emails it. Moderation lists live under `/admin/review/*`
— not `/admin/jobs`, which still redirects a pre-3A recruiter bookmark to
`/hire/jobs`.

Design documents live in `docs/superpowers/specs/`, and the decisions behind
them in `docs/adr/`.

## Security

Please read [SECURITY.md](SECURITY.md) before deploying. It documents the threat
model, the authentication design, and a credential-rotation runbook.

Phase 1C closed the authorization gap: every route touching a user-owned
resource now resolves it by a predicate that includes the caller, and a resource
you do not own answers exactly as a missing one does. The remaining known issues
are listed in SECURITY.md under "Not yet fixed" — none is an access-control
defect, but read them before pointing this at real user data.

## Acknowledgements

The initial structure came from a build-along with
[Surendrakumarpatel/jobportal-yt](https://github.com/Surendrakumarpatel/jobportal-yt).
Everything from Phase 1A onward is a substantial rewrite.

## Licence

ISC
