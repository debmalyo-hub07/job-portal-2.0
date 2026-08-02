# Job Portal

A job portal for the Indian market — job seekers find and apply to roles,
recruiters post them and manage applicants. Built with security and access
control as the starting point rather than an afterthought.

> **Status:** Phase 1A (typed, tested, hardened foundation) is complete.
> Authentication and authorization rebuilds are in progress. Not yet suitable
> for production use — see [Roadmap](#roadmap).

## Tech stack

| Layer | Choice |
|---|---|
| API | Node 20, Express 5, TypeScript, Mongoose 8 |
| Database | MongoDB (Atlas) |
| Web | React 19, Vite 7, TypeScript, Redux Toolkit, Tailwind 4, shadcn/ui |
| Validation | Zod 4, shared between client and server |
| Email | Brevo (transactional) |
| Media | Cloudinary |
| Testing | Vitest, Supertest, mongodb-memory-server |
| Logging | Pino |

## Quick start

### Prerequisites

- **Node 20.19+** (Vite 7 requires it; `20.18` warns and is unsupported)
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
apps/
  api/                  Express API
    src/
      config/           env parsing, database connection
      controllers/      HTTP handling
      middleware/       requestId, security, rateLimit, error, notFound
      models/           Mongoose schemas
      routes/           route definitions
      lib/              AppError, logger, rate-limit store
      app.ts            buildApp() — wired app, does not listen
      server.ts         listen + graceful shutdown
    tests/
  web/                  React client
packages/
  shared/               Zod schemas and types used by both apps
docs/
  adr/                  architecture decision records
  superpowers/          design specs and implementation plans
```

The API and web app remain fully independent processes and deploy separately.
The workspace root exists so both can share `packages/shared` — which makes a
client/server contract mismatch a compile error rather than a runtime surprise.

## Scripts

Set `VITE_API_URL` in `frontend/.env.local` for local development:

```
VITE_API_URL=http://localhost:8000/api/v1
```

## Scripts

| Command | Effect |
|---|---|
| `npm run dev:api` | API in watch mode via tsx |
| `npm run dev:web` | Vite dev server |
| `npm run build` | Build all workspaces |
| `npm test` | Test all workspaces |
| `npm run typecheck` | Typecheck all workspaces |
| `npm run lint` | Lint all workspaces |
| `npm run ci` | Everything CI runs, in order |

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
API host. If the two are on different domains, set `COOKIE_SAMESITE=none`, which
requires HTTPS on both.

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1A | Monorepo, TypeScript, config validation, error handling, logging, security middleware, CI, docs | Complete |
| 1B | Two-collection accounts, Argon2id, Brevo OTP verification, Google OAuth, refresh-token rotation | Next |
| 1C | Ownership-based authorization, response DTOs, pagination, private resume storage, migration | Planned |
| 2 | Design system and full UI rebuild, seeker and recruiter portals both | Planned |
| 3 | Saved jobs, server-side search and filters, application status timeline | Planned |
| 4 | Recruiter dashboard: applicant pipeline, bulk actions, analytics | Planned |

Design documents live in `docs/superpowers/specs/`, and the decisions behind
them in `docs/adr/`.

## Security

Please read [SECURITY.md](SECURITY.md) before deploying. It documents the threat
model, the authentication design, and a credential-rotation runbook.

Do not run this against real user data until Phase 1C is complete — until then
there are no ownership checks on API routes.

## Acknowledgements

The initial structure came from a build-along with
[Surendrakumarpatel/jobportal-yt](https://github.com/Surendrakumarpatel/jobportal-yt).
Everything from Phase 1A onward is a substantial rewrite.

## Licence

ISC
