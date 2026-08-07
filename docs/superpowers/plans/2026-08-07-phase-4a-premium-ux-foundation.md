# Phase 4A — Premium UX Foundation: Pre-Flight Audit & Master Plan

> Implements `docs/superpowers/specs/2026-08-07-premium-ux-foundation-design.md` (approved).
> Sub-phase detailed briefs get expanded in this file as each sub-phase starts, following the
> superpowers pattern from phases 1B–3A.

**Goal:** Raise the app from functional to premium: three-tier motion system, generative
atmosphere layer, faceted search with explainable two-sided fit scoring, and a semantic job
detail rebuild. Phases 2B-2 and 2B-3 stay deferred until this foundation lands.

**Tech Stack (post-delta):** Express 5, Mongoose 8 (9 deferred — see audit), Zod 4, React 19,
Tailwind 4.3, Vite 8, `motion@13` (replaces `framer-motion@12`), `@tanstack/react-query`,
`@number-flow/react`, Argon2id, pino.

---

## 0. Pre-flight security & modernity audit (2026-08-07)

### Stack verdict: modern and defensible

- **Argon2id** (`@node-rs/argon2`) — current best practice for password hashing. `bcryptjs`
  only remains for legacy-verify; spec removes it once `migrate:phase1c` has run.
- **Cookie sessions** (`httpOnly`, `secure`, `sameSite`; ADR-0005), refresh-token rotation,
  OTP budgets, Google linking — all hardened in 1B.
- **`mongoose.set('sanitizeFilter', true)`** + Zod string coercion — NoSQL injection closed.
- **`helmet`, `hpp`, 1MB body limits, CORS allowlist with credentials** — 1A.
- **Three account collections** (ADR-0006) — the collection is the role; no `requireRole` to
  misconfigure; recruiters register `pending`, gated by `requireApproved`.
- **Ownership failures answer 404** — resource-existence oracle closed.
- **No Redis by design** (ADR-0004) — three documented conditions must hold before it returns.

### Findings to act on

| # | Finding | Severity | Action |
|---|---|---|---|
| 1 | `react-router 7.12.0–8.2.0` — GHSA-qwww-vcr4-c8h2 (RSC-mode CSRF). We are an SPA and do not use RSC mode, so exposure is latent, but `npm run audit:prod` should be green | High (advisory) | Task 0.1 — bump to patched 7.x via `npm audit fix` |
| 2 | `bcryptjs` still a prod dep. Removal is **gated**: it verifies legacy `$2*` hashes and transparently rehashes to Argon2id on next login (`lib/password.ts`, `auth.service.ts:377`). Removing it before every database has run `migrate:phase1c` **and** every migrated account has logged in once would lock those users out with no recourse | N/A (deployment-gated) | Task 0.3 deferred — remove only after a prod query confirms zero `$2*` hashes remain. Tracked as a `deferred-tasks` note |
| 3 | Mongoose 9.9.1, Vitest 4, ESLint 10, TS 7 available | Routine | **Deferred.** Major bumps are their own phase; the spec's delta (Vite 8, Tailwind 4.3, motion@13) is what we absorb now |
| 4 | `google-auth-library` 11 available | Routine | Deferred with #3 |

### Installed agent skills (project-local, `.agents/skills/`, git-ignored)

- `vercel-labs/agent-skills@web-design-guidelines` (523K installs)
- `vercel-labs/agent-skills@vercel-react-best-practices` (614K)
- `addyosmani/web-quality-skills@accessibility` (42.6K)
- `shadcn/ui@shadcn` (271K) — reference for primitive composition patterns

Deliberately **not** installed: `threejs-webgl` (spec non-goal), `gsap-react` (spec mandates
`motion@13`), Figma/Canva skills (no design-source files in this repo; design is token-driven).

## Global Constraints

Carried from prior plans plus spec maintenance contract:

- **ESM `.js` extensions** on every relative import in `backend` + `packages/shared`; frontend uses Bundler resolution and must NOT have them.
- **`packages/shared` must be built before the API typechecks against it.**
- **Errors:** `throw AppError`. Never `catch` without rethrowing. Explicit DTOs, never a Mongoose doc.
- **Portal is always a route literal** — never from body, query or cookie, backend and frontend.
- **Colours only from token utilities.** Colour lint must stay at exit 1 with exactly 18 known violations — a 19th is failure.
- **Spacing from `PageShell` density props.** Never hand-tuned.
- **Fraunces never below 20px** (`text-xl` floor).
- **Motion only through `lib/motion/` composables.** No component imports `motion`/`framer-motion` directly. Components read resolved CSS custom properties from `data-motion`; never branch on the attribute.
- **Fit-score weight changes must update `weights.ts` and `matching.pipeline.ts` in the same commit.**
- **Tiered motion:** Tier 1+2 collapse to nothing under `prefers-reduced-motion`; Tier 3 (feedback) always survives.
- **Authorization matrix tests** for any new endpoint touching user-owned resources.
- **Commit style:** conventional commits, no `Co-Authored-By` trailer.
- Run `npm run build --workspace @jobportal/shared && npm run typecheck` before each commit; `npm run ci` in the background (>120s).

## Success Criteria (spec §Success criteria)

1. Motion runs on one clock — no micro-desync between shader, canvas, scroll handler.
2. Atmosphere re-derives on theme flip — reads tokens live.
3. Search filters by the fields it names — location queries `job.location`.
4. Fit score is explainable — UI shows why.
5. Job detail has exactly one `<h1>`, navbar, responsive to 375px.
6. Workspace gets Tier 3 only — test-verified for `/hire/jobs`, `/hire/companies`.
7. Colour lint stays exit 1 / 18 violations.

## Non-goals

- Next.js migration, background video, three.js as foundation dep (named option for admin console later).
- Rebuilding 2B-2/2B-3 pages before this foundation lands.
- Major-version deferred bumps (Mongoose 9, Vitest 4, ESLint 10, TS 7) — separate future phase.

---

## Sub-phase index

- **Task 0 — Hygiene:** react-router patch (fixes GHSA-qwww-vcr4-c8h2), Vite 8, Tailwind 4.3, add `motion@13` + `@tanstack/react-query` + `@number-flow/react`, remove `bcryptjs` + legacy-verify branch.
- **4A.1 — Motion clock + scroll primitives** (`frontend/src/lib/motion/`): unified rAF `clock.ts`, `scroll.ts` composables, `transitions.ts` route fades, `data-motion` wiring on `PageShell`.
- **4A.2 — Atmosphere layer** (`frontend/src/lib/atmosphere/`): raw-WebGL fBm shader with Canvas-2D fallback, duotone helper, shared clock, token live-read on theme flip.
- **4A.3 — Backend fit data model:** `profile.salaryMin/Max/openToRemote/experienceYears`, `job.remote`, `jobType` enum, skills alias map, location normalisation; migration script.
- **4A.4 — Backend indexes:** compound on filter fields, `$text` on searchable fields.
- **4A.5 — Fit-scoring pipeline:** `packages/shared/src/matching/weights.ts` + `explain.ts`, `backend/src/services/matching.pipeline.ts`.
- **4B — Search (later brief):** faceted UI, fit-scored list, react-query migration.
- **4C — Detail (later brief):** job detail rebuild, explanation UI, similar roles.
- **4D — Workspace/Admin (later brief):** reverse scoring, admin console, motion-tier enforcement test.

Each sub-phase brief is expanded in this file before work begins on it; tasks use `- [ ]` with failing test → implement → typecheck → commit.

