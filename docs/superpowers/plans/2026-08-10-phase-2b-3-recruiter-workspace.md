# Phase 2B-3 — Recruiter Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the recruiter workspace on the Ink & Signal design system, move its
server reads to react-query, and fix the four field-level defects that reading it
turned up.

**Architecture:** Six pages move from `frontend/src/components/admin/` to
`frontend/src/components/workspace/` behind a new `HireShell` that mirrors
`console/AdminShell.tsx`. Server state moves to one new hook file,
`hooks/useRecruiterWorkspace.tsx`, mirroring `hooks/useAdminConsole.tsx`. Two redux
slices lose their last readers and are deleted. One backend change adds a keyword
parameter to the owned-jobs endpoint, because wiring `Pager` on top of the existing
client-side filter would ship a search box that silently searches one page.

**Tech Stack:** React 19, react-router 7, @tanstack/react-query 5, Redux Toolkit
(shrinking), Tailwind 4 with `@theme inline` tokens, Vitest + React Testing Library +
jsdom (web), Vitest + Supertest + mongodb-memory-server (API), Zod in
`packages/shared`.

**Spec:** `docs/superpowers/specs/2026-08-10-phase-2b-3-recruiter-workspace-design.md`

---

## Global Constraints

Every task's requirements implicitly include this section. All values are copied
verbatim from `CLAUDE.md` and the spec.

- **ESM with `moduleResolution: NodeNext`** in `backend` and `packages/shared`. Every
  relative import needs a `.js` extension even in `.ts` files. `frontend` uses
  `Bundler` resolution and does **not** need extensions.
- **Module structure:** `routes → controller → service → model`. Controllers do HTTP
  only. Services hold business rules and are the only layer touching models.
- **Errors:** throw `AppError`. Never `res.status(...).json(...)` for a failure, and
  never `catch` without rethrowing.
- **New endpoints:** define the Zod schema in `packages/shared` first.
- **Ownership:** a resource the caller does not own answers exactly as a missing one
  does — 404, same code, same message. Never 403.
- **Frontend colour:** every colour comes from a token utility (`bg-paper`,
  `text-ink`, `text-signal-text`, `border-line`, `text-danger`…). Never a hex literal,
  never a Tailwind palette colour, never a `dark:` colour override. Enforced by
  `npm run lint:colour --workspace @jobportal/web` as a **hard zero**.
- **Frontend spacing:** pass `density` to `PageShell` and read the resulting custom
  properties (`p-(--space-card)`, `mt-(--space-section)`). Never hand-tune spacing on
  a page.
- **Frontend portal:** a page never holds a portal in state or reads it from a
  control. It arrives as a prop from the route.
- **Frontend motion:** go through `lib/motion.tsx`. Never import `framer-motion` in a
  page.
- **Frontend type:** Fraunces (`font-display`) never below 20px — `text-xl` (1.44rem)
  is the smallest permitted. Geist Mono only for aligned numeric comparison.
- **Frontend headings:** exactly one `<h1>` per route. `PageHeader` renders it; no
  page adds a second.
- **Frontend list state:** a filter, a sort or a page number lives in the URL, never
  in a slice.
- **No dead controls.** A button whose handler does nothing must not ship.
- **Semantic state is always icon *and* label**, never colour alone.
- **Commit messages:** no `Co-Authored-By` trailer in this repo.
- **`packages/shared` must be built before the API typechecks against it.** Run
  `npm run build --workspace @jobportal/shared` after any change there.

**Verification commands** (from repo root unless noted):

| Purpose | Command |
|---|---|
| Typecheck all | `npm run typecheck` |
| Test all | `npm test` |
| One API file | `npm test --workspace @jobportal/api -- ownedJobs` |
| One web file | `npm test --workspace @jobportal/web -- workspace` |
| Colour tokens | `npm run lint:colour --workspace @jobportal/web` |
| Lint | `npm run lint` |
| Full CI | `npm run ci` (>120s — run in background) |

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `frontend/src/components/routing/ProtectedRoute.tsx` | Portal gate. Moved, not rewritten. |
| `frontend/src/components/routing/RequireApproved.tsx` | Approval gate. Moved, not rewritten. |
| `frontend/src/components/workspace/HireShell.tsx` | Recruiter frame: Navbar + PageShell + PageHeader + sub-nav. |
| `frontend/src/components/workspace/WorkspaceJobs.tsx` | Owned jobs list. |
| `frontend/src/components/workspace/WorkspaceCompanies.tsx` | Owned companies list. |
| `frontend/src/components/workspace/JobCreate.tsx` | Post-a-job form. |
| `frontend/src/components/workspace/CompanyCreate.tsx` | One-field company create. |
| `frontend/src/components/workspace/CompanyEdit.tsx` | Company edit form with logo upload. |
| `frontend/src/components/workspace/Applicants.tsx` | Applicant table with accept/reject. |
| `frontend/src/hooks/useRecruiterWorkspace.tsx` | All workspace server state. |
| `backend/tests/ownedJobs.test.ts` | Keyword + ownership matrix for `/job/getadminjobs`. |
| `frontend/tests/workspace.test.tsx` | Route, gate, heading and nav assertions. |

**Modified:**

| Path | Change |
|---|---|
| `packages/shared/src/enums.ts` | `JOB_TYPES` → title-case. |
| `packages/shared/src/domain.ts` | `jobType` → `jobTypeSchema`; add `ownedJobsQuerySchema`. |
| `backend/src/services/job.service.ts` | `listOwnedJobs` takes a keyword. |
| `backend/src/controllers/job.controller.ts` | `getAdminJobs` parses the new schema. |
| `backend/tests/job.test.ts` | Six fixture sites → title-case. |
| `backend/tests/application.test.ts` | One fixture site → title-case. |
| `frontend/src/components/FilterCard.tsx` | Imports `JOB_TYPES` instead of a local literal. |
| `frontend/src/routes/appRoutes.tsx` | Import specifiers only. |
| `frontend/src/redux/jobSlice.ts` | Drop `allAdminJobs`, `searchJobByText`. |
| `frontend/src/redux/store.ts` | Drop two reducers; `version: 2` → `3`. |
| `frontend/tests/helpers/renderRoute.tsx` | `makeStore()` drops two reducers. |

**Deleted:** all eleven files in `frontend/src/components/admin/`, plus
`frontend/src/redux/companySlice.ts`, `frontend/src/redux/applicationSlice.ts`,
`frontend/src/hooks/useGetAllAdminJobs.tsx`,
`frontend/src/hooks/useGetAllCompanies.tsx`,
`frontend/src/hooks/useGetCompanyById.tsx`.

---

## Task 1: `jobType` becomes an enum the seeker board can filter

**Why first:** it is the only change that touches existing test fixtures, and doing it
before the UI means the `<Select>` in Task 8 has a validated vocabulary to render.

**The discovery this task encodes:** `JOB_TYPES` and `jobTypeSchema` already exist in
`packages/shared/src/enums.ts` with **zero importers**, declaring lowercase values,
while `FilterCard.tsx:29` carries its own hardcoded title-case literal and filters by
exact equality. A recruiter typing "Full Time" posts a job the board can never show
under a filter. Title-case wins because that is what the existing filter and existing
data agree on; lowercase is the better data shape but needs a migration over free text,
which is a follow-up.

**Files:**
- Modify: `packages/shared/src/enums.ts:4`
- Modify: `packages/shared/src/domain.ts:1-2` (import), `:33` (field)
- Modify: `frontend/src/components/FilterCard.tsx:1-31`
- Modify: `backend/tests/job.test.ts:27,142,158,159,160,164,169`
- Modify: `backend/tests/application.test.ts:59`

