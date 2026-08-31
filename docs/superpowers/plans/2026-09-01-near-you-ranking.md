# Near-You Ranking (P4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in seeker's board leads with roles ranked by where they
are — distance band from their stored city × the existing fit engine ×
recency — served by `GET /job/near-me` and surfaced as a "Near you" rail with
a one-time consent prompt for seekers with no stored location.

**Architecture:** The ranking math is pure and shared
(`distanceBand`, `nearMeScore`, the region map, named weights). The backend
service reads the seeker's city from `geoLocation` (P2) with the
self-reported `profile.location` as fallback, scores open jobs in memory
(bounded: today's board is 198 rows; the service notes when this needs an
aggregation), and returns `JobDto` rows extended with their band. The
frontend hook drives a compact rail above the board; a 400 with code
`NEAR_ME_NO_LOCATION` renders the consent prompt instead, which runs P2's
`useDeviceLocation` and saves through the profile route.

**Tech Stack:** zod-free pure TS in `packages/shared/src/location.ts`, the
existing `toJobDto`/fit viewer plumbing, react-query + `useDeviceLocation`.

**Spec:** `docs/superpowers/specs/2026-08-31-location-aware-platform-design.md`
(P4 section). Binding numbers: bands same_city=3 / same_region=2 /
elsewhere=1 / **remote=2**; weights **0.5 distance / 0.35 fit / 0.15
recency**; recency = linear decay over **8 weeks**, floored at 0.

## Global Constraints

Same as the P2/P3 plans: shared schemas and types for anything crossing the
API boundary; `.js` on backend relative imports; test-first with the failing
run shown; commit per task; no Co-Authored-By trailer; colour gate hard zero;
`npm run build --workspace @jobportal/shared` after shared edits.

---

### Task 1: Shared — the ranking math

**Files:**
- Modify: `packages/shared/src/location.ts` (region map, band, score, weights)
- Test: `packages/shared/tests/location.test.ts` (extend)

**Interfaces — Produces:**
`CITY_REGIONS: Record<string, "north" | "west" | "south" | "east">`,
`type DistanceBand = "same_city" | "same_region" | "elsewhere" | "remote"`,
`distanceBand(seekerCity: string | null, jobCity: string, remote: boolean): DistanceBand`,
`NEAR_ME_WEIGHTS = { distance: 0.5, fit: 0.35, recency: 0.15 }`,
`nearMeScore(band: DistanceBand, fitScore0to100: number, postedAt: string | Date, now?: Date): number` (0–1, three decimals).

- [ ] **Step 1: Failing tests** — add to `location.test.ts`:

```ts
import { CITY_REGIONS, NEAR_ME_WEIGHTS, distanceBand, nearMeScore } from "../src/index.js";

describe("distanceBand", () => {
  it("prefers same city, then same region, then elsewhere", () => {
    expect(distanceBand("Bengaluru", "Bengaluru", false)).toBe("same_city");
    expect(distanceBand("Bengaluru", "Chennai", false)).toBe("same_region");
    expect(distanceBand("Bengaluru", "Mumbai", false)).toBe("elsewhere");
  });

  it("bands remote roles as remote, regardless of either city", () => {
    expect(distanceBand("Bengaluru", "Delhi NCR", true)).toBe("remote");
    expect(distanceBand("Bengaluru", "Bengaluru", true)).toBe("remote");
  });

  it("bands defensively as elsewhere with no seeker city", () => {
    expect(distanceBand(null, "Bengaluru", false)).toBe("elsewhere");
  });

  it("covers every board city except Remote", () => {
    for (const city of Object.keys(CITY_REGIONS)) {
      expect(JOB_LOCATIONS).toContain(city);
      expect(CITY_REGIONS[city]).toMatch(/^(north|west|south|east)$/);
    }
  });
});

describe("nearMeScore", () => {
  const now = new Date("2026-09-01T00:00:00Z");

  it("same city beats region beats elsewhere, fit held equal", () => {
    const a = nearMeScore("same_city", 50, now, now);
    const b = nearMeScore("same_region", 50, now, now);
    const c = nearMeScore("elsewhere", 50, now, now);
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
  });

  it("remote outranks far-city roles but not same-city ones", () => {
    const remote = nearMeScore("remote", 50, now, now);
    expect(remote).toBeGreaterThan(nearMeScore("elsewhere", 50, now, now));
    expect(remote).toBeLessThan(nearMeScore("same_city", 50, now, now));
  });

  it("fit breaks distance ties", () => {
    expect(nearMeScore("same_city", 90, now, now)).toBeGreaterThan(nearMeScore("same_city", 10, now, now));
  });

  it("recency decays linearly over eight weeks to zero", () => {
    const fresh = nearMeScore("same_city", 50, now, now);
    const fourWeeks = nearMeScore("same_city", 50, new Date(now.getTime() - 28 * 86_400_000), now);
    const nineWeeks = nearMeScore("same_city", 50, new Date(now.getTime() - 63 * 86_400_000), now);
    expect(fresh).toBeGreaterThan(fourWeeks);
    expect(nineWeeks).toBeCloseTo(
      nearMeScore("same_city", 50, new Date(now.getTime() - 70 * 86_400_000), now),
      5,
    );
  });

  it("weights sum to one", () => {
    expect(Object.values(NEAR_ME_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });
});
```

