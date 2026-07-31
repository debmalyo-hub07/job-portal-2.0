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
| Test one file | `npm test --workspace @jobportal/api -- errors` |
| Full CI locally | `npm run ci` |

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

## Guardrails

- Never commit `.env` or any real credential. Only `.env.example` is tracked.
- Never weaken a cookie flag (`httpOnly`, `secure`, `sameSite`) to make local
  development easier — set `COOKIE_SAMESITE` in `.env` instead.
- Never add a route that touches a user-owned resource without an ownership
  check. See `ARCHITECTURE.md` for the middleware chain.
- Do not add Redis. See `docs/adr/0004-no-redis-phase-1.md` for the three
  conditions under which that changes.

## Testing

Vitest + Supertest + `mongodb-memory-server`. Mount `buildApp()` directly; never
start a listener in a test. Collections are cleared between tests by
`tests/setup.ts`, which also sets every required env var before any import runs.

For anything touching authorization, add a case to the matrix: anonymous,
seeker, unrelated recruiter, owner — each asserting its expected status code.

## Current state

Phase 1A (foundation) is complete. Phases 1B (authentication) and 1C
(authorization and domain) are not yet built, so the following known defects are
still present *by design* and should not be treated as surprises:

- No ownership checks on any route — any authenticated user can edit any company
- `httpsOnly` typo on the login cookie (a real bug, fixed in 1B)
- Client-selected `role` at login
- `getApplicants` returns password hashes
- `$regex` search on raw user input
- Public, guessable resume URLs
- `GET /apply/:id` mutates state

See `docs/superpowers/plans/2026-07-31-phase-1a-foundation.md` for the full list.
