# Premium UX Foundation — Design Specification

**Phase:** Foundation rebuild (motion, atmosphere, search, fit scoring)  
**Date:** 2026-08-07  
**Status:** Approved for implementation  
**Replaces:** Phases 2B-2 (seeker pages) and 2B-3 (recruiter workspace) — those are deferred until this foundation lands.

---

## Summary

Raise the application from functional to premium through four coordinated layers:

1. **Motion system** — a three-tier vocabulary that replaces the current four effects with a complete language
2. **Atmosphere layer** — generative backgrounds that obey the token palette
3. **Search rebuild** — faceted filters plus two-sided fit scoring
4. **Job detail redesign** — cards that explain why they ranked where they did

The design system (Ink & Signal) stays; this is the layer on top of it. Stack upgrades are routine: `motion@13`, `@tanstack/react-query`, indexes, Vite 8, Tailwind 4.3.

---

## Current-state audit: why this is needed

### Motion is structurally absent

Grep for `whileInView | useScroll | useTransform | useInView | AnimatePresence`:

```
→ No matches found
```

The complete motion vocabulary today is four effects in `lib/motion.tsx`: fade with 8px travel, stagger, hover lift of −2px, and an unused `SharedElement`. Longest duration: 380ms. There is no scroll-triggered reveal, no scroll-linked parallax, no page transition, no load choreography, no ambient motion. Route changes are hard swaps.

### Imagery is structurally absent

```bash
find src public -name "*.png" -o "*.jpg" -o "*.webp" -o "*.mp4"
→ src/assets/react.svg
→ public/vite.svg
```

The only two images in the application are the React and Vite scaffolding logos. No product imagery, no illustration, no texture, no video, no gradient. The "premium background video" request has never been actioned even once.

### Six primitives built and never used

Sheet, Tabs, Tooltip, Skeleton, Pagination, DropdownMenu — all imported by exactly one file, the DEV-only design gallery. So: no mobile navigation anywhere (Sheet is right there), no loading skeletons, no pagination UI, no tabbed surfaces.

### Search structurally cannot filter

Backend keyword search:

```js
$or: [{ title: re }, { description: re }]     // job.service.ts:87
```

Every FilterCard option dispatches `setSearchedQuery(value)` — the *same* redux field the hero search box writes. So clicking **"Mumbai"** runs a regex for "Mumbai" against **title and description**. The `location` field is never consulted. The salary filter can never return a result (it searches for the literal string `0-5 LPA` inside job titles). And all three categories sit inside **one `RadioGroup`** — Location, Job Type and Salary are mutually exclusive.

Plus: `filterData` is hardcoded — five cities and six roles invented in the file. `job.model.ts` declares **zero indexes** — every query is a collection scan.

### Job detail page has no navbar and eight `<h1>` elements

Title, "Job Description", then Role / Location / Description / Experience / Salary / Posted Date each as its own `<h1>` (lines 107–136). A screen-reader user hears eight top-level headings. No `Navbar` at all — browser-back is the only exit. To answer *"have I applied?"* it fetches **all** your applications at `limit=50` and scans client-side. `text-gray-800`, `border-b-gray-300` — token violations.

---

## Design direction

### 1. Motion system — three tiers, parametric

Motion becomes `data-motion`, a sibling to `data-density`. Set by `PageShell`, never component state.

| Tier | Applies to | What it includes | Where |
|---|---|---|---|
| **Tier 1 · Ambient** | Atmosphere | Runs without input: shader fields, cinemagraph breathing, grain, pulse on live indicators | Marketing only: `/`, `/hire`, auth |
| **Tier 2 · Narrative** | Scroll choreography | Driven by scroll position: line/word reveals, pinned sequences, counters on enter, depth parallax | Marketing + seeker browse + job detail |
| **Tier 3 · Response** | Feedback | Driven by input: hover, press, focus, cursor affordances, route transitions, optimistic state, skeletons | **Every surface, including workspace and admin** |

**Tier 3 is never optional** — it is feedback, not decoration. A user who asks for reduced motion gets Tiers 1–2 collapsed to nothing while Tier 3 stays fully intact.

**Architecture:**

```
frontend/src/lib/motion/
  clock.ts         → unified rAF driver, one clock for all consumers
  transitions.ts   → route and shared-element transitions via motion@13
  scroll.ts        → useScroll, useTransform, useInView composables
  ambient.ts       → shader + canvas primitives
```