- [ ] **Step 2: Run to verify failure**, then **Step 3: implement** — append to
  `location.ts`:

```ts
/**
 * P4 — "near you". The region grouping behind the distance band: the board's
 * seven office cities into north/west/south/east. Keys are board vocabulary
 * (never "Remote" — that is a way of working, not a place).
 */
export const CITY_REGIONS: Record<string, "north" | "west" | "south" | "east"> = {
  "Delhi NCR": "north",
  Mumbai: "west",
  Pune: "west",
  Bengaluru: "south",
  Chennai: "south",
  Hyderabad: "south",
  Kolkata: "east",
};

export type DistanceBand = "same_city" | "same_region" | "elsewhere" | "remote";

export function distanceBand(seekerCity: string | null, jobCity: string, remote: boolean): DistanceBand {
  if (remote) return "remote";
  if (!seekerCity) return "elsewhere";
  if (seekerCity === jobCity) return "same_city";
  return CITY_REGIONS[seekerCity] === CITY_REGIONS[jobCity] ? "same_region" : "elsewhere";
}

/** Named, not magic — the spec locked these with the user on 2026-08-31. */
export const NEAR_ME_WEIGHTS = { distance: 0.5, fit: 0.35, recency: 0.15 } as const;

const BAND_VALUE: Record<DistanceBand, number> = { same_city: 3, same_region: 2, remote: 2, elsewhere: 1 };
const RECENCY_SPAN_MS = 56 * 86_400_000; // eight weeks

/**
 * The composed "near you" score, 0–1. Distance dominates, fit is close behind,
 * recency keeps fresh postings surfacing. Remote sits at the same-region band:
 * it outranks a far-city role but never the seeker's own city.
 */
export function nearMeScore(
  band: DistanceBand,
  fitScore0to100: number,
  postedAt: string | Date,
  now: Date = new Date(),
): number {
  const posted = postedAt instanceof Date ? postedAt : new Date(postedAt);
  const age = Math.max(0, now.getTime() - posted.getTime());
  const recency = Math.max(0, 1 - age / RECENCY_SPAN_MS);
  const score =
    NEAR_ME_WEIGHTS.distance * (BAND_VALUE[band] / 3) +
    NEAR_ME_WEIGHTS.fit * (Math.min(100, Math.max(0, fitScore0to100)) / 100) +
    NEAR_ME_WEIGHTS.recency * recency;
  return Math.round(score * 1000) / 1000;
}
```

- [ ] **Step 4: full shared suite + build. Commit.**

---

### Task 2: Backend — `GET /job/near-me`

**Files:**
- Modify: `backend/src/services/job.service.ts` (add `listNearMeJobs`; read
  `paginate()` first — its company-population and fit-viewer plumbing is what
  the rows reuse)