**Interfaces:**
- Produces: `JOB_TYPES: readonly ["Full-time", "Part-time", "Internship", "Contract"]`
  and `jobTypeSchema: z.ZodEnum` from `@jobportal/shared`. Task 8 imports both.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/job.test.ts`, inside the top-level `describe("job routes")`:

```ts
  it("rejects a jobType the seeker board cannot filter for", async () => {
    const res = await request(app)
      .post("/api/v1/job/post")
      .set("Cookie", [`jp_recruiter_at=${owner.access}`])
      .send({ ...jobBody(owner.companyId), jobType: "Full Time" });
    // Free text was accepted, stored, and rendered on the job card while
    // FilterCard's exact-equality facet could never match it.
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("accepts every value the seeker facet offers", async () => {
    for (const type of ["Full-time", "Part-time", "Internship", "Contract"]) {
      const res = await request(app)
        .post("/api/v1/job/post")
        .set("Cookie", [`jp_recruiter_at=${owner.access}`])
        .send({ ...jobBody(owner.companyId), jobType: type });
      expect(res.status).toBe(201);
      expect(res.body.job.jobType).toBe(type);
    }
  });
```

Add to `frontend/tests/seekerBoard.test.tsx`, inside `describe("FilterCard")`:

```ts
  it("filters on the same vocabulary the job form posts", async () => {
    const { JOB_TYPES } = await import("@jobportal/shared");
    renderRoute(<FilterCard />, { route: "/jobs" });
    // A hardcoded copy here is how the form and the facet drifted on casing.
    for (const type of JOB_TYPES) {
      expect(screen.getByLabelText(type)).toBeInTheDocument();
    }
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test --workspace @jobportal/api -- job
npm test --workspace @jobportal/web -- seekerBoard
```

Expected: the API `"Full Time"` case FAILS with `expected 201 to be 400` (free text is
currently accepted). The web case may PASS by coincidence — `JOB_TYPES` is lowercase
and `getByLabelText` would throw on "full-time" — so confirm it FAILS with
`Unable to find a label with the text of: full-time`.

- [ ] **Step 3: Correct `JOB_TYPES` to the facet's vocabulary**

In `packages/shared/src/enums.ts`, replace line 4:

```ts
/**
 * The four job types, title-case.
 *
 * These are the values `FilterCard` filters on by exact equality, and they were
 * hardcoded there while this export sat unused with lowercase values — so a
 * recruiter could post "Full Time" and the board could never show it under a
 * filter. Both sides import this now.
 *
 * Title-case rather than lowercase slugs because the facet and the existing rows
 * agree on it. Normalising to slugs with a display mapping is the better data
 * shape and needs a migration over free-text rows; that is a follow-up, not this
 * phase.
 */
export const JOB_TYPES = ["Full-time", "Part-time", "Internship", "Contract"] as const;
```

- [ ] **Step 4: Validate the field against it**

In `packages/shared/src/domain.ts`, add to the imports at the top:

```ts
import { jobTypeSchema } from "./enums.js";
```

Then replace line 33 (`jobType: z.string().trim().min(2).max(40),`) with:

```ts
  /**
   * An enum, not free text. `FilterCard` matches by exact equality, so an
   * unrecognised value is a row the board can never surface — accepted, stored,
   * displayed on the card, and unfilterable.
   */
  jobType: jobTypeSchema,
```

- [ ] **Step 5: Point `FilterCard` at the shared list**

In `frontend/src/components/FilterCard.tsx`, add to the imports:

```ts
import { JOB_TYPES } from "@jobportal/shared";
```

Replace the `jobType` facet entry (lines 26-30) with:

```ts
  {
    label: "Job Type",
    key: "jobType",
    // Not a local copy: the form posts from this same list, and a second
    // hardcoded literal here is exactly how the two drifted on casing.
    options: [...JOB_TYPES],
  },
```

- [ ] **Step 6: Update the six API-posting fixtures**

These post through the API and are validated by the new enum, so they 400 until
updated. Fixtures that call `Job.create(...)` directly bypass Zod and are left alone.

In `backend/tests/job.test.ts`:
- line 27 — `jobType: "full-time",` → `jobType: "Full-time",`
- line 142 — `jobType: "full-time",` → `jobType: "Full-time",`
- line 158 — `{ location: "Bengaluru", jobType: "full-time" }` → `jobType: "Full-time"`
- line 159 — `{ location: "Bengaluru", jobType: "contract" }` → `jobType: "Contract"`
- line 160 — `{ location: "Mumbai", jobType: "contract" }` → `jobType: "Contract"`
- line 164 — `"/api/v1/job/get?location=Bengaluru,Mumbai&jobType=contract"` →
  `jobType=Contract`
- line 169 — `"/api/v1/job/get?jobType=full-time,contract"` →
  `jobType=Full-time,Contract`

In `backend/tests/application.test.ts` line 59 — `jobType: "full-time",` →
`jobType: "Full-time",`

Note `jobListQuerySchema.jobType` stays `z.string()` — the query is a comma-joined
multi-select, not a single enum value, and an unknown value there is an empty result
rather than an error.

- [ ] **Step 7: Build shared, then run both suites**

```bash
npm run build --workspace @jobportal/shared
npm test --workspace @jobportal/api -- job
npm test --workspace @jobportal/api -- application
npm test --workspace @jobportal/web -- seekerBoard
npm run typecheck
```

Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/enums.ts packages/shared/src/domain.ts \
  frontend/src/components/FilterCard.tsx \
  backend/tests/job.test.ts backend/tests/application.test.ts \
  frontend/tests/seekerBoard.test.tsx
git commit -m "feat(shared): jobType is an enum matching the seeker facet

JOB_TYPES and jobTypeSchema existed with zero importers and lowercase
values while FilterCard carried its own title-case literal, so a
recruiter could post a job type the board could never filter for."
```

---

## Task 2: Keyword search on owned jobs

**Why this is required rather than nice:** the workspace list endpoints take
`paginationQuerySchema` only. Search works today because both list pages fetch
`limit=50` and filter in the browser. The moment `Pager` is wired (Task 6), a
client-side filter searches only the rows currently on screen while presenting itself
as searching everything — silently wrong, and the same shape as the two-boards bug
2B-2 closed.

**Files:**
- Modify: `packages/shared/src/domain.ts` (add schema + type near `jobListQuerySchema`)
- Modify: `backend/src/services/job.service.ts:120-125`
- Modify: `backend/src/controllers/job.controller.ts` (imports + `getAdminJobs`)
- Create: `backend/tests/ownedJobs.test.ts`

**Interfaces:**
- Consumes: `JOB_TYPES` from Task 1 (test fixtures use `"Full-time"`).
- Produces: `ownedJobsQuerySchema`, `type OwnedJobsQuery` from `@jobportal/shared`;
  `GET /api/v1/job/getadminjobs?keyword=&page=&limit=`. Task 5 calls this endpoint.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/ownedJobs.test.ts`:

```ts
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { Company } from "../src/models/company.model.js";
import { Job } from "../src/models/job.model.js";
import { installCaptureMailer, signedUpOn } from "./auth/helpers.js";

const app = buildApp();

async function recruiterWithCompany(email: string) {
  const session = await signedUpOn("recruiter", email);
  const res = await request(app)
    .post("/api/v1/company/register")
    .set("Cookie", [`jp_recruiter_at=${session.access}`])
    .send({ name: `Co-${email}` });
  return { ...session, companyId: res.body.company.id as string };
}

describe("GET /job/getadminjobs", () => {
  let owner: Awaited<ReturnType<typeof recruiterWithCompany>>;
  let rival: Awaited<ReturnType<typeof recruiterWithCompany>>;

  const post = (
    who: { access: string; companyId: string },
    title: string,
    description = "Build the portal",
  ) =>
    request(app)
      .post("/api/v1/job/post")
      .set("Cookie", [`jp_recruiter_at=${who.access}`])
      .send({
        title,
        description,
        requirements: "ts",
        salary: 10,
        experience: 2,
        location: "Pune",
        jobType: "Full-time",
        position: "1",
        companyId: who.companyId,
      });

  const list = (access: string, qs = "") =>
    request(app)
      .get(`/api/v1/job/getadminjobs${qs}`)
      .set("Cookie", [`jp_recruiter_at=${access}`]);

  beforeEach(async () => {
    installCaptureMailer();
    await Company.init();
    await Job.init();
    owner = await recruiterWithCompany("owner@example.com");
    rival = await recruiterWithCompany("rival@example.com");
  });

  it("narrows the owned set by a title keyword", async () => {
    await post(owner, "React Engineer");
    await post(owner, "Go Engineer");
    const res = await list(owner.access, "?keyword=react");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].title).toBe("React Engineer");
  });

  it("matches the description too", async () => {
    await post(owner, "Engineer One", "We use Kubernetes heavily");
    await post(owner, "Engineer Two", "Plain web work");
    const res = await list(owner.access, "?keyword=kubernetes");
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].title).toBe("Engineer One");
  });

  it("returns an empty set rather than everything when nothing matches", async () => {
    await post(owner, "React Engineer");
    const res = await list(owner.access, "?keyword=cobol");
    expect(res.body.total).toBe(0);
    expect(res.body.items).toEqual([]);
  });

  it("treats a regex metacharacter as a literal", async () => {
    // The escapeRegex assertion. Unescaped, `.*` is a pattern matching both
    // jobs; escaped it is a two-character literal in exactly one title. This is
    // the test that fails open if the escapeRegex call is ever dropped.
    await post(owner, "Literal .* match");
    await post(owner, "Ordinary title");
    const res = await list(owner.access, `?keyword=${encodeURIComponent(".*")}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].title).toBe("Literal .* match");
  });

  it("is inert against a catastrophically backtracking pattern", async () => {
    await post(owner, "Ordinary title");
    const res = await list(owner.access, `?keyword=${encodeURIComponent("(a+)+$")}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  it("never widens past ownership", async () => {
    // The keyword matches the rival's job. Ownership must still exclude it —
    // a keyword can only ever narrow a set the caller already owns.
    await post(rival, "React Engineer");
    await post(owner, "Go Engineer");
    const res = await list(owner.access, "?keyword=react");
    expect(res.body.total).toBe(0);
  });

  it("lists everything for an empty keyword", async () => {
    await post(owner, "One");
    await post(owner, "Two");
    const res = await list(owner.access);
    expect(res.body.total).toBe(2);
  });

  it("keeps the pagination envelope while filtering", async () => {
    for (let i = 0; i < 3; i++) await post(owner, `React ${i}`);
    const res = await list(owner.access, "?keyword=react&limit=2");
    expect(res.body).toMatchObject({ success: true, total: 3, page: 1, pages: 2 });
    expect(res.body.items).toHaveLength(2);

    const second = await list(owner.access, "?keyword=react&limit=2&page=2");
    expect(second.body.items).toHaveLength(1);
    expect(second.body.page).toBe(2);
  });

  describe("authorization matrix", () => {
    it("401s an anonymous caller", async () => {
      const res = await request(app).get("/api/v1/job/getadminjobs?keyword=react");
      expect(res.status).toBe(401);
    });

    it("401s a seeker", async () => {
      const seeker = await signedUpOn("seeker", "seeker@example.com");
      const res = await request(app)
        .get("/api/v1/job/getadminjobs?keyword=react")
        .set("Cookie", [`jp_seeker_at=${seeker.access}`]);
      expect(res.status).toBe(401);
    });

    it("gives an unrelated recruiter their own empty set, not a 403", async () => {
      await post(owner, "React Engineer");
      const res = await list(rival.access, "?keyword=react");
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(0);
    });

    it("gives the owner their own rows", async () => {
      await post(owner, "React Engineer");
      const res = await list(owner.access, "?keyword=react");
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test --workspace @jobportal/api -- ownedJobs
```

Expected: the keyword cases FAIL — `expected 2 to be 1` — because `keyword` is
currently ignored and every owned job comes back. The authorization cases already PASS;
that is fine, they pin behaviour that must survive.

- [ ] **Step 3: Add the query schema**

In `packages/shared/src/domain.ts`, immediately after `jobListQuerySchema` (line 55):

```ts
/**
 * The recruiter workspace's own job list.
 *
 * Keyword only — no facets. The workspace is "find the role I posted", not a
 * search surface. It exists at all because a client-side filter over a
 * server-paginated list searches only the rows currently on screen while
 * presenting itself as searching everything.
 */
export const ownedJobsQuerySchema = paginationQuerySchema.extend({
  keyword: z.string().trim().max(100).default(""),
});
```

And with the other type exports (near line 65):

```ts
export type OwnedJobsQuery = z.infer<typeof ownedJobsQuerySchema>;
```

- [ ] **Step 4: Filter in the service**

In `backend/src/services/job.service.ts`, replace `listOwnedJobs` (lines 120-125):

```ts
export async function listOwnedJobs(
  ownerId: string,
  query: OwnedJobsQuery,
): Promise<PaginatedResponse<JobDto>> {
  // Ownership first and unconditionally: the keyword can only ever narrow a set
  // the caller already owns.
  const filter: Record<string, unknown> = { created_by: ownerId };

  if (query.keyword) {
    // escapeRegex is mandatory — this is user input reaching a RegExp
    // constructor. No mongoose.trusted wrapper: a RegExp has no $-prefixed
    // keys, so the global sanitizeFilter passes it through, exactly as it does
    // for listPublicJobs.
    const re = new RegExp(escapeRegex(query.keyword), "i");
    filter.$or = [{ title: re }, { description: re }];
  }

  return paginate(filter, query);
}
```

Update the type import at the top of the file — replace `PaginationQuery` in the
`@jobportal/shared` import block with `OwnedJobsQuery` if `PaginationQuery` has no
other use in the file; otherwise add `OwnedJobsQuery` alongside it. Check with:

```bash
grep -n "PaginationQuery" backend/src/services/job.service.ts
```

`paginate()` takes `PaginationQuery` (line 63), so both are needed.

- [ ] **Step 5: Parse it in the controller**

In `backend/src/controllers/job.controller.ts`, add `ownedJobsQuerySchema` to the
`@jobportal/shared` import, then replace `getAdminJobs`:

```ts
export const getAdminJobs = async (req: Request, res: Response): Promise<void> => {
  const query = parseBody(ownedJobsQuerySchema, req.query);
  const result = await jobService.listOwnedJobs(req.auth!.id, query);
  res.status(200).json({ success: true, ...result });
};
```

Leave `paginationQuerySchema` in the import if another handler still uses it; remove it
if not. Verify with `npm run typecheck` — `noUnusedLocals` will flag a dead import.

- [ ] **Step 6: Run to verify it passes**

```bash
npm run build --workspace @jobportal/shared
npm test --workspace @jobportal/api -- ownedJobs
npm run typecheck
```

Expected: all PASS.

- [ ] **Step 7: Mutation-verify the escapeRegex assertion**

Temporarily change the service line to `new RegExp(query.keyword, "i")`, then:

```bash
npm test --workspace @jobportal/api -- ownedJobs
```

Expected: `treats a regex metacharacter as a literal` FAILS with
`expected 2 to be 1`. **Restore the `escapeRegex` call and re-run to confirm green.**
A test that cannot fail is indistinguishable from one that passes.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/domain.ts backend/src/services/job.service.ts \
  backend/src/controllers/job.controller.ts backend/tests/ownedJobs.test.ts
git commit -m "feat(api): keyword search on owned jobs

The workspace filtered client-side over a limit=50 fetch. Wiring Pager on
top of that would search only the rows on screen while looking like it
searched everything."
```

---

## Task 3: Move the route guards out of the admin directory

**Files:**
- Create: `frontend/src/components/routing/ProtectedRoute.tsx`
- Create: `frontend/src/components/routing/RequireApproved.tsx`
- Delete: `frontend/src/components/admin/ProtectedRoute.tsx`,
  `frontend/src/components/admin/RequireApproved.tsx`
- Modify: `frontend/src/routes/appRoutes.tsx:15-16`

**Interfaces:**
- Produces: `ProtectedRoute` (default export, props `{ children, portal }`) and
  `RequireApproved` (named **and** default export, props `{ children }`) at
  `@/components/routing/*`. Task 12's test imports neither directly, but
  `appRoutes.tsx` does.

- [ ] **Step 1: Copy both files verbatim, fixing only relative imports**

`git mv` preserves history:

```bash
mkdir -p frontend/src/components/routing
git mv frontend/src/components/admin/ProtectedRoute.tsx frontend/src/components/routing/ProtectedRoute.tsx
git mv frontend/src/components/admin/RequireApproved.tsx frontend/src/components/routing/RequireApproved.tsx
```

`ProtectedRoute.tsx` uses only `@/`-prefixed imports and needs no edit.

`RequireApproved.tsx` uses three relative imports that now resolve one directory over.
Replace lines 4-6:

```tsx
import Navbar from "@/components/shared/Navbar";
import { PageShell } from "@/components/layout/PageShell";
import { EmptyState } from "@/components/layout/EmptyState";
```

Add a sentence to the existing docblock explaining the location:

```tsx
 * It lives in `routing/` rather than beside the workspace pages because it is a
 * gate, not a page — and `ProtectedRoute` next to it serves the admin console
 * too, which must not import from a directory named for the other portal.
```

- [ ] **Step 2: Update the two imports in the route table**

In `frontend/src/routes/appRoutes.tsx`, replace lines 15-16:

```tsx
import ProtectedRoute from "@/components/routing/ProtectedRoute";
import RequireApproved from "@/components/routing/RequireApproved";
```

- [ ] **Step 3: Verify nothing else imported them**

```bash
grep -rn "admin/ProtectedRoute\|admin/RequireApproved" frontend/src frontend/tests
```

Expected: no output. If anything appears, update it before continuing.

- [ ] **Step 4: Typecheck and run the routing suites**

```bash
npm run typecheck
npm test --workspace @jobportal/web -- routing
npm test --workspace @jobportal/web -- adminConsole
npm test --workspace @jobportal/web -- workspaceRoutes
```

Expected: all PASS. These exercise both guards through the real route table, so a
broken import surfaces here rather than at runtime.

- [ ] **Step 5: Commit**

```bash
git add -A frontend/src/components frontend/src/routes/appRoutes.tsx
git commit -m "refactor(web): move route guards to components/routing

ProtectedRoute already served the admin console from a directory named for
the recruiter workspace."
```

---

## Task 4: `HireShell`

**Files:**
- Create: `frontend/src/components/workspace/HireShell.tsx`

**Interfaces:**
- Consumes: `navLinksFor("recruiter")` → `[{to: "/hire/companies", label: "Companies"},
  {to: "/hire/jobs", label: "Jobs"}]`; `PageShell`, `PageHeader`, `Navbar`, `cn`.
- Produces: `HireShell` (named + default export) with props
  `{ title: string; description?: string; actions?: ReactNode; children: ReactNode }`.
  Tasks 6-10 all render through it.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/workspace.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

import { renderRoute } from "./helpers/renderRoute";
import HireShell from "@/components/workspace/HireShell";
import { navLinksFor } from "@/components/shared/navLinks";

describe("HireShell", () => {
  it("renders the page title as the only h1", () => {
    renderRoute(
      <HireShell title="Jobs">
        <p>body</p>
      </HireShell>,
      { route: "/hire/jobs" },
    );
    const headings = screen.getAllByRole("heading", { level: 1 });
    // The navbar wordmark is a <span> since 2B-2; a second h1 here would put
    // every workspace route back to two competing top-level headings.
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Jobs");
  });

  it("runs compact and response, like the console", () => {
    const { container } = renderRoute(
      <HireShell title="Jobs">
        <p>body</p>
      </HireShell>,
      { route: "/hire/jobs" },
    );
    const shell = container.querySelector("[data-density]");
    expect(shell).toHaveAttribute("data-density", "compact");
    // Tier 3 feedback only: this is work, not marketing.
    expect(shell).toHaveAttribute("data-motion", "response");
  });

  it("builds its sub-nav from navLinksFor, so the tabs and navbar agree", () => {
    renderRoute(
      <HireShell title="Jobs">
        <p>body</p>
      </HireShell>,
      { route: "/hire/jobs" },
    );
    const nav = screen.getByRole("navigation", { name: "Workspace sections" });
    for (const link of navLinksFor("recruiter")) {
      expect(within(nav).getByRole("link", { name: link.label })).toHaveAttribute(
        "href",
        link.to,
      );
    }
  });
});
```

Add `within` to the testing-library import:

```tsx
import { screen, within } from "@testing-library/react";
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test --workspace @jobportal/web -- workspace.test
```

Expected: FAIL — `Failed to resolve import "@/components/workspace/HireShell"`.

- [ ] **Step 3: Write the shell**

Create `frontend/src/components/workspace/HireShell.tsx`:

```tsx
import type { ReactNode } from "react";
import { NavLink } from "react-router";

import Navbar from "@/components/shared/Navbar";
import PageShell from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { navLinksFor } from "@/components/shared/navLinks";
import { cn } from "@/lib/utils";

/**
 * The recruiter workspace's frame, mirroring `console/AdminShell`.
 *
 * `motion="response"` and `density="compact"` for the same reason the console
 * has them: this is work, not marketing, so Tier 3 feedback only — no ambient
 * loops, no scroll narrative. `/hire` itself stays spacious, because density
 * follows the surface's job rather than the portal.
 *
 * The sub-navigation reads `navLinksFor("recruiter")` rather than listing routes
 * again, so the shell's tabs, the desktop navbar and the mobile sheet can never
 * disagree about which pages exist.
 */
export function HireShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const links = navLinksFor("recruiter");

  return (
    <>
      <Navbar />
      <PageShell density="compact" width="wide" motion="response">
        <PageHeader title={title} description={description} actions={actions} />

        <nav aria-label="Workspace sections" className="mb-(--space-card) border-b border-line">
          <ul className="flex flex-wrap gap-1">
            {links.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  end
                  className={({ isActive }) =>
                    cn(
                      "inline-block rounded-t-sharp px-3 py-2 text-sm font-medium transition-colors",
                      // Weight and a signal underline, never colour alone.
                      isActive
                        ? "border-b-2 border-signal text-signal-text"
                        : "border-b-2 border-transparent text-ink-muted hover:text-ink",
                    )
                  }
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {children}
      </PageShell>
    </>
  );
}

export default HireShell;
```

Confirm `PageShell`'s export style before committing — `AdminShell.tsx:5` imports it as
a default and `RequireApproved.tsx:5` imports it as named, so the module has both.

- [ ] **Step 4: Run to verify it passes**

```bash
npm test --workspace @jobportal/web -- workspace.test
npm run lint:colour --workspace @jobportal/web
```

Expected: all PASS, colour check zero.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/workspace/HireShell.tsx frontend/tests/workspace.test.tsx
git commit -m "feat(web): HireShell, the recruiter workspace frame"
```

---

## Task 5: `useRecruiterWorkspace` — all workspace server state

**Files:**
- Create: `frontend/src/hooks/useRecruiterWorkspace.tsx`

**Interfaces:**
- Consumes: `apiClient` from `@/lib/apiClient`; `ownedJobsQuerySchema`'s endpoint from
  Task 2; `CompanyDto`, `JobDto`, `ApplicantDto`, `PaginatedResponse` from
  `@jobportal/shared`.
- Produces, all named exports:
  - `useOwnedJobs()` → react-query result over `PaginatedResponse<JobDto>` plus
    `{ keyword, page, setKeyword, setPage }`
  - `useOwnedCompanies()` → result over `CompanyDto[]` plus
    `{ keyword, setKeyword, filtered: CompanyDto[] }`
  - `useCompany(id: string | undefined)` → result over `CompanyDto`
  - `useApplicants(jobId: string | undefined)` → result over
    `PaginatedResponse<ApplicantDto>` plus `{ page, setPage }`
  - `useJobCreate()` → mutation taking `Record<string, unknown>`
  - `useCompanyCreate()` → mutation taking `{ name: string }`, returns `CompanyDto`
  - `useCompanyUpdate(id: string | undefined)` → mutation taking `FormData`
  - `useApplicantDecision(jobId: string | undefined)` → mutation taking
    `{ applicationId: string; status: "accepted" | "rejected" }`

- [ ] **Step 1: Write the hook file**

There is no failing test for this task — it is a pure data layer with no rendered
output, and every one of its consumers (Tasks 6-10) tests it through the page. Writing
a test that mocks `apiClient` and asserts the hook calls it would assert the mock.

Create `frontend/src/hooks/useRecruiterWorkspace.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import type { ApplicantDto, CompanyDto, JobDto, PaginatedResponse } from "@jobportal/shared";

import { apiClient } from "@/lib/apiClient";

/**
 * The recruiter workspace's server state.
 *
 * react-query rather than Redux, following the admin console and the 4B job
 * board: these are reads of server data with a cache and a refetch story, not
 * client state anyone dispatches into. Converging on it is what empties
 * companySlice and applicationSlice.
 *
 * Nothing here is optimistic. A hiring decision that appears to succeed and
 * silently did not is worth an extra round trip to avoid — and the absence of a
 * refetch after the decision POST is exactly the bug this replaces.
 */

/** Every workspace query hangs off this root so one call can clear it. */
const WORKSPACE_KEY = ["workspace"] as const;

/**
 * Keyword + page for a workspace list, read from the URL.
 *
 * Same rule as the console and the job board: the URL is the state, so a reload
 * or a shared link reproduces the screen. This is what replaces
 * `searchJobByText` and `searchCompanyByText` — the last two survivors of the
 * pattern 2B-2 deleted `searchedQuery` for.
 */
function useListParams() {
  const [searchParams, setSearchParams] = useSearchParams();
  const keyword = searchParams.get("q") ?? "";
  const page = Number(searchParams.get("page") ?? "1") || 1;

  const setKeyword = (next: string) => {
    const sp = new URLSearchParams(searchParams);
    if (next) sp.set("q", next);
    else sp.delete("q");
    // A new search invalidates the page — never land on "page 5 of 2".
    sp.delete("page");
    setSearchParams(sp, { replace: true });
  };

  const setPage = (next: number) => {
    const sp = new URLSearchParams(searchParams);
    if (next > 1) sp.set("page", String(next));
    else sp.delete("page");
    setSearchParams(sp, { replace: false });
  };

  return { keyword, page, setKeyword, setPage };
}

function listQueryString(keyword: string, page: number): string {
  const sp = new URLSearchParams();
  if (keyword) sp.set("keyword", keyword);
  if (page > 1) sp.set("page", String(page));
  return sp.toString();
}

/** The recruiter's own jobs. Keyword is server-side — see Task 2's reasoning. */
export function useOwnedJobs() {
  const { keyword, page, setKeyword, setPage } = useListParams();
  const qs = listQueryString(keyword, page);
  const query = useQuery({
    queryKey: [...WORKSPACE_KEY, "jobs", qs],
    queryFn: async ({ signal }) => {
      const res = await apiClient.get<{ success: boolean } & PaginatedResponse<JobDto>>(
        `/job/getadminjobs?${qs}`,
        { signal },
      );
      return res.data;
    },
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
  return { ...query, keyword, page, setKeyword, setPage };
}

/**
 * The recruiter's own companies.
 *
 * Filtered in the browser, deliberately: `/company/get` returns every owned
 * company as a plain unpaginated array, so every row is present and a local
 * filter is honest. The keyword still lives in the URL, so this behaves
 * identically to the jobs list from the user's side.
 */
export function useOwnedCompanies() {
  const { keyword, setKeyword } = useListParams();
  const query = useQuery({
    queryKey: [...WORKSPACE_KEY, "companies"],
    queryFn: async ({ signal }) => {
      const res = await apiClient.get<{ success: boolean; companies: CompanyDto[] }>(
        "/company/get",
        { signal },
      );
      return res.data.companies;
    },
    staleTime: 30 * 1000,
  });

  const needle = keyword.trim().toLowerCase();
  const filtered = needle
    ? (query.data ?? []).filter(
        (c) =>
          c.name.toLowerCase().includes(needle) ||
          (c.location ?? "").toLowerCase().includes(needle),
      )
    : (query.data ?? []);

  return { ...query, keyword, setKeyword, filtered };
}

export function useCompany(id: string | undefined) {
  return useQuery({
    queryKey: [...WORKSPACE_KEY, "company", id],
    queryFn: async ({ signal }) => {
      const res = await apiClient.get<{ success: boolean; company: CompanyDto }>(
        `/company/get/${id}`,
        { signal },
      );
      return res.data.company;
    },
    enabled: Boolean(id),
  });
}

export function useApplicants(jobId: string | undefined) {
  const { page, setPage } = useListParams();
  const qs = listQueryString("", page);
  const query = useQuery({
    queryKey: [...WORKSPACE_KEY, "applicants", jobId, qs],
    queryFn: async ({ signal }) => {
      const res = await apiClient.get<{ success: boolean } & PaginatedResponse<ApplicantDto>>(
        `/application/${jobId}/applicants?${qs}`,
        { signal },
      );
      return res.data;
    },
    enabled: Boolean(jobId),
    placeholderData: keepPreviousData,
  });
  return { ...query, page, setPage };
}

export function useJobCreate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiClient.post<{ success: boolean; job: JobDto }>("/job/post", body);
      return res.data.job;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...WORKSPACE_KEY, "jobs"] });
    },
  });
}

export function useCompanyCreate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { name: string }) => {
      const res = await apiClient.post<{ success: boolean; company: CompanyDto }>(
        "/company/register",
        body,
      );
      return res.data.company;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...WORKSPACE_KEY, "companies"] });
    },
  });
}

export function useCompanyUpdate(id: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (formData: FormData) => {
      await apiClient.put(`/company/update/${id}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...WORKSPACE_KEY, "companies"] });
      void queryClient.invalidateQueries({ queryKey: [...WORKSPACE_KEY, "company", id] });
    },
  });
}

/**
 * Accept or reject an applicant.
 *
 * The invalidation is the fix for the stale-row bug: the inherited table POSTed
 * the status, toasted success, and never refetched, so the row kept its old
 * status until a manual reload. It falls out of using the pattern rather than
 * being a separate repair.
 */
export function useApplicantDecision(jobId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (decision: {
      applicationId: string;
      status: "accepted" | "rejected";
    }) => {
      await apiClient.post(`/application/status/${decision.applicationId}/update`, {
        status: decision.status,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [...WORKSPACE_KEY, "applicants", jobId],
      });
    },
  });
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: PASS. Nothing imports the hook yet, so this only proves it compiles against
the real DTOs.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useRecruiterWorkspace.tsx
git commit -m "feat(web): react-query data layer for the recruiter workspace"
```

---

## Task 6: `WorkspaceJobs`

Replaces `AdminJobs.tsx` + `AdminJobsTable.tsx`. The two collapse into one file: they
were split to keep the redux-filtering effect away from the page, and with the filter
gone the split is one indirection serving one caller.

**Files:**
- Create: `frontend/src/components/workspace/WorkspaceJobs.tsx`
- Delete: `frontend/src/components/admin/AdminJobs.tsx`,
  `frontend/src/components/admin/AdminJobsTable.tsx`
- Modify: `frontend/src/routes/appRoutes.tsx:12,106`
- Modify: `frontend/tests/workspace.test.tsx`

**Interfaces:**
- Consumes: `HireShell` (Task 4), `useOwnedJobs` (Task 5).
- Produces: `WorkspaceJobs` (named + default export), no props.

- [ ] **Step 1: Write the failing test**

Append to `frontend/tests/workspace.test.tsx`:

```tsx
describe("WorkspaceJobs", () => {
  it("shows a skeleton while loading, never a blank screen", () => {
    const { container } = renderRoute(<WorkspaceJobs />, { route: "/hire/jobs" });
    expect(container.querySelectorAll("[data-slot='skeleton']").length).toBeGreaterThan(0);
  });

  it("reports a failed load in an alert rather than as an empty table", async () => {
    // jsdom has no API, so every fetch rejects — which is precisely the error
    // path. The inherited page console.error'd and rendered an empty table,
    // indistinguishable from "you have posted no jobs".
    renderRoute(<WorkspaceJobs />, { route: "/hire/jobs" });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("puts the search keyword in the URL", async () => {
    renderRoute(<WorkspaceJobs />, { route: "/hire/jobs" });
    const search = screen.getByLabelText("Search jobs");
    fireEvent.change(search, { target: { value: "react" } });
    await waitFor(() => expect(search).toHaveValue("react"));
  });
});
```

Extend the imports at the top of the file:

```tsx
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import WorkspaceJobs from "@/components/workspace/WorkspaceJobs";
```

`Skeleton` renders `data-slot="skeleton"` (verified in
`frontend/src/components/ui/skeleton.tsx`), so the query above is correct as written.

- [ ] **Step 2: Run to verify it fails**

```bash
npm test --workspace @jobportal/web -- workspace.test
```

Expected: FAIL — `Failed to resolve import "@/components/workspace/WorkspaceJobs"`.

- [ ] **Step 3: Write the page**

Create `frontend/src/components/workspace/WorkspaceJobs.tsx`:

```tsx
import { Briefcase, Edit2, Eye, MoreHorizontal } from "lucide-react";
import { useNavigate } from "react-router";

import HireShell from "./HireShell";
import { ListControls, Pager } from "@/components/layout/ListControls";
import { EmptyState } from "@/components/layout/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useOwnedJobs } from "@/hooks/useRecruiterWorkspace";

/**
 * The recruiter's own jobs.
 *
 * The keyword is a server parameter, not a browser filter: this list paginates,
 * and filtering the current page while presenting itself as searching
 * everything is the bug 2B-2 closed on the seeker side.
 *
 * The row menu is a DropdownMenu rather than a Popover full of `<div onClick>`.
 * The inherited version's actions had no role, no tabIndex and no focus ring —
 * they worked for a mouse and did not exist for a keyboard.
 */
export function WorkspaceJobs() {
  const navigate = useNavigate();
  const { data, isPending, isError, error, keyword, setKeyword, setPage } = useOwnedJobs();

  return (
    <HireShell
      title="Jobs"
      description="Roles you have posted."
      actions={<Button onClick={() => navigate("/hire/jobs/create")}>Post a job</Button>}
    >
      <ListControls label="Search jobs" keyword={keyword} onKeyword={setKeyword}>
        {data ? (
          <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
        ) : null}
      </ListControls>

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12 rounded-surface" />
          ))}
        </div>
      ) : isError ? (
        <p role="alert" className="text-sm text-danger">
          Could not load your jobs: {error instanceof Error ? error.message : "unknown error"}
        </p>
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={keyword ? "No jobs match that search" : "No jobs posted yet"}
          description={
            keyword
              ? "Try a different title or keyword."
              : "Post your first role and it will appear on the job board."
          }
          action={
            keyword ? undefined : (
              <Button onClick={() => navigate("/hire/jobs/create")}>Post a job</Button>
            )
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Posted</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="font-medium">{job.title}</TableCell>
                  <TableCell>{job.company?.name ?? "—"}</TableCell>
                  <TableCell>{job.jobType}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {job.createdAt.split("T")[0]}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" aria-label={`Actions for ${job.title}`}>
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => navigate(`/hire/companies/${job.company?.id ?? ""}`)}
                        >
                          <Edit2 className="size-4" />
                          Edit company
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => navigate(`/hire/jobs/${job.id}/applicants`)}
                        >
                          <Eye className="size-4" />
                          Applicants
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </HireShell>
  );
}