Components read `data-motion` from `PageShell` the way they read `data-density` today — the identical rule tokens already follow for `data-portal`. A page cannot accidentally ship the wrong amount of motion.

### 2. Atmosphere layer — generative, token-driven

Four techniques, used as layers rather than alternatives:

#### **A · Duotone photography**

Real photographs, remapped onto the paper→signal ramp. The image is `grayscale(1)` + `contrast(1.15)`, then a linear gradient from `--paper` to `--signal` applied via `mix-blend-mode: color`. **The photo is inside the palette by construction** — it can never clash, and it re-derives itself when the theme flips.

Usage: **content**, not atmosphere. Marketing hero images only.

#### **B · Canvas 2D ambient field**

Four soft light sources drifting on slow sine paths, with a film-grain overlay to kill the banding that makes CSS gradients look cheap. ~60 lines, no library, no GPU dependency, degrades to a flat token colour.

Bundle: ~2 KB. Risk: very low.

#### **C · WebGL shader gradient** (Recommended as the atmospheric base)

A five-octave fBm noise field evaluated per pixel on the GPU. This is the look people mean by "premium" — Stripe, Linear, Vercel all ship a version of it. Critically: **raw WebGL with no three.js at all.** The whole thing is one fragment shader and ~70 lines of setup.

Bundle: ~4 KB. Risk: needs fallback to B.

#### **D · three.js 3D scene**

A real scene graph — geometry, materials, lights, camera. Buys depth, parallax and physically-lit form. Costs **~170 KB gzipped** and introduces a second design problem: *what object?*

**Verdict:** Keep three.js as a named option for one specific surface later (admin console data sculpture candidate) rather than a foundation-phase commitment. **The recommended mix is C as the ambient layer everywhere, A as the art-directed layer on marketing surfaces only.** They are not exclusive — C is atmosphere behind type, A is content.

**Architecture:**

```
frontend/src/lib/atmosphere/
  shader.ts        → WebGL fBm gradient (Option C), fallback to canvas field (B)
  duotone.ts       → Photo remapping (Option A)
  clock.ts         → unified frame scheduler, shared with motion/clock.ts
```

Every technique reads `--paper`, `--signal`, `--ink` out of CSS custom properties at runtime (the same through-the-browser resolution `contrast.mjs` uses), so flipping the theme re-derives all of them.

### 3. Search rebuild — faceted + fit scoring

#### 3.1 Faceted search foundation

Multi-select facets with live result counts:

```
Location                        Salary
☑ Bengaluru            412      ├─────●──────────────────┤
☑ Remote               388      ₹8L            ₹80L
☐ Mumbai              201
☐ Pune                 96      Experience
                                ☐ 0–2y          188
Job type                        ☑ 3–5y          341
☑ Full-time            602      ☐ 6y+           122
☐ Contract             88
                                ────────────────────────
Counts update live.             800 roles · Clear all
```

**Five gaps the backend must close:**

1. **Salary expectation on seeker** — additive field `profile.salaryMin` / `salaryMax` (Numbers, in the same unit `job.salary` uses).
2. **Skills normalisation** — a shared alias map so `"React"` === `"React.js"` === `"ReactJS"`.
3. **Location normalisation** — same problem. Also add `job.remote: Boolean`, `profile.openToRemote: Boolean`.
4. **`jobType` constrained to an enum** — `"Full-time" | "Contract" | "Intern"` (or the four-value set the org decides).
5. **Indexes on `job.model.ts`** — compound on `{location, jobType, experienceLevel, salary}`, plus `$text` on `{title, description, requirements}`.

The deferred Phase 3 decision (`docs/adr/0004-no-redis-phase-1.md`, CLAUDE.md line 270) is **due today** — fit scoring can't rank what it can't read.

#### 3.2 Two-sided fit scoring

Every job gets an explainable fit score against the seeker's profile:

- **Skills overlap** — `$setIntersection` on `job.requirements` and `profile.skills`, after normalisation
- **Experience band** — `profile.experienceYears` vs `job.experienceLevel`, with a tolerance window
- **Salary fit** — `job.salary` vs `[profile.salaryMin, profile.salaryMax]`
- **Location** — exact match or `job.remote && profile.openToRemote`
- **Recency** — `job.createdAt` decay

