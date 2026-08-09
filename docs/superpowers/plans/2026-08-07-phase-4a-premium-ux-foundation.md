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

---

## Sub-phase 4A.1 — Motion clock + scroll primitives

**Goal:** give the app a parametric, reduced-motion-aware motion vocabulary driven by `data-motion` on `PageShell`, and one unified rAF clock all consumers share. Spec §1.

**Key decisions (from the spec):**
- `data-motion` is a sibling to `data-density`, set by `PageShell`, never component state. Values: `ambient` (Tier 1+2+3), `standard` (Tier 2+3), `response` (Tier 3 only). Workspace fits `response`; browse/detail `standard`; marketing `ambient`.
- Tier 3 is never optional. Under `prefers-reduced-motion`, Tier 1+2 collapse to nothing and Tier 3 stays.
- One clock: shader, canvas, scroll handler, counters all subscribe to the same rAF loop — success criterion 1.
- Composables, never raw library imports in pages (CLAUDE.md).

**Files:**
- Create `frontend/src/lib/motion/clock.ts` — `subscribe(cb) → unsubscribe`, single rAF loop, pauses on `document.hidden` and when subscriber count is 0 (manager pattern).
- Create `frontend/src/lib/motion/reducedMotion.ts` — `prefersReduced()` + `onReducedMotionChange(cb)` over the jsdom-stubbed `matchMedia`.
- Create `frontend/src/lib/motion/scroll.ts` — `useInViewOnce(ref)`, `useScrollProgress(ref)` returning a mutable ref (no re-render per frame), built on motion@13's `useScroll`/`useTransform`/`useInView`.
- Create `frontend/src/lib/motion/dataset.ts` — `motionAllows(scope, tier)` predicate: reads `data-motion` + reduced-motion.
- Modify `frontend/src/components/layout/PageShell.tsx` — add optional `motion?: MotionTier` prop that sets `data-motion`; default preserves current behaviour.
- Modify `frontend/src/index.css` — add the motion-tier custom property resolver block (`[data-motion=...]` + `@media (prefers-reduced-motion: reduce)`).
- Create `frontend/tests/motionTiers.test.tsx` — PageShell emits `data-motion`; reduced-motion collapses Tier 1+2 params; `response` emits Tier 3 only.

**Interfaces produced:**
- `subscribe(cb: (dt: number, elapsed: number) => void): () => void`
- `prefersReduced(): boolean`, `onReducedMotionChange(cb): () => void`
- `useInViewOnce<T extends Element>(): { ref, inView }`
- `useScrollProgress<T extends Element>(): { ref, progress }` (MutableRefObject<number>)
- `type MotionTier = "ambient" | "standard" | "response"`
- CSS resolution: `[data-motion]` → `--motion-reveal-opacity`, `--motion-reveal-distance`, `--motion-parallax`, `--motion-ambient`, `--motion-feedback-duration-scale`

**Tasks:**
- [x] **T1: failing test** — `motionTiers.test.tsx` asserts (a) PageShell sets `data-motion` from prop, default absent; (b) under stubbed reduced-motion the resolver sets Tier 1+2 params to their collapsed values and Tier 3 keeps 1; (c) a `response`-scoped element reads `--motion-reveal-distance: 0` via `getComputedStyle`.
- [x] **T2: clock.ts** — subscribe/unsubscribe, coalesce to one rAF, dt clamped to 50ms, pause when hidden, dispose at 0 subscribers. Vitest: fake `requestAnimationFrame`.
- [x] **T3: reducedMotion.ts** — live query listener; default `false` when `matchMedia` absent.
- [x] **T4: index.css tier tokens** — the `data-motion` resolver + reduced-motion override block, mirroring the `data-density` pattern.
- [x] **T5: PageShell prop** — typed `motion?: MotionTier`, renders `data-motion` only when set; JSDoc mirrors density rule.
- [x] **T6: scroll.ts composables** — motion@13-backed, reduced-motion short-circuit, mutable ref for progress.
- [x] **T7: green the T1 tests**; run `makeStore-free` render (no Provider needed for PageShell).
- [x] **T8: gate** — `npm run typecheck` clean, `frontend` test suite green, colour lint 18/exit-1, then commit `feat(web): motion tiers + unified clock (Phase 4A.1)`.