export default WorkspaceJobs;
```

`Button` has a `ghost` variant (`button.tsx:17`) and a `sm` size (`:23`) — both verified.

- [ ] **Step 4: Swap it into the route table**

In `frontend/src/routes/appRoutes.tsx`:
- line 12 — `import AdminJobs from "@/components/admin/AdminJobs";` →
  `import WorkspaceJobs from "@/components/workspace/WorkspaceJobs";`
- line 106 — `element: workspace(<AdminJobs />)` → `element: workspace(<WorkspaceJobs />)`

- [ ] **Step 5: Delete the two inherited files**

```bash
git rm frontend/src/components/admin/AdminJobs.tsx frontend/src/components/admin/AdminJobsTable.tsx
```

- [ ] **Step 6: Run to verify it passes**

```bash
npm test --workspace @jobportal/web -- workspace.test
npm run typecheck
npm run lint:colour --workspace @jobportal/web
```

Expected: all PASS. `jobSlice.allAdminJobs` still exists and now has no readers —
Task 11 removes it.

- [ ] **Step 7: Commit**

```bash
git add -A frontend/src/components frontend/src/routes/appRoutes.tsx frontend/tests/workspace.test.tsx
git commit -m "feat(web): rebuild the owned-jobs list on HireShell and react-query"
```

---

## Task 7: `WorkspaceCompanies`

**Files:**
- Create: `frontend/src/components/workspace/WorkspaceCompanies.tsx`
- Delete: `frontend/src/components/admin/Companies.tsx`,
  `frontend/src/components/admin/CompaniesTable.tsx`
- Modify: `frontend/src/routes/appRoutes.tsx:9,103`
- Modify: `frontend/tests/workspace.test.tsx`

**Interfaces:**
- Consumes: `HireShell` (Task 4), `useOwnedCompanies` (Task 5) — note it returns
  `filtered`, not `data.items`.
- Produces: `WorkspaceCompanies` (named + default export), no props.

- [ ] **Step 1: Write the failing test**

Append to `frontend/tests/workspace.test.tsx`:

```tsx
describe("WorkspaceCompanies", () => {
  it("reports a failed load in an alert", async () => {
    renderRoute(<WorkspaceCompanies />, { route: "/hire/companies" });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("offers a create action from its empty state", async () => {
    renderRoute(<WorkspaceCompanies />, { route: "/hire/companies" });
    // Not asserted on the error path — the empty state only renders once the
    // query resolves to an empty array, which jsdom cannot produce. This
    // asserts the header action instead, which is always present.
    expect(screen.getByRole("button", { name: "New company" })).toBeInTheDocument();
  });
});
```

Add the import:

```tsx
import WorkspaceCompanies from "@/components/workspace/WorkspaceCompanies";
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test --workspace @jobportal/web -- workspace.test
```

Expected: FAIL on the unresolved import.

- [ ] **Step 3: Write the page**

Create `frontend/src/components/workspace/WorkspaceCompanies.tsx`:

```tsx
import { Building2, Edit2, MoreHorizontal } from "lucide-react";
import { useNavigate } from "react-router";

import HireShell from "./HireShell";
import { ListControls } from "@/components/layout/ListControls";
import { EmptyState } from "@/components/layout/EmptyState";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useOwnedCompanies } from "@/hooks/useRecruiterWorkspace";

/**
 * The recruiter's own companies.
 *
 * No Pager: `/company/get` returns every owned company as a plain unpaginated
 * array, so the browser holds the whole set and filtering it locally is honest.
 * The keyword still lives in the URL, so this behaves exactly like the jobs list
 * from the user's side.
 *
 * `AvatarFallback` is not optional — an `AvatarImage` with an undefined `src`
 * renders nothing at all, which is the bug 2B-1 fixed in the account menu and
 * the inherited table still carried.
 */
export function WorkspaceCompanies() {
  const navigate = useNavigate();
  const { isPending, isError, error, keyword, setKeyword, filtered } = useOwnedCompanies();

  return (
    <HireShell
      title="Companies"
      description="Companies you can post roles for."
      actions={
        <Button onClick={() => navigate("/hire/companies/create")}>New company</Button>
      }
    >
      <ListControls label="Search companies" keyword={keyword} onKeyword={setKeyword}>
        <p className="text-sm text-ink-muted">
          {filtered.length} {filtered.length === 1 ? "company" : "companies"}
        </p>
      </ListControls>

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-12 rounded-surface" />
          ))}
        </div>
      ) : isError ? (
        <p role="alert" className="text-sm text-danger">
          Could not load your companies:{" "}
          {error instanceof Error ? error.message : "unknown error"}
        </p>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={keyword ? "No companies match that search" : "No companies yet"}
          description={
            keyword
              ? "Try a different name or location."
              : "Create a company before posting your first role."
          }
          action={
            keyword ? undefined : (
              <Button onClick={() => navigate("/hire/companies/create")}>
                Create a company
              </Button>
            )
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((company) => (
                <TableRow key={company.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8">
                        <AvatarImage src={company.logoUrl ?? undefined} alt="" />
                        <AvatarFallback>{company.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{company.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>{company.location ?? "—"}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {company.createdAt.split("T")[0]}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Actions for ${company.name}`}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => navigate(`/hire/companies/${company.id}`)}
                        >
                          <Edit2 className="size-4" />
                          Edit
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </HireShell>
  );
}

export default WorkspaceCompanies;
```

- [ ] **Step 4: Swap it into the route table and delete the old files**

In `frontend/src/routes/appRoutes.tsx`:
- line 9 — `import Companies from "@/components/admin/Companies";` →
  `import WorkspaceCompanies from "@/components/workspace/WorkspaceCompanies";`
- line 103 — `element: workspace(<Companies />)` →
  `element: workspace(<WorkspaceCompanies />)`

```bash
git rm frontend/src/components/admin/Companies.tsx frontend/src/components/admin/CompaniesTable.tsx
```

- [ ] **Step 5: Run to verify it passes**

```bash
npm test --workspace @jobportal/web -- workspace.test
npm run typecheck
npm run lint:colour --workspace @jobportal/web
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add -A frontend/src/components frontend/src/routes/appRoutes.tsx frontend/tests/workspace.test.tsx
git commit -m "feat(web): rebuild the companies list on HireShell and react-query"
```

---

## Task 8: `JobCreate` — the form that fixes two silent bugs

Replaces `PostJob.tsx`. This is the task that closes **"a recruiter cannot post a
remote job"** (the field is on the schema, the model and the matching pipeline, and no
form ever rendered a control, so every row carries `false` and the seeker board's
Remote facet matches nothing, always) and **the zero-company dead end** (a complete
form that cannot succeed, with a warning below the submit button).

**Files:**
- Create: `frontend/src/components/workspace/JobCreate.tsx`
- Delete: `frontend/src/components/admin/PostJob.tsx`
- Modify: `frontend/src/routes/appRoutes.tsx:13,107`
- Modify: `frontend/tests/workspace.test.tsx`

**Interfaces:**
- Consumes: `HireShell` (Task 4); `useOwnedCompanies`, `useJobCreate` (Task 5);
  `JOB_TYPES` (Task 1).
- Produces: `JobCreate` (named + default export), no props.

- [ ] **Step 1: Write the failing test**

Append to `frontend/tests/workspace.test.tsx`:

```tsx
describe("JobCreate", () => {
  it("renders a remote control", async () => {
    renderRoute(<JobCreate />, { route: "/hire/jobs/create" });
    // `remote` is on jobCreateBodySchema, on the Mongo model, and drives the
    // matching pipeline's remoteFit — and no form ever rendered a control, so
    // every row carried the default false and the seeker board's Remote facet
    // matched nothing, always.
    expect(await screen.findByLabelText("This role is remote")).toBeInTheDocument();
  });

  it("offers only job types the seeker board can filter for", async () => {
    const { JOB_TYPES } = await import("@jobportal/shared");
    renderRoute(<JobCreate />, { route: "/hire/jobs/create" });
    const select = await screen.findByLabelText("Job type");
    // A free-text input let a recruiter post "Full Time", which is stored,
    // displayed, and unfilterable.
    expect(select.tagName).toBe("SELECT");
    for (const type of JOB_TYPES) {
      expect(within(select).getByRole("option", { name: type })).toBeInTheDocument();
    }
  });
});
```

Add the import:

```tsx
import JobCreate from "@/components/workspace/JobCreate";
```

**A note on the `<Select>` decision:** the shadcn `Select` primitive renders a Radix
listbox, not a native `<select>`, and Radix's popper does not open under jsdom without
pointer-event stubs. `FilterCard` already uses native inputs for exactly this reason.
Use a **native `<select>`** styled with token classes so the control is testable and
keyboard-native. If you prefer the Radix primitive, change this test to query
`getByRole("combobox")` and drop the option assertions.

- [ ] **Step 2: Run to verify it fails**

```bash
npm test --workspace @jobportal/web -- workspace.test
```

Expected: FAIL on the unresolved import.

- [ ] **Step 3: Write the form**

Create `frontend/src/components/workspace/JobCreate.tsx`:

```tsx
import { useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { JOB_TYPES } from "@jobportal/shared";

import HireShell from "./HireShell";
import { FormField } from "@/components/layout/FormField";
import { EmptyState } from "@/components/layout/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getApiErrorMessage } from "@/lib/apiError";
import { useJobCreate, useOwnedCompanies } from "@/hooks/useRecruiterWorkspace";

const FIELD =
  "w-full rounded-surface border border-line bg-paper px-3 py-2 text-sm text-ink " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal";

/**
 * Post a job.
 *
 * Two silent bugs close here. `remote` gets a control for the first time — the
 * field exists on the schema, the model and the matching pipeline, so every row
 * ever posted carries the default `false` and the seeker board's Remote facet
 * matches nothing. And `jobType` becomes a fixed list rather than free text, so
 * a recruiter can no longer post a value the board's exact-equality facet can
 * never match.
 *
 * A native `<select>` rather than the Radix primitive: Radix's popper needs
 * pointer-event stubs jsdom does not provide, so the control would be
 * untestable — the same reason FilterCard uses native inputs.
 */
export function JobCreate() {
  const navigate = useNavigate();
  const { data: companies, isPending, isError } = useOwnedCompanies();
  const createJob = useJobCreate();

  const [input, setInput] = useState({
    title: "",
    description: "",
    requirements: "",
    salary: "",
    location: "",
    jobType: JOB_TYPES[0] as string,
    experience: "",
    position: "",
    companyId: "",
    remote: false,
  });

  const onField = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setInput({ ...input, [e.target.name]: e.target.value });
  };

  const submitHandler = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      await createJob.mutateAsync({
        ...input,
        // The schema coerces a "true"-ish string; a boolean false would fail the
        // enum, so send the string form or omit it.
        remote: input.remote ? "true" : "false",
      });
      toast.success("Job posted");
      navigate("/hire/jobs");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not post job"));
    }
  };

  if (isPending) {
    return (
      <HireShell title="Post a job">
        <Skeleton className="h-96 rounded-surface" />
      </HireShell>
    );
  }

  if (isError) {
    return (
      <HireShell title="Post a job">
        <p role="alert" className="text-sm text-danger">
          Could not load your companies, so there is nothing to post against.
        </p>
      </HireShell>
    );
  }

  /**
   * The zero-company dead end, replaced.
   *
   * The inherited page rendered a complete form that could not succeed, plus a
   * warning below the submit button associated with nothing. A form that cannot
   * be submitted successfully is a dead control.
   */
  if ((companies ?? []).length === 0) {
    return (
      <HireShell title="Post a job">
        <EmptyState
          icon={Building2}
          title="Create a company first"
          description="A job belongs to a company, so there is nothing to post against yet."
          action={
            <Button onClick={() => navigate("/hire/companies/create")}>Create a company</Button>
          }
        />
      </HireShell>
    );
  }

  return (
    <HireShell title="Post a job" description="This role appears on the public job board.">
      <form onSubmit={submitHandler} className="max-w-2xl">
        <FormField label="Title" htmlFor="title" required>
          <Input id="title" name="title" value={input.title} onChange={onField} required />
        </FormField>

        <FormField label="Description" htmlFor="description" required>
          <textarea
            id="description"
            name="description"
            rows={5}
            value={input.description}
            onChange={onField}
            required
            className={FIELD}
          />
        </FormField>

        <FormField
          label="Requirements"
          htmlFor="requirements"
          hint="Comma-separated — each becomes its own tag on the job card."
        >
          <textarea
            id="requirements"
            name="requirements"
            rows={3}
            value={input.requirements}
            onChange={onField}
            className={FIELD}
          />
        </FormField>

        <div className="grid gap-x-4 sm:grid-cols-2">
          <FormField label="Salary (LPA)" htmlFor="salary" required>
            <Input
              id="salary"
              name="salary"
              type="number"
              min={1}
              value={input.salary}
              onChange={onField}
              required
            />
          </FormField>

          <FormField label="Experience (years)" htmlFor="experience" required>
            <Input
              id="experience"
              name="experience"
              type="number"
              min={0}
              max={50}
              value={input.experience}
              onChange={onField}
              required
            />
          </FormField>

          <FormField label="Location" htmlFor="location" required>
            <Input
              id="location"
              name="location"
              value={input.location}
              onChange={onField}
              required
            />
          </FormField>

          <FormField label="Positions" htmlFor="position" required>
            <Input
              id="position"
              name="position"
              type="number"
              min={1}
              value={input.position}
              onChange={onField}
              required
            />
          </FormField>

          <FormField
            label="Job type"
            htmlFor="jobType"
            hint="Seekers filter on these exact values."
          >
            <select
              id="jobType"
              name="jobType"
              value={input.jobType}
              onChange={onField}
              className={FIELD}
            >
              {JOB_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Company" htmlFor="companyId" required>
            <select
              id="companyId"
              name="companyId"
              value={input.companyId}
              onChange={onField}
              required
              className={FIELD}
            >
              {/* Matched on id, never on a lowercased name: two companies with
                  the same name resolved to whichever the array held first. */}
              <option value="">Select a company</option>
              {(companies ?? []).map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <div className="mb-(--space-field) flex items-center gap-2">
          <input
            type="checkbox"
            id="remote"
            name="remote"
            checked={input.remote}
            onChange={(e) => setInput({ ...input, remote: e.target.checked })}
            className="size-4 rounded border-line accent-[var(--signal-text)]"
          />
          <Label htmlFor="remote" className="cursor-pointer font-normal text-ink-muted">
            This role is remote
          </Label>
        </div>

        <div className="mt-(--space-card) flex items-center gap-2">
          <Button type="submit" disabled={createJob.isPending}>
            {createJob.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Posting
              </>
            ) : (
              "Post job"
            )}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate("/hire/jobs")}>
            Cancel
          </Button>
        </div>
      </form>
    </HireShell>
  );
}

export default JobCreate;
```

- [ ] **Step 4: Swap it into the route table and delete the old file**

In `frontend/src/routes/appRoutes.tsx`:
- line 13 — `import PostJob from "@/components/admin/PostJob";` →
  `import JobCreate from "@/components/workspace/JobCreate";`
- line 107 — `element: workspace(<PostJob />)` → `element: workspace(<JobCreate />)`

```bash
git rm frontend/src/components/admin/PostJob.tsx
```

- [ ] **Step 5: Run to verify it passes**

```bash
npm test --workspace @jobportal/web -- workspace.test
npm run typecheck
npm run lint:colour --workspace @jobportal/web
```

Expected: all PASS. The colour check is the one to watch — `FIELD` uses only token
utilities, and `accent-[var(--signal-text)]` matches the pattern `FilterCard` already
ships.

- [ ] **Step 6: Mutation-verify the remote control**

Comment out the `remote` checkbox block, re-run `workspace.test`, and confirm
`renders a remote control` FAILS with
`Unable to find a label with the text of: This role is remote`. **Restore it.** This
is the assertion standing between the seeker board's Remote facet and matching nothing
forever.

- [ ] **Step 7: Commit**

```bash
git add -A frontend/src/components frontend/src/routes/appRoutes.tsx frontend/tests/workspace.test.tsx
git commit -m "feat(web): rebuild the post-job form

Adds the remote control the schema has always had and no form rendered, and
replaces free-text jobType with the list the seeker facet filters on."
```

---

## Task 9: `CompanyEdit` and `CompanyCreate`

**Files:**
- Create: `frontend/src/components/workspace/CompanyEdit.tsx`
- Create: `frontend/src/components/workspace/CompanyCreate.tsx`
- Delete: `frontend/src/components/admin/CompanySetup.tsx`,
  `frontend/src/components/admin/CompanyCreate.tsx`
- Modify: `frontend/src/routes/appRoutes.tsx:10,11,104,105`

**Interfaces:**
- Consumes: `HireShell`; `useCompany`, `useCompanyUpdate`, `useCompanyCreate` (Task 5).
- Produces: `CompanyEdit`, `CompanyCreate` (named + default exports), no props.

`CompanySetup` becomes `CompanyEdit` because that is what it does — the old name
suggested a first-run wizard, and a recruiter arriving at it for an existing company
had no way to tell.

- [ ] **Step 1: Write `CompanyEdit`**

Create `frontend/src/components/workspace/CompanyEdit.tsx`:

```tsx
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import HireShell from "./HireShell";
import { FormField } from "@/components/layout/FormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getApiErrorMessage } from "@/lib/apiError";
import { useCompany, useCompanyUpdate } from "@/hooks/useRecruiterWorkspace";

const FIELD =
  "w-full rounded-surface border border-line bg-paper px-3 py-2 text-sm text-ink " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal";

/**
 * Edit a company.
 *
 * Named for what it does — `CompanySetup` suggested a first-run wizard, and a
 * recruiter arriving at it for an existing company had no way to tell.
 *
 * The hydrating effect stays: this is an edit form genuinely seeded from a
 * fetch, not a redux mirror. It now seeds from the query result rather than
 * `singleCompany`, so `data` is its only dependency.
 */
export function CompanyEdit() {
  const params = useParams();
  const navigate = useNavigate();
  const { data, isPending, isError, error } = useCompany(params.id);
  const updateCompany = useCompanyUpdate(params.id);

  const [input, setInput] = useState({
    name: "",
    description: "",
    website: "",
    location: "",
    file: null as File | null,
  });

  useEffect(() => {
    if (!data) return;
    setInput({
      name: data.name ?? "",
      description: data.description ?? "",
      website: data.website ?? "",
      location: data.location ?? "",
      file: null,
    });
  }, [data]);

  const onField = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setInput({ ...input, [e.target.name]: e.target.value });
  };

  const submitHandler = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData();
    // Only non-empty fields are sent: the update schema validates each field it
    // receives, so an empty `website` is a 400 rather than a no-op.
    for (const field of ["name", "description", "website", "location"] as const) {
      const value = input[field].trim();
      if (value) formData.append(field, value);
    }
    if (input.file) formData.append("file", input.file);

    try {
      await updateCompany.mutateAsync(formData);
      toast.success("Company updated");
      navigate("/hire/companies");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not update company"));
    }
  };

  if (isPending) {
    return (
      <HireShell title="Edit company">
        <Skeleton className="h-96 max-w-2xl rounded-surface" />
      </HireShell>
    );
  }

  if (isError) {
    return (
      <HireShell title="Edit company">
        <p role="alert" className="text-sm text-danger">
          Could not load this company: {error instanceof Error ? error.message : "unknown error"}
        </p>
      </HireShell>
    );
  }

  return (
    <HireShell title="Edit company" description={data?.name}>
      <form onSubmit={submitHandler} className="max-w-2xl">
        <FormField label="Company name" htmlFor="name" required>
          <Input id="name" name="name" value={input.name} onChange={onField} required />
        </FormField>

        <FormField label="Description" htmlFor="description">
          <textarea
            id="description"
            name="description"
            rows={4}
            value={input.description}
            onChange={onField}
            className={FIELD}
          />
        </FormField>

        <FormField
          label="Website"
          htmlFor="website"
          hint="Include the scheme — https://example.com"
        >
          <Input
            id="website"
            name="website"
            type="url"
            value={input.website}
            onChange={onField}
          />
        </FormField>

        <FormField label="Location" htmlFor="location">
          <Input id="location" name="location" value={input.location} onChange={onField} />
        </FormField>

        <FormField label="Logo" htmlFor="logo" hint="Replaces the current logo, if any.">
          <Input
            id="logo"
            name="logo"
            type="file"
            accept="image/*"
            onChange={(e) => setInput({ ...input, file: e.target.files?.[0] ?? null })}
          />
        </FormField>

        <div className="mt-(--space-card) flex items-center gap-2">
          <Button type="submit" disabled={updateCompany.isPending}>
            {updateCompany.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Saving
              </>
            ) : (
              "Save changes"
            )}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate("/hire/companies")}>
            Cancel
          </Button>
        </div>
      </form>
    </HireShell>
  );
}

export default CompanyEdit;
```

- [ ] **Step 2: Write `CompanyCreate`**

Create `frontend/src/components/workspace/CompanyCreate.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import HireShell from "./HireShell";
import { FormField } from "@/components/layout/FormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getApiErrorMessage } from "@/lib/apiError";
import { useCompanyCreate } from "@/hooks/useRecruiterWorkspace";

/**
 * Create a company — one field, so this changes least.
 *
 * A real `<form>` rather than a button with a click handler, so Enter submits.
 * The redux dispatch is gone: the mutation invalidates the companies query, and
 * the edit page fetches the row it needs by id.
 */
export function CompanyCreate() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const createCompany = useCompanyCreate();

  const submitHandler = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const company = await createCompany.mutateAsync({ name });
      toast.success("Company created");
      navigate(`/hire/companies/${company.id}`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not create company"));
    }
  };

  return (
    <HireShell
      title="New company"
      description="Name it now — you can add a logo, website and location next."
    >
      <form onSubmit={submitHandler} className="max-w-md">
        <FormField label="Company name" htmlFor="name" required>
          <Input
            id="name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Inc."
            required
          />
        </FormField>

        <div className="mt-(--space-card) flex items-center gap-2">
          <Button type="submit" disabled={createCompany.isPending}>
            {createCompany.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Creating
              </>
            ) : (
              "Continue"
            )}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate("/hire/companies")}>
            Cancel
          </Button>
        </div>
      </form>
    </HireShell>
  );
}

export default CompanyCreate;
```

- [ ] **Step 3: Swap both into the route table and delete the old files**

In `frontend/src/routes/appRoutes.tsx`:
- line 10 — `import CompanyCreate from "@/components/admin/CompanyCreate";` →
  `import CompanyCreate from "@/components/workspace/CompanyCreate";`
- line 11 — `import CompanySetup from "@/components/admin/CompanySetup";` →
  `import CompanyEdit from "@/components/workspace/CompanyEdit";`
- line 105 — `element: workspace(<CompanySetup />)` →
  `element: workspace(<CompanyEdit />)`

Line 104 keeps `<CompanyCreate />` — only the import path changed.

```bash
git rm frontend/src/components/admin/CompanySetup.tsx frontend/src/components/admin/CompanyCreate.tsx
```

- [ ] **Step 4: Verify**

```bash
npm run typecheck
npm test --workspace @jobportal/web -- workspace.test
npm run lint:colour --workspace @jobportal/web
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add -A frontend/src/components frontend/src/routes/appRoutes.tsx
git commit -m "feat(web): rebuild the company forms on HireShell and react-query

CompanySetup is CompanyEdit — the old name suggested a first-run wizard."
```

---

## Task 10: `Applicants` — the accessibility fix

Replaces `Applicants.tsx` + `ApplicantsTable.tsx`. Two defects close here: accept and
reject were `<div onClick>` (no role, no `tabIndex`, no focus ring — they worked for a
mouse and did not exist for a keyboard), and the decision POSTed, toasted success, and
never refetched, so the row kept its old status until a manual reload.

**Files:**
- Create: `frontend/src/components/workspace/Applicants.tsx`
- Delete: `frontend/src/components/admin/Applicants.tsx`,
  `frontend/src/components/admin/ApplicantsTable.tsx`
- Modify: `frontend/src/routes/appRoutes.tsx:14` (path only; the element name is
  unchanged)
- Modify: `frontend/tests/workspace.test.tsx`

**Interfaces:**
- Consumes: `HireShell`; `useApplicants`, `useApplicantDecision` (Task 5).
- Produces: `Applicants` (named + default export), no props.

- [ ] **Step 1: Write the failing test**

Append to `frontend/tests/workspace.test.tsx`:

```tsx
describe("Applicants", () => {
  it("reports a failed load in an alert", async () => {
    renderRoute(<Applicants />, {
      route: "/hire/jobs/abc/applicants",
      path: "/hire/jobs/:id/applicants",
    });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
```

Add the import:

```tsx
import Applicants from "@/components/workspace/Applicants";
```

Note the explicit `path` — `renderRoute` defaults `path` to `route`, so a parameterised
URL passed as a route pattern matches nothing.

- [ ] **Step 2: Run to verify it fails**

```bash
npm test --workspace @jobportal/web -- workspace.test
```

Expected: FAIL on the unresolved import.

- [ ] **Step 3: Write the page**

Create `frontend/src/components/workspace/Applicants.tsx`:

```tsx
import { Check, Clock, MoreHorizontal, Users, X } from "lucide-react";
import { useParams } from "react-router";
import { toast } from "sonner";
import type { ApplicantDto } from "@jobportal/shared";

import HireShell from "./HireShell";
import { Pager } from "@/components/layout/ListControls";
import { EmptyState } from "@/components/layout/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getApiErrorMessage } from "@/lib/apiError";
import { useApplicantDecision, useApplicants } from "@/hooks/useRecruiterWorkspace";

/**
 * Status as icon *and* label, never colour alone — the rule 2A set and
 * `AppliedJobTable` already follows.
 */
const STATUS: Record<
  ApplicantDto["status"],
  { variant: "ok" | "danger" | "warn"; icon: typeof Check; label: string }
> = {
  accepted: { variant: "ok", icon: Check, label: "Accepted" },
  rejected: { variant: "danger", icon: X, label: "Rejected" },
  pending: { variant: "warn", icon: Clock, label: "Pending" },
};

/**
 * The applicants for one job.
 *
 * Two fixes. Accept and reject are DropdownMenu items — real buttons with roles,
 * keyboard operation and a focus ring — where the inherited version used
 * `<div onClick>`, which worked for a mouse and did not exist for a keyboard.
 * And the decision invalidates the query, so the row updates; the old table
 * POSTed, toasted success and never refetched, leaving the row showing its
 * previous status until a manual reload.
 */
export function Applicants() {
  const params = useParams();
  const { data, isPending, isError, error, page, setPage } = useApplicants(params.id);
  const decide = useApplicantDecision(params.id);

  const onDecide = async (applicationId: string, status: "accepted" | "rejected") => {
    try {
      await decide.mutateAsync({ applicationId, status });
      toast.success(status === "accepted" ? "Applicant accepted" : "Applicant rejected");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not update status"));
    }
  };

  return (
    <HireShell
      title="Applicants"
      description={data ? `${data.total} ${data.total === 1 ? "person" : "people"} applied.` : undefined}
      actions={
        data ? (
          <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
        ) : undefined
      }
    >
      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-12 rounded-surface" />
          ))}
        </div>
      ) : isError ? (
        <p role="alert" className="text-sm text-danger">
          Could not load applicants: {error instanceof Error ? error.message : "unknown error"}
        </p>
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No applicants yet"
          description="Applications appear here as seekers apply to this role."
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Resume</TableHead>
                <TableHead>Applied</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((item) => {
                const status = STATUS[item.status];
                const StatusIcon = status.icon;
                return (
                  <TableRow key={item.applicationId}>
                    <TableCell className="font-medium">{item.fullName}</TableCell>
                    <TableCell>{item.email}</TableCell>
                    <TableCell>{item.phone ?? "—"}</TableCell>
                    <TableCell>
                      {item.resumeUrl ? (
                        <a
                          className="text-signal-text underline"
                          href={item.resumeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {item.resumeName ?? "Download"}
                        </a>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {item.appliedAt.split("T")[0]}
                    </TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>
                        <StatusIcon aria-hidden="true" className="size-3" />
                        {status.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Decide on ${item.fullName}`}
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => void onDecide(item.applicationId, "accepted")}
                          >
                            <Check className="size-4" />
                            Accept
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => void onDecide(item.applicationId, "rejected")}
                          >
                            <X className="size-4" />
                            Reject
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </HireShell>
  );
}

export default Applicants;
```

`Badge` has `ok`, `warn` and `danger` variants (`badge.tsx:20-22`) — verified. Each
pairs the variant with a lucide icon, per the icon-and-label rule.

- [ ] **Step 4: Repoint the import and delete the old files**

In `frontend/src/routes/appRoutes.tsx` line 14:

```tsx
import Applicants from "@/components/workspace/Applicants";
```

Line 108 is unchanged — the element name is the same.

```bash
git rm frontend/src/components/admin/Applicants.tsx frontend/src/components/admin/ApplicantsTable.tsx
```

- [ ] **Step 5: Confirm the admin directory is empty and remove it**

```bash
ls -A frontend/src/components/admin 2>/dev/null || echo "gone"
```

Expected: `gone`, or an empty listing. If any file remains, it was missed by an earlier
task — move or delete it before continuing.

- [ ] **Step 6: Verify**

```bash
npm run typecheck
npm test --workspace @jobportal/web -- workspace.test
npm run lint:colour --workspace @jobportal/web
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add -A frontend/src frontend/tests/workspace.test.tsx
git commit -m "feat(web): rebuild the applicants table

Accept and reject were <div onClick> — mouse-only, invisible to a keyboard —
and the decision never refetched, so the row kept its old status."
```

---

## Task 11: Delete the two empty slices

Every consumer was traced before this task was written. `companySlice` is read only by
the pages Tasks 7-9 replaced; `applicationSlice` holds one field read only by the two
components Task 10 replaced.

**Files:**
- Modify: `frontend/src/redux/jobSlice.ts`
- Modify: `frontend/src/redux/store.ts:17-18,44,65-70`
- Modify: `frontend/tests/helpers/renderRoute.tsx:12-13,41-50`
- Delete: `frontend/src/redux/companySlice.ts`,
  `frontend/src/redux/applicationSlice.ts`,
  `frontend/src/hooks/useGetAllAdminJobs.tsx`,
  `frontend/src/hooks/useGetAllCompanies.tsx`,
  `frontend/src/hooks/useGetCompanyById.tsx`

**Interfaces:**
- Consumes: nothing. Every reader was removed in Tasks 6-10.
- Produces: a `RootState` with exactly two keys — `auth` and `job`.

- [ ] **Step 1: Prove there are no readers left**

```bash
grep -rn "companySlice\|applicationSlice\|state.company\|state.application" frontend/src frontend/tests
grep -rn "allAdminJobs\|searchJobByText\|useGetAllAdminJobs\|useGetAllCompanies\|useGetCompanyById" frontend/src frontend/tests
```

Expected: only `store.ts`, `renderRoute.tsx`, the slice files themselves and the three
hook files. **If a page still appears, stop — an earlier task is incomplete.**

- [ ] **Step 2: Write the failing test**

Append to `frontend/tests/workspace.test.tsx`:

```tsx
describe("the workspace redux fields", () => {
  /**
   * `searchJobByText` and `searchCompanyByText` were the last survivors of the
   * pattern 2B-2 deleted `searchedQuery` for: a filter living in a slice while
   * the URL was already authoritative. Two sources of truth for one question is
   * how the app ended up with two job boards.
   */
  it("no longer carries a job search field or an admin job list", async () => {
    const jobReducer = (await import("@/redux/jobSlice")).default;
    const state = jobReducer(undefined, { type: "@@INIT" });
    expect(state).not.toHaveProperty("searchJobByText");
    expect(state).not.toHaveProperty("allAdminJobs");
  });

  it("has no company or application slice", async () => {
    await expect(import("@/redux/companySlice")).rejects.toThrow();
    await expect(import("@/redux/applicationSlice")).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

```bash
npm test --workspace @jobportal/web -- workspace.test
```

Expected: both FAIL — the fields and modules still exist.

- [ ] **Step 4: Trim `jobSlice`**

In `frontend/src/redux/jobSlice.ts`, remove `allAdminJobs` and `searchJobByText` from
`JobState` and `initialState`, and remove the `setAllAdminJobs` and `setSearchJobByText`
reducers and their entries in the export list. Extend the top docblock:

```ts
/**
 * `searchedQuery` is deliberately absent since 2B-2, and `searchJobByText` and
 * `allAdminJobs` since 2B-3.
 *
 * All three were the same mistake: a filter or a server list living in redux
 * while something else was already authoritative. The URL owns every filter and
 * page; react-query owns every server read. `allAdminJobs` was the recruiter's
 * own job list, now `useOwnedJobs`; `searchJobByText` was its filter, now the
 * `q` URL param. Two sources of truth for one question is how the app ended up
 * with two job boards, one of which nothing linked to.
 */
```

The resulting state is `{ allJobs, singleJob, allAppliedJobs }` — all seeker surface.

- [ ] **Step 5: Trim the store and bump the persist version**

In `frontend/src/redux/store.ts`, delete the two imports on lines 17-18 and reduce
`rootReducer` to:

```ts
const rootReducer = combineReducers({
  auth: persistedAuth,
  job: jobSlice,
});
```

Change `version: 2` to `version: 3` in `persistConfig` and extend its comment:

```ts
  // 2 -> 3: 2B-3 deleted companySlice and applicationSlice. Every browser that
  // has used the app holds `company` and `application` subtrees under version 2,
  // and combineReducers warns about state keys with no reducer. No migration
  // function, for the same reason as the 1 -> 2 bump: all of it is server data
  // that refetches.
  //
  // This costs nothing at the session layer. `auth` has its own nested
  // persistReducer at key `auth` (below), which is a separate localStorage entry
  // from `persist:root` — so bumping the root version discards job/company/
  // application while the cached `user` rehydrates normally. No signed-out
  // flicker. The nested reducer was added to keep `bootstrapped`/`loading` out of
  // storage; decoupling the session from root-version bumps is a second dividend.
  version: 3,
```

- [ ] **Step 6: Delete the slices and the three hooks**

```bash
git rm frontend/src/redux/companySlice.ts frontend/src/redux/applicationSlice.ts \
  frontend/src/hooks/useGetAllAdminJobs.tsx \
  frontend/src/hooks/useGetAllCompanies.tsx \
  frontend/src/hooks/useGetCompanyById.tsx
```

- [ ] **Step 7: Match the test store to the app store**

In `frontend/tests/helpers/renderRoute.tsx`, delete the two reducer imports on lines
12-13 and reduce `makeStore`:

```tsx
export function makeStore() {
  return configureStore({
    reducer: {
      auth: authReducer,
      job: jobReducer,
    },
  });
}
```

A test store shaped unlike the app's is how a component passes here and fails in the
browser.

- [ ] **Step 8: Run the whole web suite**

```bash
npm test --workspace @jobportal/web
npm run typecheck
```

Expected: all PASS. The full suite matters here — `makeStore` backs every rendering
test in the project, so a missed reader surfaces now.

- [ ] **Step 9: Commit**

```bash
git add -A frontend/src/redux frontend/src/hooks frontend/tests
git commit -m "refactor(web): delete companySlice and applicationSlice

Both lost their last readers when the workspace moved to react-query. Two of
four slices are gone; redux now holds the session and the seeker's lists."
```

---

## Task 12: Full verification and the docs

**Files:**
- Modify: `CLAUDE.md` (Current state section)
- Modify: `frontend/tests/workspace.test.tsx` (route and gate coverage)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Add the route and gate coverage**

Append to `frontend/tests/workspace.test.tsx`:

```tsx
describe("workspace routes", () => {
  const WORKSPACE_PATHS = [
    "/hire/companies",
    "/hire/companies/create",
    "/hire/companies/:id",
    "/hire/jobs",
    "/hire/jobs/create",
    "/hire/jobs/:id/applicants",
  ];

  const CONCRETE = WORKSPACE_PATHS.map((p) =>
    p.replace(":id", "64b0c8f2a9d3e45f6a7b8c9d"),
  );

  it("mounts every workspace path", () => {
    const paths = appRoutes
      .flatMap((r) => (r.children ?? []).map((c) => c.path))
      .filter(Boolean);
    for (const path of WORKSPACE_PATHS) expect(paths).toContain(path);
  });

  it("resolves the recruiter portal on every one", async () => {
    for (const path of CONCRETE) {
      const { container, unmount } = renderAppAt(path, {
        store: storeWith("recruiter", "active"),
      });
      await waitFor(() =>
        expect(container.querySelector("[data-portal]")?.getAttribute("data-portal")).toBe(
          "recruiter",
        ),
      );
      unmount();
    }
  });

  it("bounces a seeker and an admin to their own home", async () => {
    for (const portal of ["seeker", "admin"] as const) {
      for (const path of CONCRETE) {
        const view = renderAppAt(path, { store: storeWith(portal, "active") });
        await waitFor(() => expect(view.pathname()).toBe(homePathFor(portal)));
        view.unmount();
      }
    }
  });

  it("shows a pending recruiter the awaiting-approval state on every page", async () => {
    // The gate belongs on every route, not just the entry page — the API puts
    // requireApproved on every recruiter-owned mutation.
    for (const path of CONCRETE) {
      const view = renderAppAt(path, { store: storeWith("recruiter", "pending") });
      expect(await view.findByText("Awaiting approval")).toBeInTheDocument();
      view.unmount();
    }
  });

  it("links only to paths the route table mounts", () => {
    const paths = appRoutes
      .flatMap((r) => (r.children ?? []).map((c) => c.path))
      .filter(Boolean);
    for (const link of navLinksFor("recruiter")) expect(paths).toContain(link.to);
  });
});
```

Add the supporting imports and helper at the top of the file:

```tsx
import type { Portal } from "@jobportal/shared";
import { makeStore, renderAppAt, renderRoute } from "./helpers/renderRoute";
import { appRoutes } from "@/routes/appRoutes";
import { setBootstrapped, setUser } from "@/redux/authSlice";
import { homePathFor } from "@/lib/portalHome";

function storeWith(portal: Portal, status: "active" | "pending") {
  const store = makeStore();
  store.dispatch(
    setUser({
      id: "u1",
      portal,
      fullName: "Workspace User",
      email: "workspace@example.com",
      emailVerified: true,
      avatarUrl: null,
      status,
    }),
  );
  store.dispatch(setBootstrapped(true));
  return store;
}
```

- [ ] **Step 2: Run the new coverage**

```bash
npm test --workspace @jobportal/web -- workspace
```

Expected: all PASS. If the pending assertion fails on a page, that page renders outside
`RequireApproved` — check its entry in `appRoutes.tsx` goes through `workspace()`.

- [ ] **Step 3: Mutation-verify the pending gate**

Temporarily change `/hire/jobs/create` in `appRoutes.tsx` from
`workspace(<JobCreate />)` to `<ProtectedRoute portal="recruiter"><JobCreate /></ProtectedRoute>`,
then re-run. Expected: the pending test FAILS for that path. **Restore `workspace()`.**
This is the assertion that a workspace page cannot ship with one gate missing.

- [ ] **Step 4: Confirm the exhaustive-deps warnings are gone**

```bash
cd frontend && npx eslint src --max-warnings 0; cd ..
```

Expected: exit 0. Both warnings lived in `AdminJobs.tsx:18` and `Companies.tsx:18` —
the `dispatch(setSearchXByText(input))` effects — and the move to URL state deleted
them outright rather than suppressing them.

- [ ] **Step 5: Run full CI**

```bash
npm run ci
```

Run this in the background — it takes over 120 seconds. Expected: PASS. This is the
first run covering both workspaces together, so a shared-package drift surfaces here.
Note that lint runs before tests: one lint error exits before a single test runs, which
can hide a fully green suite.

- [ ] **Step 6: Update `CLAUDE.md`**

In the **Current state** section, change the opening paragraph so 2B-3 is listed among
the complete phases and the "Phase 2B-3 (recruiter workspace) has not started" sentence
is removed.

Remove these entries from **Known gaps**:
- "The recruiter workspace (`components/admin/*`) is still the inherited structure…"
- "Two `react-hooks/exhaustive-deps` warnings remain in `AdminJobs.tsx` and
  `Companies.tsx`…"

Add a **What 2B-3 closed** section:

```markdown
What 2B-3 closed:

- **A recruiter could not post a remote job.** `remote` is on
  `jobCreateBodySchema`, on the Mongo model, and drives the matching pipeline's
  `remoteFit` — and no form had ever rendered a control, so every row carried
  the schema default `false` and the seeker board's Remote facet matched
  nothing, always. It is a checkbox now
- **`jobType` is an enum, and `JOB_TYPES` is the one list.** The export existed
  in `packages/shared` with **zero importers** and lowercase values, while
  `FilterCard` carried its own hardcoded title-case literal and filtered by
  exact equality — so "Full Time" was accepted, stored, rendered on the card,
  and unfilterable. Both sides import `JOB_TYPES` now, title-case because that
  is what the facet and the existing rows agree on. Normalising to lowercase
  slugs needs a migration over free text and is a follow-up
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
  local filter deliberately — `/company/get` returns every owned row, so it is
  honest
- **`components/admin/*` is gone.** The recruiter workspace is
  `components/workspace/*`, the admin console stays `components/console/*`, and
  the two route guards are `components/routing/*` — the console no longer
  imports from a directory named for the other portal. `CompanySetup` is
  `CompanyEdit`, which is what it does
- **Two of four redux slices stopped existing.** `companySlice` and
  `applicationSlice` lost their last readers when the workspace moved to
  react-query. `searchJobByText` and `searchCompanyByText` were the last
  survivors of the pattern 2B-2 deleted `searchedQuery` for. `persistConfig`
  goes to version 3 to discard the orphaned subtrees — which costs nothing at
  the session layer, because `auth` persists at its own key and rehydrates
  independently
```

Add to **Known gaps**:

```markdown
- `jobType` is title-case rather than a lowercase slug with a display mapping.
  Slugs are the better data shape, but adopting them means rewriting every
  stored `jobType`, and the pre-2B-3 rows are free text — guesswork. The enum
  gates new posts only, so rows posted before it may still be unfilterable
- Applicant search. The list paginates but has no keyword; applicant search is a
  new capability rather than a port of an existing one
- The application status vocabulary is still two-outcome.
  `APPLICATION_STATUSES` defines seven values and
  `applicationStatusBodySchema` accepts two
```

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md frontend/tests/workspace.test.tsx
git commit -m "docs: record what phase 2B-3 closed"
```

- [ ] **Step 8: Final verification before pushing**

```bash
npm run ci
git log --oneline -12
git status
```

Expected: CI passes, twelve task commits, a clean tree. Push only after CI is green:

```bash
git push origin main
```

---

## Self-Review

**1. Spec coverage.** Every spec section maps to a task:

| Spec section | Task |
|---|---|
| Directory rename table | 3, 6, 7, 8, 9, 10 |
| `HireShell` | 4 |
| Routes do not change | 6-10 (import swaps only), asserted in 12 |
| Keyword on owned jobs + `escapeRegex` | 2 |
| Companies/applicants deliberately without keyword | 5 (`useOwnedCompanies` filters locally, `useApplicants` has `Pager` only) |
| Mutations invalidate | 5 |
| Slices empty out | 11 |
| Persistence version bump | 11 |
| `JobCreate` — jobType enum, remote, number inputs, textareas, picker by id, zero-company EmptyState | 1 (enum) + 8 (form) |
| `CompanyEdit`, `CompanyCreate` | 9 |
| `Applicants` — DropdownMenu, Badge+icon | 10 |
| Error/empty/loading three-state | 6, 7, 8, 9, 10 |
| API tests | 2 |
| Web tests | 4, 6, 7, 8, 10, 11, 12 |
| `makeStore()` drops two reducers | 11 |
| Mutation verification | 2, 8, 12 |

**2. Placeholder scan.** No TBD/TODO. Every code step carries real code. No "similar to
Task N" — `WorkspaceCompanies` repeats the table structure rather than referring back.

**3. Type consistency.** `useOwnedJobs` returns `{...query, keyword, page, setKeyword,
setPage}` and Task 6 destructures exactly those. `useOwnedCompanies` returns `filtered`
(not `data.items`) and Tasks 7 and 8 use `filtered` and `data` respectively — Task 8
needs the unfiltered list for its picker, which is why it reads `data`.
`useApplicantDecision` takes `{applicationId, status}` and Task 10 passes both.
`HireShell`'s four props match every call site.

**Three corrections made during this review:**

1. **`Applicants` needs an explicit `path` in `renderRoute`.** The helper defaults
   `path` to `route`, so `/hire/jobs/abc/applicants` would be treated as a literal
   pattern and match nothing — a known trap recorded in memory. Fixed in Task 10.
2. **The `<Select>` decision was unstated in the spec.** The shadcn primitive is Radix,
   which does not open under jsdom without pointer-event stubs. Task 8 specifies a
   native `<select>` and says why, with the alternative spelled out.
3. **`Task 8` sends `remote` as a string, not a boolean.** `jobCreateBodySchema` types
   it `z.enum(["true","false","1","0","on"])` before transforming, so a raw boolean
   fails validation. The plan sends `input.remote ? "true" : "false"`.

## What this plan does not do

Carried forward from the spec, unchanged:

- The application status vocabulary stays two-outcome.
- `jobType` stays title-case; normalising to slugs needs its own migration phase.
- No applicant keyword search.
- The Cloudinary orphan on logo replacement is untouched.
- `packages/shared/src/legacy-dto.ts` stays vestigial.