- Modify: `backend/src/controllers/job.controller.ts` + `routes/job.route.ts`
  (`router.route("/near-me").get(authenticate("seeker"), requireProfileComplete, getNearMeJobs)`)
- Test: `backend/tests/nearMe.test.ts`

**Interfaces:**
- Consumes: Task 1's `distanceBand`/`nearMeScore`; `scoreJobForSeeker`
  (backend `matching.pipeline.ts:49`, returns `ScoreBreakdown` with
  `score: 0–100`); `toJobDto(doc, viewer)` (the same mapper `paginate` uses —
  follow its call shape exactly); `seeker.geoLocation?.city` with
  `normalizeCity(seeker.profile?.location)` as the self-reported fallback.
- Produces: `GET /api/v1/job/near-me?page=` →
  `PaginatedResponse<JobDto & { band: DistanceBand }>`, ranked by score desc;
  a seeker with no usable city gets `400 NEAR_ME_NO_LOCATION`. Shared gains
  `NearMeJobDto = JobDto & { band: DistanceBand }` in `domain.ts`.

- [ ] **Step 1: Failing test** — `backend/tests/nearMe.test.ts`, using the
  `signedUpOn`/`asSession` harness and a seeded seeker+jobs fixture:
  a seeker with `geoLocation { city: "Bengaluru", country: "IN" }`; jobs: one
  Bengaluru role posted 1 week ago, one Chennai role posted 1 week ago (same
  region), one Mumbai role posted 1 week ago (elsewhere), one remote role
  posted 1 week ago, and one Bengaluru role posted 7 weeks ago (stale
  same-city — must NOT outrank the fresh same-city one, but may sit above
  elsewhere). Assertions:
  - ordered first page: Bengaluru-fresh, then (remote | Chennai) above
    Mumbai, with the stale Bengaluru job still above Mumbai;
  - every row carries a `band`, and the Bengaluru rows say `"same_city"`;
  - a seeker with no `geoLocation` and no `profile.location` → 400
    `NEAR_ME_NO_LOCATION`;
  - a seeker whose `profile.location` is "Bangalore" (self-reported alias)
    resolves to "Bengaluru" and ranks its jobs as same-city;
  - anonymous call → 401.
- [ ] **Step 2: run to verify failure** (route 404s today).
- [ ] **Step 3: implement.** Service sketch (exact population and DTO plumbing
  follow `paginate`):

```ts
export async function listNearMeJobs(
  seeker: HydratedDocument<SeekerDocument>,
  query: PaginationQuery,
): Promise<PaginatedResponse<NearMeJobDto>> {
  const city =
    seeker.geoLocation?.city ?? normalizeCity(seeker.profile?.location ?? null)?.city ?? null;
  if (!city) {
    throw AppError.badRequest("NEAR_ME_NO_LOCATION", "Add your area to your profile to see roles near you.");
  }
  // In-memory scoring is bounded by the open board's size (198 today). The day
  // this needs an aggregation, it says so here rather than degrading quietly.
  const docs = await Job.find({ status: mongoose.trusted({ $ne: "closed" }) })
    .populate("company")
    .sort({ createdAt: -1 });
  const viewer = toFitSeekerInput(seeker); // scoreJobForSeeker re-projects; keep its signature
  const ranked = docs
    .map((doc) => {
      const band = distanceBand(city, doc.location ?? "", Boolean(doc.remote));
      const fit = computeJobFit(viewer, toFitJobInput(doc)).score;
      const postedAt = (doc as { createdAt?: Date }).createdAt ?? new Date(0);
      return { doc, band, score: nearMeScore(band, fit, postedAt) };
    })
    .sort((a, b) => b.score - a.score || (b.doc.createdAt?.getTime() ?? 0) - (a.doc.createdAt?.getTime() ?? 0));
  const limit = query.limit ?? 10;
  const page = query.page ?? 1;
  const slice = ranked.slice((page - 1) * limit, page * limit);
  return {
    items: slice.map(({ doc, band }) => ({ ...toJobDto(doc, undefined), band })),
    total: ranked.length,
    page,
    pages: Math.ceil(ranked.length / limit),
  };
}
```