**The same scorer runs in reverse** to rank applicants for the recruiter — which is what finally makes `ApplicantsTable` and the admin console worth building.

**Architecture:**

```
packages/shared/src/matching/
  weights.ts       → the weight table. One definition of what "87% fit" means,
                     imported by API and client alike.
  explain.ts       → pure fn: (job, profile) → { score, reasons[] }
                     unit-testable in isolation, no Mongo needed.

backend/src/services/matching.pipeline.ts
  → builds the $addFields stages FROM weights.ts, so the pipeline and the
    pure function can never disagree about what a dimension is worth.
```

The pipeline emits the score **and the reason flags** in one pass, so the client renders what the ranker actually used rather than recomputing it.

#### 3.3 UI for fit scoring

```
SEEKER SEES                    RECRUITER SEES
────────────────────────────    ────────────────────────────
Senior Frontend Engineer       Priya Raman
Northvale · Bengaluru          5y · Bengaluru

  87% fit                        91% fit
  █████████████████░░░                ██████████████████░░

  ✓ 5 of 6 skills               ✓ React, TS, RTL
  ✓ Salary in your band         ✓ 5y ≥ 4y required
  ✓ Location matches            ✓ Bengaluru
  ✗ Wants 6y, you have 5        ✗ No Node.js

Same scorer, both directions.
```

The percentage animates from 0→87 when the card enters — `@number-flow/react` at 0.6KB. That's the modern tell: numbers that move earn "premium", static numbers don't.

### 4. Job detail redesign

Current state: eight `<h1>`s, no navbar, no loading state, fields render blank then pop, `{salary}LPA` renders as "32LPA", no responsive grid.

**New structure:**

```
<PageShell density="spacious" motionTier="narrative">
  <Navbar />
  <div class="job-detail">
    <header>
      <company-card />
      <h1>{title}</h1>
      <fit-score-badge score={87} reasons={[...]} />
      <apply-button />
    </header>

    <section class="overview">
      <dl> {/* description list, not divs */}
        <dt>Location</dt><dd>{location}</dd>
        <dt>Experience</dt><dd>{experienceLevel}y</dd>
        <dt>Salary</dt><dd>₹{salary}L</dd>
        <dt>Posted</dt><dd><relative-time /></dd>
      </dl>
    </section>

    <section class="requirements">
      <h2>What you'll do</h2>
      <prose>{description}</prose>
      <h3>We're looking for</h3>
      <skill-chips skills={requirements} />
    </section>

    <aside class="similar-roles">
      <h2>Similar roles</h2>
      <job-card-list />
    </aside>
  </div>
</PageShell>
```

**One `<h1>` per page.** `<dl>` for the metadata pairs. Skeleton → content transition. `Navbar` present. Responsive down to 375px.

---

## Stack delta

| Change | From | To | Reason |
|---|---|---|---|
| **Add** | — | `motion@13` | Successor to `framer-motion@12`. Native `ScrollTimeline`, unified frame scheduler. Drop-in API. |
| **Add** | — | `@tanstack/react-query` | Server-state cache. This is the real cause of the static-feeling lists. |
| **Add** | — | `@number-flow/react` | Animated counters, 0.6KB. Numbers that count up on entry earn "premium". |
| **Upgrade** | Vite 7 | Vite 8 | Routine bump. |
| **Upgrade** | Tailwind 4.1 | Tailwind 4.3 | Routine bump. |
| **Remove** | `bcryptjs` | — | Only reachable through the legacy-verify path. Once `migrate:phase1c` has run, the dependency and its branch can go. |

**No framework changes.** Express 5, Mongoose 8, Zod 4, React 19, Tailwind 4, Argon2id, pino — that *is* the 2026 stack. Every real problem found is application-layer, not infrastructure.

---

## Implementation order

### Phase 1: Foundation (blocking everything else)

1. **Motion clock + scroll primitives** — unified rAF driver, scroll hooks, frame scheduler
2. **Atmosphere layer** — shader + duotone + clock integration
3. **Backend: fit-scoring data model** — add `profile.salaryMin/Max`, `profile.openToRemote`, `job.remote`, skills alias map, location normalisation, `jobType` enum
4. **Backend: indexes** — compound on filter fields, `$text` on searchable fields
5. **Backend: fit-scoring pipeline** — weights.ts, explain.ts, matching.pipeline.ts

