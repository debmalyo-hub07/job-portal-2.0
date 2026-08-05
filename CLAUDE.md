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
| Audit prod deps | `npm run audit:prod` |

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
- **Portals:** `Portal` is `"seeker" | "recruiter"` and always arrives as a route
  literal, never from a request body, query or cookie. A function that takes a
  portal from user input is a bug regardless of what it does with it.
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
  the tokens flip themselves. See the Current state section for the exit grep.

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

Phases 1A (foundation), 1B (authentication), 1C (authorization and domain) and
2A (Ink & Signal design foundation) are complete. The design system and its
primitives are in place; the page layouts are still the inherited structure,
now reading tokens throughout. Phase 2B (page rebuild) has not started.

What 2A closed:

- All colour, radius, type and motion decisions are CSS custom properties in
  `frontend/src/index.css`, mapped into Tailwind 4 via `@theme inline`. No
  component sets a colour outside the token system — the exit grep
  `grep -rE '(bg|text|border)-\[#|(bg|text|border)-(red|blue|purple|green|yellow|pink|indigo|orange|teal|cyan)-[0-9]' frontend/src`
  returns nothing, and should stay that way
- Dark mode works via `ThemeProvider` (next-themes, `attribute="class"`).
  Components never branch on theme; the tokens flip themselves, so a `dark:`
  colour override in a component is a bug
- Signal is portal-scoped: `PortalScope` sets `data-portal` from the route
  (`/admin/*` → recruiter, else seeker) and the signal tokens re-resolve. It
  reads the route only — never body, query or cookie, same rule as the API
- 20 primitives on tokens: the 12 rebuilt (avatar, badge, button, carousel,
  dialog, input, label, popover, radio-group, select, sonner, table) plus 8 new
  (card, tabs, dropdown-menu, tooltip, skeleton, separator, sheet, pagination)
- Semantic state is always icon **and** label, never colour alone. `Badge`
  variants `ok`/`warn`/`danger` exist, but callers pair them with a lucide icon
  — see `AppliedJobTable.tsx` for the pattern
- Filled elements carrying text use `--signal-text` fill with `--signal-fg`
  text. Base `--signal` is non-text use only (borders, indicators, dots)
- All 18 token pairings clear WCAG 4.5:1 in both themes and both portals.
  Light-theme `--warn` and `--ok` are deliberately darker than their nominal
  values to reach it — if you lighten them, re-audit
- Fonts self-hosted via `@fontsource-variable` (Fraunces display, Geist sans,
  Geist Mono). No CDN
- `/_design` renders every primitive across both themes × both portals. It is
  DEV-only via `import.meta.env.DEV` + `React.lazy`, so Rollup drops it from
  production; the build is verified to not contain it

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
- No pagination UI — clients request `limit=50` and show that. The `Pagination`
  primitive exists but is not wired to any list yet (2B)
- The frontend still has no test runner. 2A was verified by typecheck, lint,
  build, the exit grep, a scripted OKLCH contrast audit and the gallery
- Replacing a company logo orphans the previous Cloudinary asset
- Page layouts still carry inherited non-token neutrals (`text-gray-500`,
  `bg-white`, `border-gray-200`) and ad-hoc spacing. These are not colour-system
  violations the exit grep catches, but 2B replaces them as it rebuilds each page

See `docs/superpowers/plans/2026-08-04-phase-1c-authorization-domain.md` and
`docs/superpowers/plans/2026-08-05-phase-2a-ink-signal-foundation.md`.