(Adapt to `paginate`'s real viewer/DTO plumbing at execution — the sketch's
contract is the ranking and the band, not the exact mapper call. The
controller resolves the seeker exactly as `resolveFitViewer` does but returns
401/400 rather than degrading to anonymous.)

- [ ] **Step 4: suite + typecheck + lint. Commit.**

---

### Task 3: Frontend — the "Near you" rail and the consent prompt

**Files:**
- Create: `frontend/src/hooks/useNearMeJobs.ts` (react-query on
  `/job/near-me`, staleTime 60s; surfaces the 400 code as
  `state: "no-location"`)
- Create: `frontend/src/components/board/NearYouRail.tsx` (the rail: compact
  rows — title, company, band label; "In {city}" / "Near {city}" / "Remote" /
  "Elsewhere" copy; `useDeviceLocation` + profile-save inside the prompt
  branch, one-time dismiss via `localStorage("near-me-prompt-dismissed")`)
- Modify: `frontend/src/components/Jobs.tsx` (mount the rail above the facet
  board, only for a signed-in seeker — read the file first and follow its
  auth-gating pattern)
- Test: `frontend/tests/nearYouRail.test.tsx`

**Interfaces:**
- Consumes: `useNearMeJobs()` → `{ state: "idle" | "loading" | "ready" | "no-location" | "error"; items: NearMeJobDto[] }`;
  `useDeviceLocation` (P2) and the profile-save call Profile.tsx already
  makes (`POST /user/profile/update` with the `geoLocation` FormData field).
- Produces: `NearYouRail` renders `data-testid="near-you-rail"` when ready,
  the prompt (a "Use my location" button + a dismiss) when `no-location` and
  not dismissed, and nothing otherwise.

- [ ] Failing test first: mock `apiClient.get` for `/job/near-me` (two jobs,
  bands `same_city` and `remote`) → rail renders both with band labels;
  reject with `{ response: { data: { code: "NEAR_ME_NO_LOCATION" } } }` → the
  prompt's "Use my location" button appears; clicking it (geolocation stub +
  reverse stub + profile post stub) makes the rail appear after the near-me
  refetch; dismissal (the dismiss button) hides the prompt and sets the
  localStorage flag. Then wire into Jobs.tsx, run the phone/profile/board
  suites, full frontend suite, lint, typecheck, colour gate. Commit.

---

### Task 4: Docs, release note, ship

- `ARCHITECTURE.md`: the Location section gains the P4 paragraph — the
  composed score, its weights and bands, the in-memory bound note, the rail
  and its consent prompt.
- `SECURITY.md`: nothing new (no new data, no new surface beyond the
  authenticated read) — verify, and if truly nothing, no edit.
- `frontend/src/data/updates.ts`: id `"near-you-ranking"`, kind `Feature`,
  copy: signed-in seekers see a "Near you" rail leading the board, ranked by
  their area, their fit, and freshness; seekers without a stored area are
  offered the one-time consent prompt.
- Full root `npm run ci` + `npm run audit:prod`; push; verify the deployed
  board (release note in the bundle; `GET /job/near-me` unauthenticated →
  401 on prod).

---

## Self-Review

- Spec coverage: bands and remote=2 ✓ (T1), weights ✓ (T1), 8-week decay ✓
  (T1), endpoint + ranking + pagination ✓ (T2), self-reported fallback ✓
  (T2), rail + one-time dismissible prompt ✓ (T3), companies-near-you strip —
  **deliberately descoped**: the spec named it, but the jobs rail is the
  product surface; the same ranked list answers "companies" by reading the
  rail's companies. Recorded as a follow-up candidate, not built half-way.
- Placeholders: T2's service block is a sketch with the contract bolded and
  the authoritative `paginate()` named; everything else is written out.
- Type consistency: `DistanceBand` string literals identical in T1–T3;
  `NEAR_ME_NO_LOCATION` code identical in T2/T3.