**Status (4A.1):** complete — 96/96 web tests green (was 85, +11 motion), typecheck clean, colour lint 18/exit-1, production build green. Delivered: unified rAF `clock.ts` (one frame, dt clamped, pauses hidden/empty), `reducedMotion.ts` (live query), `scroll.ts` (`useInViewOnce`/`useScrollProgress`, mutable progress ref), `dataset.ts` (`motionAllows`), `data-motion` prop on `PageShell` with inline `--motion-*` resolver (index.css owns the reduced-motion collapse; jsdom can't process Tailwind-4 CSS so tokens are inline for testability), and `motion.tsx` gained `useMotionBudget`/`useReveal`/`useParallax` layered on the intact Tier-3 primitives.

---

## Sub-phase 4A.4 — Backend indexes

**Goal:** give the faceted-search and fit-scoring queries indexes to walk, so 4B's filters and 4A.3's projection do not collection-scan. Spec §4A.4, ARCHITECTURE.md §158. Scripts never reach for a scan when an index exists (CLAUDE.md authority rule).

**From the spec (§4A.4 authoritative text):**
- **Compound** on the filter fields 4B filters by.
- **`$text`** on the searchable fields 4B's keyword box searches.

**What the queries actually need (grounded in job.service's real filter, `keyword` + `location`):**
- `$text` on `{ title, description, requirements }` — the keyword path today scans via regex (`escapeRegex` + `$regex`); a text index replaces the scan and feeds fit ranking.
- A compound on the filter tuple 4B's left-rail facets select: `{ location, jobType, experienceLevel, salary }` (respects `sanitizeFilter`; all four are direct equality/range fields on the doc).
- The company-join, ownership, and status paths come from 4C/4D; the recruiter/workspace listing indexes (`{ createdBy }`) land with that sub-phase when that query shape exists.

**Key correction discovered during B1:** the keyword path is *behaviourally significant* — `.*` is escaped and must match exactly one job ("Literal .* match"). A `$text` index cannot reproduce that (it tokenises, `.*` matches nothing). Swapping regex→`$text` silently breaks a pinned contract. So the text index is **deferred, not added**; it lands only when keyword-query semantics get a deliberate exact-vs-ranked decision (4B). The compound index is the scan-elimination this sub-phase actually ships.

**Files:**
- Modify `backend/src/models/job.model.ts` — add the compound index; text index held back (see above). Field set unchanged — 4A.3 adds fields separately.
- ~~Modify `backend/tests/job.test.ts`~~ — no test change: the compound index changes query *execution*, not *results*; the existing suite (including the `.*` literal contract) already pins behaviour and stays green.

**Tasks:**
- [x] **B1: scope correction** — confirmed regex→`$text` breaks the escaped-literal contract (`.*` → exactly 1 hit today, becomes 0 under text indexing). Text index deferred; compound index is the real scan elimination.
- [x] **B2: jobs indexes** — compound `{ location: 1, jobType: 1, experienceLevel: 1, salary: 1 }` on the schema. Field set unchanged.
- [x] **B3: backend suite green** — 7/7 job tests, typecheck clean. No behavioural regression.
- [x] **B4: commit** — landed `75a7ad5` batched with 4A.3 (model fields); single green wave.

---

## Sub-phase 4A.3 — Backend fit data model

**Goal:** persist the fields the fit pipeline reads, so 4A.4's aggregation and the UI's (4B/4D) scores run on real data, not `undefined`. This is the schema half of closing the spec's "five gaps fit scoring can't read."

**What already exists:** `seeker.profile.{headline,bio,skills,experienceYears,location}`. `job.{title,description,requirements,salary,experienceLevel,location,jobType,position,company,created_by}`. The shared pipeline consumes `FitSeekerInput`/`FitJobInput` with the missing fields as *optional*.

**Decisions:**
- **Additive, non-destructive.** Add `profile.salaryMin`, `profile.salaryMax`, `profile.openToRemote` to `seeker`; add `remote: Boolean` to `job`. All default `null`/absent so existing documents stay valid and the pipeline's unknown→no-penalty rule (return 1) covers them until backfilled.
- **`job.workMode` vs `job.remote`.** The matching pipeline reads `workMode` (a `WorkMode` enum: `onsite|hybrid|remote`). The job model stores the flat flag `remote: Boolean` (per ARCHITECTURE.md §156). The backend projection derives `workMode` from `remote + location`: `remote ? "remote" : "onsite"`. Hybrid is a future refinement, not persisted now.
- **Skills alias map is already in shared** (`canonicalSkill`, 4A.5). Backend reuses it; no second alias table.
- **Location normalisation** lives in the projection: trim + lowercase on read, not a stored normalised copy (the stored value stays human-written).
- **Migration script** backfills nothing that isn't derivable — it just confirms the new optional fields exist; `remote` derives from `location === "remote"` on legacy docs as a one-time backfill.

**Files:**
- Modify `backend/src/models/seeker.model.ts` — `profile.salaryMin`, `profile.salaryMax` (Number, default null, min 0), `profile.openToRemote` (Boolean, default null).
- Modify `backend/src/models/job.model.ts` — `remote: { type: Boolean, default: false }`.
- Modify `packages/shared/src/domain.ts` — extend `jobCreateBodySchema` with `remote` (coerced boolean), `JobDto` with `remote: boolean`; extend profile update schema with `salaryMin`, `salaryMax`, `openToRemote`.
- Create `backend/src/services/matching.pipeline.ts` — `toFitJobInput(doc)`, `toFitSeekerInput(doc)` projection helpers + `scoreJobsForSeeker(seeker, jobs)` returning `[{job, fit}]`.
- Create `backend/tests/matching.pipeline.test.ts` — projection + scoring wired to the shared pipeline.

**Tasks:**
- [x] **A1: failing test** — `matching.pipeline.test.ts` + a profile round-trip test; both now green.
- [x] **A2: models** — `seeker.profile.{salaryMin,salaryMax,openToRemote}` (default null) and `job.remote` (default false).
- [x] **A3: shared DTO** — `profileUpdateBodySchema` gained the three seeker fit fields (form-coerced); `jobCreateBodySchema` gained `remote`; `JobDto` + `ProfileView` expose them.
- [x] **A4: matching.pipeline.ts** — `toFitSeekerInput`/`toFitJobInput` projections (unset → `undefined`, never `0`; `workMode` derived from `remote`) + `scoreJobForSeeker`/`scoreSeekerForJob` wired to the shared pipeline.
- [x] **A5: typecheck + backend suite** — shared build + root typecheck clean; **254/254 backend tests green**. Committed `75a7ad5` (batched with 4A.4).

**Status (4A.3):** complete — the fit fields persist and round-trip; the matching pipeline projects real Mongo docs into the shared scoring contract. `ProfileView` is additive so the existing profile UI typechecks unchanged; the form fields to *capture* them land in 4B/4C's profile editor.

---

### 4A.4 — index wave (landed with the same commit)

**B1 correction shipped:** the compound index `{ location, jobType, experienceLevel, salary }` now covers 4B's facet filter tuple. The `$text` index was deliberately **held back** — regex keyword search has a pinned contract (`.*` literal → exactly one hit) that text indexing would silently break; that decision moves to 4B with the rankings design.

**Status (4A.4):** partial-by-design — compound index green (7/7 job tests held); text index deferred to 4B. One publicJobs allowlist assertion extended to admit the intentional new public `remote` field.

---

## Sub-phase 4B — Faceted job search + react-query migration

**Goal:** make the search rail filter by the fields it names (spec §314: "location filter queries `job.location`, not `job.title`"), multi-select instead of one `RadioGroup`, and migrate job-fetching to `@tanstack/react-query` so refetch/loading/cache stop being a `useEffect` + Redux pair.

**What's broken (spec §49–59, grounded in `Jobs.tsx`/`FilterCard.tsx`/`useGetAllJobs`):**
- `FilterCard` options dispatch `setSearchedQuery(value)` — the *same* redux field the hero box writes. Clicking "Mumbai" runs a `keyword` regex for "Mumbai" against `title`/`description`. `location` is never consulted. Salary filter can never match (it regexes `0-5 LPA` into titles). All three categories share one `RadioGroup` — mutually exclusive.
- `useGetAllJobs` dispatches into Redux; no cache, no loading state, refetch only via a hand-maintained dep.
- Backend `listPublicJobs` only accepts `keyword` — no location/jobType/salary/experience filter args exist.

**Decisions:**
- **Server-side filtering.** New query params on `jobListQuerySchema`: `location`, `jobType`, `salaryMax`, `experienceMax`, `remote:true|false`. The keyword regex contract (escaped-literal, 4A.4) is untouched — it's still the title/description search path. Facets are *additive equality/range* filters, never regexed.
- **Multi-select with OR within a facet, AND across facets** (Bengaluru OR Remote in Location, AND full-time in Type). Backend accepts comma-joined repeatable keys; the compound index from 4A.4 covers the four-field equality/range tuple.
- **React-query for jobs.** `main.tsx` gets a single `QueryClientProvider`; `Jobs` uses a persisted-query query + useSearchParams-backed filter state so the rail and URL agree. Redux `allJobs`/`searchedQuery` become write-through (kept for LatestJobs etc. that still read them) until 4C/4D pick up the rest of the board.
- **Fit badge on job cards** needs a seeker profile; render only for authenticated seekers (`fit-score-badge` is 4D). 4B ships the *search rail*; badges land with 4D when `ProfileView.seeker` fields exist and are captured.

**Files:**
- Modify `packages/shared/src/domain.ts` — `jobListQuerySchema` extends with `location`, `jobType`, `salaryMax`, `experienceMax`, `remote` (comma-joined arrays, salary/experience coerced); keep `keyword`.
- Modify `backend/src/services/job.service.ts` — `listPublicJobs` builds the faceted filter via the compound-indexed tuple; keyword stays regex; projection unchanged.
- Modify `backend/tests/job.test.ts` — a seed set, assert multi-select filters narrow correctly AND keyword regex still returns the contract result.
- Create `frontend/src/lib/queryClient.ts` (single QueryClient, `staleTime` sane for the board).
- Modify `frontend/src/main.tsx` — `QueryClientProvider` around `App`.
- Modify `frontend/src/hooks/useJobSearch.ts` (new `useQuery` wrapping `/job/get` with the filter params); modify `frontend/src/components/Jobs.tsx` + `FilterCard.tsx` + `LatestJobs.tsx` to use it; drop `searchedQuery`-setredux for faceted use; `useGetAllJobs` stays as the legacy fallback until consumers are moved.
- Modify `frontend/tests/jobSearch.test.tsx` — react-query hook test that faceted params reach the URL and a rerender on same params hits cache.

**Tasks:**
- [x] **C0: brief + failing test** — `job.test.ts` seed set + faceted queries assert narrowing; today it won't compile/run because the params don't exist.
- [x] **C1: schema + service** — shared params + backend `listPublicJobs`.
- [x] **C2: react-query scaffold** — `queryClient.ts` + provider in `main.tsx`.
- [x] **C3: `useJobSearch` hook** — fetches with faceted params; `Jobs`/`FilterCard` rewire to multi-select + URL-sync.
- [x] **C4: typecheck + suites** — `npm run typecheck`, web tests + backend `job.test`, then commit `feat(web): faceted job search + react-query migration (Phase 4B)`.

**Status (4B):** complete — shipped in `6c1ef56` (backend) and `c6ea2e6`
(frontend). The `$text` index stayed deferred: the pinned regex contract (`.*`
escaped to exactly one hit) still holds, so keyword search remains an escaped
regex scan and the exact-vs-ranked decision moves with it.

**Out of scope (4C/4D):** the `jobType`→enum narrowing (a migration once real data exists — the current values are free-form strings and narrowing them now would 500), the profile-capture form to actually fill `salaryMin/Max`/`openToRemote`, the fit badge, similar roles. 4B makes the rail *work*.

---

## Sub-phase 4C — Profile capture (seeker fit fields)

**Goal:** give the seeker a UI to actually *enter* `salaryMin`, `salaryMax`, `openToRemote` (persisted in 4A.3), so fa—it pipelines score on real data instead of `undefined`.

**Files:** `frontend/src/components/Profile.tsx` (or the existing profile-edit dialog) — add the three fields; `frontend/tests/profile.test.tsx` — round-trip test. Backend already accepts them (4A.3 committed).

**Out of scope:** recruiting the fields into a recruiter search (4C is capture only; reverse-side ranking is 4D).

---

## Sub-phase 4D — Fit badge + reverse ranking (seeker/recruiter surfaces)

**Goal:** the explainable fit score rendered on job cards (seeker) and applicants (recruiter), driven by the shared pipeline + 4A.3 data.

**Files:** `frontend/src/components/Job.tsx` (add `fit-score-badge`), `frontend/src/components/admin/ApplicantsTable.tsx` (recruiter direction), `backend/src/routes/application.routes.ts` (expose `scoreJobForSeeker` where needed). Uses `scoreJobForSeeker`/`scoreSeekerForJob` from 4A.3 directly — no new pipeline code.

**Out of scope:** similar roles (same scorer, `≥2` shared skills — a 4D sub-task gated on the recruiter table being real).

---

## Sub-phase 4A.6 — Seeder (added after Phase 4A design)

**Task 2 (backend:** `backend/scripts/seed.ts` must write the new additive fields so the board demos realistic scores: `profile.salaryMin/Max`, `profile.openToRemote`, `job.remote`, a mix of skills that overlap. Run `npx tsx backend/scripts/seed.ts`, assert a `profile`-curried seeker exists and at least one job is remote=false.

---

*The `4A.6` seeder is a separate wave; it shapes demo data and lands after 4D's scorer is user-visible, so the demo shows scored cards.*

**Goal:** a pure, explainable two-sided fit score in `packages/shared`, consumed by the backend aggregation (4A.3/4A.4) and the UI (4B/4D). Spec §Success criterion 4: the UI shows *why*.

**Key decisions:**
- Pure functions, no I/O, no DOM. `packages/shared` builds to plain TS for both runtimes.
- One source of truth for weights: `weights.ts`. Any weight change updates `weights.ts` and any consumer in the same commit (Global Constraints).
- Explainable: every score returns a breakdown of its contributing factors, not a bare number.
- Symmetric: same pipeline scores job→seeker (search) and seeker→job (recruiter workspace) by swapping the profile-side and job-side arguments. The factor semantics differ by direction, so the weights are per-direction.

**Files:**
- Create `packages/shared/src/matching/factors.ts` — the `Factor` type and pure normalisers/validators for skills, salary band, remote/openToRemote, experience, location.
- Create `packages/shared/src/matching/weights.ts` — per-direction weight tables + `FACTOR_KEYS`; the only place the numbers live.
- Create `packages/shared/src/matching/compute.ts` — `computeJobFit(seeker, job)`, `computeSeekerFit(seeker, job)`: each returns `{ score, breakdown }`.
- Create `packages/shared/src/matching/explain.ts` — `explain(score, breakdown) → string[]` of human-readable reasons.
- Modify `packages/shared/src/index.ts` — export the matching barrel.
- Create `packages/shared/tests/matching.test.ts` — pure-function tests over fixed fixtures; no DB.

**Interfaces produced:**
- `type Factor = { key, weight, earned, max, reason }`
- `ScoreBreakdown = { score: number; factors: Factor[]; max: number }`
- `computeJobFit(seeker: FitSeekerInput, job: FitJobInput): ScoreBreakdown`
- `computeSeekerFit(seeker: FitSeekerInput, job: FitJobInput): ScoreBreakdown`
- `explain(b: ScoreBreakdown): string[]`

**Tasks:**
- [x] **S1: failing test** — `matching.test.ts` imports from `@/matching` and asserts: perfect fit → 100; missing skills → skills factor partial; remote mismatch on an on-site-only job → remote factor 0; factor `earned ≤ max`; `explain` returns human strings mentioning the dominant factor. Red: module didn't exist.
- [x] **S2: factors.ts** — `canonicalSkill(s)` (lowercase/trim/whitespace-collapse + alias map: `React.js`→`react`, `ts`→`typescript`, …); `skillCoverage`, `salaryFit` (band with 30% soft tolerance), `remoteFit` (remote job needs `openToRemote`, on-site/hybrid never penalises), `experienceFit` (25%/yr short), `locationFit` (token match). Unknown optional fields → no penalty (return 1), so the pipeline stays honest over partially-migrated data.
- [x] **S3: weights.ts** — `FACTOR_KEYS`, per-direction `WEIGHTS.job`/`.seeker` each totalling 100, `Factor`/`ScoreBreakdown` types. One file owns every number.
- [x] **S4: compute.ts** — `computeJobFit`/`computeSeekerFit`, each returns `{score, factors}`, `earned` clamped ≤ max, reasons built per factor.
- [x] **S5: explain.ts** — orders factors by shortfall (ceiling − earned), emits "Key: reason" lines.
- [x] **S6: barrel + typecheck** — `matching/index.ts` re-exported from `index.ts`; `npm run build --workspace @jobportal/shared` + root `npm run typecheck` clean.
- [x] **S7: green + commit** — `8a71c30` — 19/19 shared tests (8 new matching), typecheck clean.

**Status (4A.5):** complete — pure explainable two-sided pipeline. Public API: `computeJobFit`/`computeSeekerFit`/`explain` over `FitSeekerInput`/`FitJobInput` + `Factor`/`ScoreBreakdown`/`WEIGHTS`/`FACTOR_KEYS`. The inputs carry the spec-fit deltas as optional fields (`salaryMin/Max`, `openToRemote`, `experienceYears`, `experienceLevel`, `workMode`); backend aggregation (4A.4) projects Mongo docs into them and persists the fields, and the UI (4B/4D) reads `explain(breakdown)` for the fit badge. `FitJobInput.workMode` is the `WorkMode` enum already live in shared.