### Phase 2: Search (depends on Phase 1 backend + indexes)

1. **Faceted filter UI** — multi-select with live counts
2. **Fit-scored job list** — cards with animated score badges
3. **Search state management** — migrate to `@tanstack/react-query`

### Phase 3: Detail (depends on Phase 1 motion + Phase 2 fit scoring)

1. **Job detail page rebuild** — semantic HTML, one `<h1>`, navbar, responsive
2. **Fit-score explanation UI** — the reason breakdown shown in the preview
3. **Similar roles** — same scorer, filtered to related skills

### Phase 4: Workspace + Admin (depends on all above)

1. **Recruiter applicant ranking** — fit scorer in reverse
2. **Admin console foundation** — approve recruiters, view pending
3. **Motion tier enforcement** — workspace gets Tier 3 only, verified via test

---

## Non-goals (deliberately out of scope)

- **Next.js migration** — the stack is already modern; this would throw away three phases of auth hardening
- **Background video** — weight, LCP, motion-sensitivity all suffer. Cinemagraph (still image + shader breathing) gets the feeling without the cost.
- **three.js as a foundation dependency** — kept as a named option for one specific surface later (admin console candidate)
- **Rebuilding the inherited seeker pages and recruiter workspace before this lands** — those are Phases 2B-2 and 2B-3, deliberately deferred until the foundation exists

---

## Success criteria

1. **Motion runs on one clock** — no micro-desync between shader, canvas, scroll handler, cursor
2. **Atmosphere re-derives on theme flip** — every technique reads tokens live
3. **Search can filter by the fields it names** — location filter queries `job.location`, not `job.title`
4. **Fit score is explainable** — UI shows *why* a job ranked where it did
5. **Job detail has exactly one `<h1>`** — semantic HTML, navbar present, responsive
6. **Workspace gets Tier 3 only** — verified via test that no Tier 1/2 motion reaches `/hire/jobs` or `/hire/companies`
7. **Colour lint stays at exit 1 with 18 violations** — no new token violation may appear

---

## Open questions (to resolve during implementation)

1. **Skills alias map: client-side or server-side?** Leaning server-side (one source of truth), but if the client needs it for input normalisation too, ship it in `packages/shared`.
2. **Fit-score weight table: tunable via UI or hardcoded?** Hardcoded for Phase 1; admin-tunable weights are a Phase 4 feature.
3. **Similar roles: same algorithm or hand-tuned?** Same algorithm, filtered to `$setIntersection` size ≥ 2.

---

## Risks

| Risk | Mitigation |
|---|---|
| **WebGL unavailable in some browsers** | Shader gracefully falls back to Canvas 2D field (Option B) on context failure |
| **Fit scoring produces garbage early** | Weights are in `packages/shared`, not the DB. Tuning requires no migration. |
| **Motion causes motion sickness** | Tier 1+2 collapse to nothing under `prefers-reduced-motion`. Tier 3 survives because it's feedback. |
| **Search indexes slow writes** | Compound index on filter fields is selective. `$text` index has known cost; defer if write latency becomes measurable. |
| **`@tanstack/react-query` unfamiliar to team** | It's the current standard. Docs are excellent. Start with one list (job board), expand from there. |

---

## Maintenance contract

- **Token violations:** the colour lint gate (`npm run lint:colour --workspace @jobportal/web`) must stay at exit 1 with 18 violations. Adding a 19th is a failure.
- **Contrast audit:** all 26 token pairings (18 from 2A + 8 for admin) must clear WCAG 4.5:1 in both themes and all three portals. `node frontend/tests/visual/contrast.mjs` enforces this.
- **Motion tiers:** a component that reads `data-motion` may never branch on the attribute — it reads the resolved CSS custom properties, exactly as the tokens do for `data-portal`.
- **Fit-score weights:** any weight change must update both `weights.ts` (shared definition) and `matching.pipeline.ts` (aggregation pipeline) in the same commit.

---

## References

- Phases 1A/1B/1C: authorization foundation (complete)
- Phase 2A: Ink & Signal tokens + primitives (complete)
- Phase 2B-1: design language + portal-split auth (complete)
- Phase 3A: three-portal foundation (complete)
- This spec: Foundation rebuild (motion, atmosphere, search, fit scoring)
- Deferred: 2B-2 (seeker pages), 2B-3 (recruiter workspace), 3B (admin console features)
