# Saved Jobs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The seeker's shortlist — a Save control on every role's page, an idempotent save/unsave API over a `SavedJob` collection, and a session-gated `/saved` list that keeps dead roles and marks applied ones.

**Architecture:** A new `SavedJob` model (`{seeker, job}` unique index) with a four-endpoint resource (`POST`/`DELETE`/`GET /saved`, `GET /saved/:jobId`) whose toggles are idempotent by design. The list resolves jobs in two steps — raw ids first, then a populate keyed on them — so a deleted posting keeps its row, its stored `jobId`, and its applied join. The frontend adds a per-job saved check and toggle pair to the detail page's aside, a `/saved` table page in the applied-jobs idiom, and a session nav link.

**Tech Stack:** Express 5 service/controller/route, Mongoose 8, `SavedJobDto` in `packages/shared`, React 19 + TanStack Query, the existing table/badge/pager primitives.

**Spec:** `docs/superpowers/specs/2026-09-02-saved-jobs-design.md`

## Global Constraints

- The spec's decisions D1–D7 are contracts. Non-goals are hard: no board-card saving, no close notifications, no saved searches, no notes/tags, no sharing, no cap, no recruiter visibility into saves.
- Save and unsave are idempotent: duplicate insert = 200 success, delete matching nothing = 200 success. The only refusal is a nonexistent job on `POST` (404 `JOB_NOT_FOUND`).
- `GET /saved/:jobId` never 404s on a missing job — a save of a missing job cannot exist, so the answer is `saved: false`.
- No `requireProfileComplete` anywhere: saving is a bookmark, below the DOB gate applying sits behind.
- `SavedJobDto` carries the stored `jobId` always — populate destroys the raw id on a deleted ref, and Unsave targets it.
- The applied join keys on the stored job ids, not populated docs — an application on a since-deleted job still counts.
- Backend relative imports end `.js`; frontend imports do not. DTOs in `packages/shared`; `AppError` for API failures; ownership from `req.auth!.id` only.
- Backend tests run from `backend/`; shared from `packages/shared/`; frontend from `frontend/` (the `@/` alias does not resolve from the repo root).
- Rebuild shared after shared edits before backend/frontend typecheck or web suites: `npm run build --workspace @jobportal/shared`.
- Backend tests ARE typechecked — a type error passes vitest and fails `npm run typecheck`. Run the workspace typecheck before every commit.
- No raw colours — tokens only; `npm run lint:colour` stays at zero.
- No `Co-Authored-By` trailer. Work lands on `main`, no branches, no worktree.
- A user-visible change publishes its release-note entry in `frontend/src/data/updates.ts` in the same commit that ships it.

---

### Task 1: Backend — the SavedJob resource

**Files:**
- Create: `backend/src/models/savedJob.model.ts`
- Create: `backend/src/services/savedJob.service.ts`
- Create: `backend/src/controllers/savedJob.controller.ts`
- Create: `backend/src/routes/savedJob.route.ts`
- Modify: `backend/src/app.ts` (mount)
- Modify: `packages/shared/src/domain.ts` (`SavedJobDto`, after `AppliedJobDto`)
- Test: `backend/tests/savedJobs.test.ts` (new)

**Interfaces:**
- Consumes: `toJobDto` from `job.service.js`, `Application`, `Job`, `defineModel`, `paginationQuerySchema`, `objectIdSchema`, `parseBody`, `authenticate`, `csrfProtection`.
- Produces: `SavedJob` model; service `saveJob(seekerId, jobId): Promise<boolean>` (true = created, false = already saved), `unsaveJob(seekerId, jobId): Promise<void>`, `isJobSaved(seekerId, jobId): Promise<boolean>`, `listSavedJobs(seekerId, {page, limit}): Promise<PaginatedResponse<SavedJobDto>>`; HTTP under `/api/v1/saved`; shared `SavedJobDto = { id: string; jobId: string; savedAt: string; job: JobDto | null; applied: boolean }`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/savedJobs.test.ts`:

```ts
import request from "supertest";
import mongoose from "mongoose";
import { beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { Application } from "../src/models/application.model.js";
import { Job } from "../src/models/job.model.js";
import { SavedJob } from "../src/models/savedJob.model.js";
import { asSession, installCaptureMailer, signedUpOn } from "./auth/helpers.js";

const app = buildApp();

describe("saved jobs", () => {
  let recruiter: Awaited<ReturnType<typeof signedUpOn>>;
  let seeker: Awaited<ReturnType<typeof signedUpOn>>;
  let other: Awaited<ReturnType<typeof signedUpOn>>;
  let jobId: string;
  let secondJobId: string;

  beforeEach(async () => {
    installCaptureMailer();
    // The unique {seeker, job} index backs the idempotent re-save; without an
    // explicit init the autoIndex build races the first duplicate insert.
    await SavedJob.init();

    recruiter = await signedUpOn("recruiter", "r@example.com");
    seeker = await signedUpOn("seeker", "s@example.com");
    other = await signedUpOn("seeker", "other@example.com");

    const company = await request(app)
      .post("/api/v1/company/register")
      .use(asSession("recruiter", recruiter))
      .send({ name: "Acme" });
    for (const title of ["First Role", "Second Role"]) {
      const job = await request(app)
        .post("/api/v1/job/post")
        .use(asSession("recruiter", recruiter))
        .send({
          title,
          description: "Build things",
          requirements: "ts",
          salary: 10,
          experience: 1,
          location: "Remote",
          jobType: "Full-time",
          position: "1",
          companyId: company.body.company.id,
        });
      if (title === "First Role") jobId = job.body.job.id;
      else secondJobId = job.body.job.id;
    }
  });

  const saveAs = (session: typeof seeker | null, id = jobId) => {
    const call = request(app).post(`/api/v1/saved/${id}`);
    if (session) call.use(asSession("seeker", session));
    return call;
  };

  it("save matrix: anonymous 401, wrong portal 401, seeker 201", async () => {
    expect((await saveAs(null)).status).toBe(401);
    expect(
      (
        await request(app)
          .post(`/api/v1/saved/${jobId}`)
          .use(asSession("recruiter", recruiter))
      ).status,
    ).toBe(401);
    expect((await saveAs(seeker)).status).toBe(201);
  });

  it("re-saving is idempotent: 200 the second time, exactly one row", async () => {
    expect((await saveAs(seeker)).status).toBe(201);
    const again = await saveAs(seeker);
    expect(again.status).toBe(200);
    expect(await SavedJob.countDocuments({})).toBe(1);
  });

  it("saving a job that does not exist is 404; a malformed id is 400", async () => {
    const missing = await saveAs(seeker, "64b0c8f2a9d3e45f6a7b8c9d");
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe("JOB_NOT_FOUND");

    expect((await saveAs(seeker, "not-an-id")).status).toBe(400);
  });

  it("unsave removes the row, is idempotent, and never touches another seeker's", async () => {
    await saveAs(seeker);
    await saveAs(other);

    const remove = await request(app)
      .delete(`/api/v1/saved/${jobId}`)
      .use(asSession("seeker", seeker));
    expect(remove.status).toBe(200);
    // Idempotent: the state asked for already holds.
    expect(
      (await request(app).delete(`/api/v1/saved/${jobId}`).use(asSession("seeker", seeker)))
        .status,
    ).toBe(200);
    // Only the caller's save was removed.
    expect(await SavedJob.countDocuments({})).toBe(1);
    const remaining = await SavedJob.findOne({});
    expect(String(remaining?.seeker)).toBe((other as { id: string }).id);
  });

  it("lists only the caller's saves, newest first, paginated", async () => {
    await saveAs(seeker, jobId);
    // Distinct createdAt for a deterministic order — the timestamps have
    // millisecond precision and two creates can share one.
    await new Promise((r) => setTimeout(r, 5));
    await saveAs(seeker, secondJobId);
    await saveAs(other, jobId);

    const res = await request(app)
      .get("/api/v1/saved?limit=1")
      .use(asSession("seeker", seeker))
      .expect(200);

    expect(res.body).toMatchObject({ total: 2, page: 1, pages: 2 });
    // Newest first: the second save is the only row on page 1.
    expect(res.body.items[0].jobId).toBe(secondJobId);
    expect(res.body.items[0].job.title).toBe("Second Role");
    // The exact DTO allowlist, so a future widening fails here.
    expect(Object.keys(res.body.items[0]).sort()).toEqual(
      ["applied", "id", "job", "jobId", "savedAt"].sort(),
    );
  });

  it("keeps a deleted posting's row — null job, stored id, applied join intact — and it stays removable", async () => {
    // Apply first, so the join must key on the STORED id: the populated doc
    // is about to disappear.
    await request(app)
      .post(`/api/v1/application/apply/${jobId}`)
      .use(asSession("seeker", seeker))
      .expect(201);
    await saveAs(seeker, jobId);
    // Recruiters cannot delete an applied role through the API, by design —
    // the model delete is the test's stand-in for "deleted after saving".
    await Job.deleteOne({ _id: jobId });

    const res = await request(app)
      .get("/api/v1/saved")
      .use(asSession("seeker", seeker))
      .expect(200);

    const row = res.body.items[0];
    expect(row.job).toBeNull();
    expect(row.jobId).toBe(jobId);
    expect(row.applied).toBe(true);

    // The dead row is removable — Unsave targets the stored id.
    expect(
      (await request(app).delete(`/api/v1/saved/${jobId}`).use(asSession("seeker", seeker))).status,
    ).toBe(200);
    expect(await SavedJob.countDocuments({})).toBe(0);
  });

  it("keeps a closed role's row with its status, and marks applied rows", async () => {
    await request(app)
      .post(`/api/v1/application/apply/${jobId}`)
      .use(asSession("seeker", seeker))
      .expect(201);
    await request(app)
      .post(`/api/v1/job/status/${jobId}/update`)
      .use(asSession("recruiter", recruiter))
      .send({ status: "closed" })
      .expect(200);
    await saveAs(seeker, jobId);
    await new Promise((r) => setTimeout(r, 5));
    await saveAs(seeker, secondJobId);

    const res = await request(app)
      .get("/api/v1/saved")
      .use(asSession("seeker", seeker))
      .expect(200);

    const byJobId = new Map(res.body.items.map((row: { jobId: string }) => [row.jobId, row]));
    expect(byJobId.get(jobId)).toMatchObject({ applied: true });
    expect(byJobId.get(jobId).job.status).toBe("closed");
    expect(byJobId.get(secondJobId)).toMatchObject({ applied: false });
    expect(byJobId.get(secondJobId).job.status).toBe("open");
  });

  it("the per-job check answers both states and never 404s", async () => {
    const check = (id = jobId) =>
      request(app).get(`/api/v1/saved/${id}`).use(asSession("seeker", seeker));

    expect((await check()).body).toMatchObject({ saved: false });
    await saveAs(seeker);
    expect((await check()).body).toMatchObject({ saved: true });

    // A job that does not exist cannot be saved, so the check answers false —
    // a check endpoint has no business erroring on the thing it checks for.
    const missing = await check("64b0c8f2a9d3e45f6a7b8c9d");
    expect(missing.status).toBe(200);
    expect(missing.body.saved).toBe(false);

    expect((await request(app).get("/api/v1/saved/not-an-id").use(asSession("seeker", seeker)))
      .status).toBe(400);
  });

  it("anonymous cannot read the list or the check", async () => {
    expect((await request(app).get("/api/v1/saved")).status).toBe(401);
    expect((await request(app).get(`/api/v1/saved/${jobId}`)).status).toBe(401);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd D:\job-portal-2.0\backend; npx vitest run tests/savedJobs.test.ts`
Expected: FAIL — the route does not exist (404s and `SavedJob` is not a model).

- [ ] **Step 3: The shared DTO**

In `packages/shared/src/domain.ts`, after the `AppliedJobDto` type, add:

```ts
/**
 * One row of the seeker's shortlist. `job` is null when the posting was
 * deleted after saving — the row stays, the applied list's stance: the
 * seeker's record is theirs. `applied` is computed at read time (this seeker
 * has an application on this job), so the list can tell a to-do from a done.
 *
 * `jobId` is the stored reference and is always present: populating a
 * deleted job yields null and loses the raw id, and it is that id an Unsave
 * targets — a dead row must still be removable.
 */
export type SavedJobDto = {
  id: string;
  jobId: string;
  savedAt: string;
  job: JobDto | null;
  applied: boolean;
};
```

Then rebuild: `cd D:\job-portal-2.0; npm run build --workspace @jobportal/shared`

- [ ] **Step 4: The model**

Create `backend/src/models/savedJob.model.ts`:

```ts
import { Schema, type InferSchemaType, type Model } from "mongoose";
import { defineModel } from "./defineModel.js";

/**
 * One saved role: a seeker's private shortlist entry, nothing more. No
 * status, no notes — the questions a shortlist answers are "which roles am I
 * still deciding on" (the applied join, computed at read time) and "when did
 * I save this" (timestamps). Nothing here reaches a recruiter surface.
 */
const savedJobSchema = new Schema(
  {
    seeker: {
      type: Schema.Types.ObjectId,
      ref: "Seeker",
      required: true,
    },
    job: {
      type: Schema.Types.ObjectId,
      ref: "Job",
      required: true,
    },
  },
  { timestamps: true },
);

// One save per seeker per job, enforced at the storage layer — the same
// race-closing shape the applications index has: two parallel saves must not
// create two rows.
savedJobSchema.index({ seeker: 1, job: 1 }, { unique: true });

export type SavedJobDocument = InferSchemaType<typeof savedJobSchema>;
export const SavedJob: Model<SavedJobDocument> = defineModel<SavedJobDocument>(
  "SavedJob",
  savedJobSchema,
);
```

- [ ] **Step 5: The service**

Create `backend/src/services/savedJob.service.ts`:

```ts
import mongoose from "mongoose";
import type { PaginatedResponse, PaginationQuery, SavedJobDto } from "@jobportal/shared";

import { Application } from "../models/application.model.js";
import { Job } from "../models/job.model.js";
import { SavedJob } from "../models/savedJob.model.js";
import { AppError } from "../lib/AppError.js";
import { toJobDto } from "./job.service.js";

/** Mongo's duplicate-key error, whatever driver version raised it. */
function isDuplicateKey(err: unknown): boolean {
  return (err as { code?: number }).code === 11000;
}

/**
 * Save a role. Idempotent by design: the unique {seeker, job} index is the
 * dedupe (insert-first, not findOne-then-create — the same race the
 * applications index closes), and a duplicate key means the save already
 * exists, which is the state the caller asked for. Saving is a toggle, and a
 * toggle must never error on stale button state — unlike apply's 409, because
 * applying twice is a real conflict while saving twice is the same state.
 */
export async function saveJob(seekerId: string, jobId: string): Promise<boolean> {
  const job = await Job.findById(jobId).select("_id");
  if (!job) throw AppError.notFound("JOB_NOT_FOUND", "Job not found");
  try {
    await SavedJob.create({ seeker: seekerId, job: jobId });
    return true;
  } catch (err) {
    if (isDuplicateKey(err)) return false;
    throw err;
  }
}

/**
 * Unsave a role. Idempotent for the same reason: deleting a save that is
 * already gone produces the state the caller asked for.
 */
export async function unsaveJob(seekerId: string, jobId: string): Promise<void> {
  await SavedJob.deleteOne({ seeker: seekerId, job: jobId });
}

/** The per-job check the detail page's button state reads. */
export async function isJobSaved(seekerId: string, jobId: string): Promise<boolean> {
  const saved = await SavedJob.findOne({ seeker: seekerId, job: jobId }).select("_id");
  return saved !== null;
}

/**
 * The caller's shortlist, newest first.
 *
 * Jobs are resolved in two steps — raw ids off the saves first, then one
 * populate keyed on them — because populating the save itself destroys the
 * stored id when the ref is gone, and that id is what the DTO's `jobId`, the
 * Unsave target, and the applied join all key on.
 */
export async function listSavedJobs(
  seekerId: string,
  { page, limit }: PaginationQuery,
): Promise<PaginatedResponse<SavedJobDto>> {
  const filter = { seeker: seekerId };
  const [total, saves] = await Promise.all([
    SavedJob.countDocuments(filter),
    SavedJob.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
  ]);

  const rows = saves as unknown as Array<{
    _id: unknown;
    createdAt?: Date;
    job: unknown;
  }>;
  const jobIds = rows.map((row) => String(row.job));

  // The applied join: one bounded read of this seeker's applications on the
  // page's stored job ids, rather than a per-row lookup or a client-side scan
  // of the paginated applied list (which would mark an applied role as
  // unapplied past that list's page).
  const [jobs, appliedRows] = await Promise.all([
    jobIds.length === 0
      ? Promise.resolve([])
      : Job.find({ _id: mongoose.trusted({ $in: jobIds }) }).populate("company"),
    jobIds.length === 0
      ? Promise.resolve([])
      : Application.find({
          applicant: seekerId,
          job: mongoose.trusted({ $in: jobIds }),
        }).select("job"),
  ]);
  const jobById = new Map(jobs.map((job) => [String(job._id), job]));
  const appliedJobIds = new Set(appliedRows.map((row) => String(row.job)));

  return {
    items: rows.map((row) => {
      const jobId = String(row.job);
      const job = jobById.get(jobId);
      return {
        id: String(row._id),
        jobId,
        savedAt: row.createdAt?.toISOString() ?? "",
        job:
          job && typeof job === "object" && "title" in job ? toJobDto(job as never) : null,
        applied: appliedJobIds.has(jobId),
      };
    }),
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}
```

- [ ] **Step 6: The controller and route**

Create `backend/src/controllers/savedJob.controller.ts`:

```ts
import type { Request, Response } from "express";
import { objectIdSchema, paginationQuerySchema } from "@jobportal/shared";

import { parseBody } from "../lib/validate.js";
import * as savedJobService from "../services/savedJob.service.js";

export const save = async (req: Request, res: Response): Promise<void> => {
  const jobId = parseBody(objectIdSchema, req.params.jobId);
  // 201 when the save was created, 200 when it already existed — either way
  // the state is "saved", and a toggle must never error on stale state.
  const created = await savedJobService.saveJob(req.auth!.id, jobId);
  res.status(created ? 201 : 200).json({ success: true });
};

export const unsave = async (req: Request, res: Response): Promise<void> => {
  const jobId = parseBody(objectIdSchema, req.params.jobId);
  await savedJobService.unsaveJob(req.auth!.id, jobId);
  res.status(200).json({ success: true });
};

/**
 * The per-job check. No body: the caller is not asserting anything to
 * disagree about, and the answer is derived, not stored.
 */
export const check = async (req: Request, res: Response): Promise<void> => {
  const jobId = parseBody(objectIdSchema, req.params.jobId);
  const saved = await savedJobService.isJobSaved(req.auth!.id, jobId);
  res.status(200).json({ success: true, saved });
};

export const list = async (req: Request, res: Response): Promise<void> => {
  const query = parseBody(paginationQuerySchema, req.query);
  const result = await savedJobService.listSavedJobs(req.auth!.id, query);
  res.status(200).json({ success: true, ...result });
};
```

Create `backend/src/routes/savedJob.route.ts`:

```ts
import express from "express";

import { authenticate } from "../middleware/authenticate.js";
import { csrfProtection } from "../middleware/csrf.js";
import { check, list, save, unsave } from "../controllers/savedJob.controller.js";

const router = express.Router();

// The seeker's shortlist. Session-gated only, deliberately NOT behind
// requireProfileComplete: applying is the consequential action that
// justifies the profile gate, and saving is a bookmark.
router.route("/").get(authenticate("seeker"), list);
router.route("/:jobId").get(authenticate("seeker"), check);
router.route("/:jobId").post(authenticate("seeker"), csrfProtection(), save);
router.route("/:jobId").delete(authenticate("seeker"), csrfProtection(), unsave);

export default router;
```

In `backend/src/app.ts`, add to the route imports:

```ts
import savedJobRoute from "./routes/savedJob.route.js";
```

and after the application mount (`app.use("/api/v1/application", applicationRoute);`):

```ts
app.use("/api/v1/saved", savedJobRoute);
```

- [ ] **Step 7: Run the tests and the typecheck**

Run: `cd D:\job-portal-2.0\backend; npx vitest run tests/savedJobs.test.ts`
Expected: PASS (all nine).

Run: `cd D:\job-portal-2.0\backend; npx tsc -p tsconfig.json --noEmit` (or the root `npm run typecheck`)
Expected: clean — backend tests are typechecked.

- [ ] **Step 8: Commit**

```powershell
git add backend/src/models/savedJob.model.ts backend/src/services/savedJob.service.ts backend/src/controllers/savedJob.controller.ts backend/src/routes/savedJob.route.ts backend/src/app.ts backend/tests/savedJobs.test.ts packages/shared/src/domain.ts
git commit -m "feat(api): the saved jobs resource, idempotent by design"
```

---

### Task 2: Frontend — the save control on the detail page

**Files:**
- Create: `frontend/src/hooks/useSavedJobs.tsx`
- Modify: `frontend/src/components/JobDescription.tsx` (aside button + state)
- Test: `frontend/tests/savedJobs.test.tsx` (new — the detail-page describe)

**Interfaces:**
- Consumes: `SavedJobDto`, `apiClient`, `userForPortal`, the existing anonymous-redirect shape.
- Produces: `useSavedJobs()` (list query + local page), `useIsSaved(jobId?)` (resolves `boolean`), `useSaveJob()` / `useUnsaveJob()` (mutations taking a jobId, invalidating `["saved-job"]` and `["saved-jobs"]`).

- [ ] **Step 1: Write the failing tests**

Create `frontend/tests/savedJobs.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";

import { makeQueryClient, makeStore } from "./helpers/renderRoute";
import { apiClient } from "@/lib/apiClient";
import { setSingleJob } from "@/redux/jobSlice";
import { setUser } from "@/redux/authSlice";
import JobDescription from "@/components/JobDescription";

const JOB = {
  id: "job-1",
  title: "A Full-time role",
  description: "Work.",
  requirements: [],
  salary: 12,
  location: "Remote",
  jobType: "Full-time",
  position: 1,
  department: "Engineering",
  experienceLevel: 1,
  remote: true,
  status: "open",
  company: { id: "c1", name: "Acme", logoUrl: null },
  createdAt: "2026-08-01T00:00:00.000Z",
  created_by: null,
  fit: null,
  postedBy: null,
};

const SEEKER = {
  id: "u1",
  portal: "seeker" as const,
  fullName: "A B",
  email: "a@b.co",
  emailVerified: true,
  avatarUrl: null,
  status: "active",
  profileComplete: true,
  hasPassword: true,
  isMinor: false,
  pendingEmailChange: null,
};

function renderDetail({ signedIn = true, saved = false } = {}) {
  const store = makeStore();
  store.dispatch(setSingleJob(JOB as never));
  if (signedIn) store.dispatch(setUser(SEEKER as never));
  vi.spyOn(apiClient, "get").mockImplementation(async (url: string) => {
    if (url === "/saved/job-1") return { data: { success: true, saved } } as never;
    if (url.startsWith("/job/get/")) return { data: { success: true, job: JOB } } as never;
    if (url === "/application/get") {
      return { data: { success: true, items: [], total: 0, page: 1, pages: 0 } } as never;
    }
    throw new Error(`unexpected GET ${url}`);
  });
  return render(
    <Provider store={store}>
      <QueryClientProvider client={makeQueryClient()}>
        <MemoryRouter initialEntries={["/description/job-1"]}>
          <Routes>
            <Route path="/description/:id" element={<JobDescription />} />
            <Route path="/login" element={<div data-testid="login" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>,
  );
}

describe("the detail page's save control", () => {
  afterEach(() => vi.restoreAllMocks());

  it("routes an anonymous click to sign-in with a way back", async () => {
    renderDetail({ signedIn: false });
    await userEvent.click(await screen.findByRole("button", { name: /save role/i }));
    expect(await screen.findByTestId("login")).toBeInTheDocument();
  });

  it("shows Saved from the per-job read and unsaves on click", async () => {
    renderDetail({ saved: true });
    const button = await screen.findByRole("button", { name: /^Saved$/ });
    expect(button).toHaveAttribute("aria-pressed", "true");

    const remove = vi.spyOn(apiClient, "delete").mockResolvedValue({ data: { success: true } } as never);
    await userEvent.click(button);
    expect(remove).toHaveBeenCalledWith("/saved/job-1");
  });

  it("saves on click when unsaved", async () => {
    renderDetail({ saved: false });
    const button = await screen.findByRole("button", { name: /save role/i });
    expect(button).toHaveAttribute("aria-pressed", "false");

    const add = vi.spyOn(apiClient, "post").mockResolvedValue({ data: { success: true } } as never);
    await userEvent.click(button);
    expect(add).toHaveBeenCalledWith("/saved/job-1");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd D:\job-portal-2.0\frontend; npx vitest run tests/savedJobs.test.tsx`
Expected: FAIL — no Save button exists.

- [ ] **Step 3: The hooks**

Create `frontend/src/hooks/useSavedJobs.tsx`:

```tsx
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { PaginatedResponse, SavedJobDto } from "@jobportal/shared";

import { apiClient } from "@/lib/apiClient";

/**
 * The seeker's shortlist.
 *
 * The useAppliedJobs shape exactly: local page state (the list has no
 * shareable search, so a page param would be a URL that means nothing to
 * anyone it is sent to), keepPreviousData, and refetchOnWindowFocus — the
 * applied marker changes when the seeker applies from another surface, which
 * is the same "changed elsewhere" rationale that hook documents.
 */
const SAVED_KEY = ["saved-jobs"] as const;
/** The per-job checks the detail page's button state reads. */
const SAVED_ONE_KEY = ["saved-job"] as const;

export function useSavedJobs() {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: [...SAVED_KEY, page],
    queryFn: async ({ signal }) => {
      const res = await apiClient.get<{ success: boolean } & PaginatedResponse<SavedJobDto>>(
        "/saved",
        { params: { page }, signal },
      );
      return res.data;
    },
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });
  return { ...query, page, setPage };
}

/**
 * Is this job on the seeker's shortlist? Its own per-job read rather than a
 * scan of the list: exact at any list size, and cached per role.
 */
export function useIsSaved(jobId: string | undefined) {
  return useQuery({
    queryKey: [...SAVED_ONE_KEY, jobId],
    queryFn: async ({ signal }) => {
      const res = await apiClient.get<{ success: boolean; saved: boolean }>(`/saved/${jobId}`, {
        signal,
      });
      return res.data.saved;
    },
    enabled: Boolean(jobId),
  });
}

/**
 * The toggle pair. Both invalidate the per-job checks and the list, which is
 * what repaints every button and row — the server is idempotent, so there is
 * no client-side guard to race.
 */
function useSavedInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: SAVED_ONE_KEY });
    void queryClient.invalidateQueries({ queryKey: SAVED_KEY });
  };
}

export function useSaveJob() {
  const invalidate = useSavedInvalidation();
  return useMutation({
    mutationFn: async (jobId: string) => {
      await apiClient.post(`/saved/${jobId}`);
    },
    onSuccess: invalidate,
  });
}

export function useUnsaveJob() {
  const invalidate = useSavedInvalidation();
  return useMutation({
    mutationFn: async (jobId: string) => {
      await apiClient.delete(`/saved/${jobId}`);
    },
    onSuccess: invalidate,
  });
}
```

- [ ] **Step 4: The detail page button**

In `frontend/src/components/JobDescription.tsx`:

Add to the lucide import: `Bookmark`.

Add to the imports:

```tsx
import { useIsSaved, useSaveJob, useUnsaveJob } from "@/hooks/useSavedJobs";
```

Inside the component, after the `isApplied` state line, add:

```tsx
  const isSavedQuery = useIsSaved(jobId);
  const saveJob = useSaveJob();
  const unsaveJob = useUnsaveJob();
  // `=== true`: the read is `undefined` while loading, and the honest state
  // for a button that cannot know yet is the unsaved one it will flip from.
  const isSaved = isSavedQuery.data === true;
  const saving = saveJob.isPending || unsaveJob.isPending;

  const toggleSaveHandler = async () => {
    if (!user) {
      navigate("/login", {
        state: { from: `${location.pathname}${location.search}${location.hash}` },
      });
      return;
    }
    try {
      if (isSaved) await unsaveJob.mutateAsync(jobId!);
      else await saveJob.mutateAsync(jobId!);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not save this role"));
    }
  };
```

In the aside, after the apply-control conditional (the `closed && !isApplied ? … : minorBlocked ? … : <Button …Apply…>` block) and before the `<dl>`, add:

```tsx
          {/*
            The shortlist control. Offered to everyone the page is offered to:
            a closed role can still be saved (roles reopen, and the list is
            the seeker's own), and an anonymous click is routed to sign-in
            with a way back — the same redirect Apply uses.
          */}
          <Button
            onClick={toggleSaveHandler}
            disabled={saving}
            variant="outline"
            size="lg"
            aria-pressed={isSaved}
            className="mt-3 w-full"
          >
            <Bookmark aria-hidden="true" className={isSaved ? "fill-current" : ""} />
            {isSaved ? "Saved" : "Save role"}
          </Button>
```

- [ ] **Step 5: Run to verify passing**

Run: `cd D:\job-portal-2.0\frontend; npx vitest run tests/savedJobs.test.tsx tests/minorInternships.test.tsx`
Expected: PASS — the new describe, and the existing detail-page tests unchanged.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/hooks/useSavedJobs.tsx frontend/src/components/JobDescription.tsx frontend/tests/savedJobs.test.tsx
git commit -m "feat(web): the save control on every role's page"
```

---

### Task 3: Frontend — the /saved page, the route, and the nav link

**Files:**
- Create: `frontend/src/components/SavedJobs.tsx`
- Modify: `frontend/src/routes/appRoutes.tsx` (route)
- Modify: `frontend/src/components/shared/navLinks.ts` (session link)
- Modify: `frontend/tests/navbar.test.tsx` (gated pattern + session test)
- Test: `frontend/tests/savedJobs.test.tsx` (the list describes)

**Interfaces:**
- Consumes: `useSavedJobs`, `useUnsaveJob` (Task 2), `SavedJobDto`, `Pager`, `EmptyState`, `PageShell`, the table/badge primitives, `/description/:id`.
- Produces: `SavedJobs` at `/saved` behind `ProtectedRoute portal="seeker"`; "Saved" in the seeker session nav.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/tests/savedJobs.test.tsx` — extend the imports (`SavedJobs` component, `JobDto` type, `Link`-free rendering needs only what is there), then:

```tsx
import SavedJobs from "@/components/SavedJobs";
import type { JobDto } from "@jobportal/shared";

const openJob = (id: string, over: Partial<JobDto> = {}): JobDto =>
  ({
    id,
    title: `Role ${id}`,
    description: "Work.",
    requirements: [],
    salary: 12,
    location: "Remote",
    jobType: "Full-time",
    position: 1,
    department: "Engineering",
    experienceLevel: 1,
    remote: true,
    status: "open",
    company: { id: "c1", name: "Acme", logoUrl: null },
    createdAt: "2026-08-01T00:00:00.000Z",
    created_by: null,
    fit: null,
    postedBy: null,
    ...over,
  }) as JobDto;

function renderList(
  items: Array<{ id: string; jobId: string; savedAt: string; job: JobDto | null; applied: boolean }>,
) {
  vi.spyOn(apiClient, "get").mockResolvedValue({
    data: { success: true, items, total: items.length, page: 1, pages: 1 },
  } as never);
  return render(
    <Provider store={makeStore()}>
      <QueryClientProvider client={makeQueryClient()}>
        <MemoryRouter>
          <SavedJobs />
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>,
  );
}

describe("the saved list", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders the three row states with their markers", async () => {
    renderList([
      { id: "s1", jobId: "job-1", savedAt: "2026-08-20T10:00:00.000Z", job: openJob("job-1"), applied: false },
      {
        id: "s2",
        jobId: "job-2",
        savedAt: "2026-08-21T10:00:00.000Z",
        job: openJob("job-2", { title: "Closed Role", status: "closed" }),
        applied: true,
      },
      { id: "s3", jobId: "job-3", savedAt: "2026-08-22T10:00:00.000Z", job: null, applied: true },
    ]);

    // The open row links to its page.
    expect(await screen.findByRole("link", { name: /Role job-1/i })).toHaveAttribute(
      "href",
      "/description/job-1",
    );
    // The applied+closed row carries both facts — neither outweighs the other.
    expect(screen.getByText("Applied")).toBeInTheDocument();
    expect(screen.getByText("Closed")).toBeInTheDocument();
    // The deleted posting keeps its row, marked.
    expect(screen.getByText("No longer available")).toBeInTheDocument();
  });

  it("unsaves by the stored job id, so a dead row is removable too", async () => {
    renderList([
      { id: "s3", jobId: "job-3", savedAt: "2026-08-22T10:00:00.000Z", job: null, applied: true },
    ]);
    const remove = vi.spyOn(apiClient, "delete").mockResolvedValue({ data: { success: true } } as never);

    await userEvent.click(await screen.findByRole("button", { name: /remove/i }));
    expect(remove).toHaveBeenCalledWith("/saved/job-3");
  });

  it("makes the empty state an invitation to browse", async () => {
    renderList([]);
    expect(await screen.findByText(/no saved roles yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /browse open roles/i })).toHaveAttribute("href", "/jobs");
  });
});
```

In `frontend/tests/navbar.test.tsx`:

Add `/^\/saved/` to the `gated` patterns array in the "offers a signed-out %s no link into a gated route" test:

```ts
const gated = [/^\/profile/, /^\/hire\/(companies|jobs)/, /^\/admin\//, /^\/saved/];
```

And add a session-surface test to the main navbar describe (it uses the file's existing `renderNavbar` and `storeWithUser` helpers):

```ts
  it("offers a signed-in seeker their shortlist, and the route is mounted", async () => {
    const { getByRole } = renderNavbar(storeWithUser("seeker"));
    expect(getByRole("link", { name: "Saved" })).toHaveAttribute("href", "/saved");

    // The link must not advertise a route the table does not mount — the
    // same pin the workspace nav has.
    const collect = (routes: RouteObject[]): string[] =>
      routes.flatMap((route) => [
        ...(route.path ? [route.path] : []),
        ...collect(route.children ?? []),
      ]);
    expect(collect(appRoutes)).toContain("/saved");
  });
```

with `import type { RouteObject } from "react-router";` and `import { appRoutes } from "@/routes/appRoutes";` added to that file's imports.

- [ ] **Step 2: Run to verify failure**

Run: `cd D:\job-portal-2.0\frontend; npx vitest run tests/savedJobs.test.tsx tests/navbar.test.tsx`
Expected: FAIL — the list page does not exist; the nav has no Saved link.

- [ ] **Step 3: The page**

Create `frontend/src/components/SavedJobs.tsx`:

```tsx
import { Bookmark, BookmarkMinus } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";

import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { EmptyState } from "./layout/EmptyState";
import { Pager } from "./layout/ListControls";
import PageShell from "./layout/PageShell";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { getApiErrorMessage } from "@/lib/apiError";
import { useSavedJobs, useUnsaveJob } from "@/hooks/useSavedJobs";

/**
 * The seeker's shortlist: roles saved from their pages, newest first.
 *
 * Dead rows stay and are marked — a posting deleted after saving renders "No
 * longer available" (the applied list's stance: the seeker's record is
 * theirs), and a closed role keeps its row with the facts it had. Unsave is
 * the only write, and it targets the stored job id so a dead row is
 * removable exactly like a live one.
 */
export function SavedJobs() {
  const { data, isPending, isError, error, page, setPage } = useSavedJobs();
  const unsave = useUnsaveJob();

  const onUnsave = async (jobId: string) => {
    try {
      await unsave.mutateAsync(jobId);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not remove this role"));
    }
  };

  return (
    <PageShell width="wide" motion="standard" className="pt-8">
      <header className="border-b border-line pb-7">
        <p className="text-xs font-semibold uppercase text-signal-text">Your shortlist</p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-ink sm:text-5xl">
          Saved roles
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-ink-muted">
          {data
            ? `${data.total} ${data.total === 1 ? "role" : "roles"} saved — the ones you're still deciding on.`
            : "Roles you save from their pages wait for you here."}
        </p>
      </header>

      {isPending ? (
        <div className="mt-8 space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-14 rounded-surface" />
          ))}
        </div>
      ) : isError ? (
        <p role="alert" className="mt-8 text-sm text-danger-text">
          Could not load your saved roles:{" "}
          {error instanceof Error ? error.message : "unknown error"}
        </p>
      ) : data.items.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={Bookmark}
            title="No saved roles yet"
            description="Save roles from their pages and they'll wait for you here."
            action={
              <Button asChild variant="signal">
                <Link to="/jobs">Browse open roles</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-8">
          <Table>
            <TableCaption>Roles you have saved</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Salary</TableHead>
                <TableHead>Saved</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((item) => {
                // `?? "open"` for the same reason the detail page reads it:
                // a job row written before the field existed is open.
                const closed = (item.job?.status ?? "open") === "closed";
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.job ? (
                        <Link
                          className="text-ink hover:text-signal-text"
                          to={`/description/${item.job.id}`}
                        >
                          {item.job.title}
                          <span className="block text-xs font-normal text-ink-muted">
                            {item.job.company?.name}
                          </span>
                        </Link>
                      ) : (
                        <span className="text-ink-muted">No longer available</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.job ? (item.job.remote ? "Remote" : item.job.location) : "—"}
                    </TableCell>
                    <TableCell>{item.job ? `INR ${item.job.salary} LPA` : "—"}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {item.savedAt.split("T")[0]}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {item.applied ? <Badge variant="secondary">Applied</Badge> : null}
                        {closed ? <Badge variant="outline">Closed</Badge> : null}
                        {!item.applied && !closed ? (
                          <span className="text-ink-muted">—</span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={unsave.isPending}
                        aria-label={
                          item.job ? `Remove ${item.job.title} from saved` : "Remove from saved"
                        }
                        onClick={() => void onUnsave(item.jobId)}
                      >
                        <BookmarkMinus aria-hidden="true" />
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="mt-4">
            <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
          </div>
        </div>
      )}
    </PageShell>
  );
}

export default SavedJobs;
```

- [ ] **Step 4: The route and the nav link**

In `frontend/src/routes/appRoutes.tsx`, add `SavedJobs` to the component imports and register it beside `/jobs` (inside the same layout children, so it gets the public chrome):

```tsx
          {
            path: "/saved",
            element: (
              <ProtectedRoute portal="seeker">
                <SavedJobs />
              </ProtectedRoute>
            ),
          },
```

(Only `ProtectedRoute` — deliberately NOT `RequireProfileComplete`, per the spec: saving is a bookmark, not a consequential action.)

In `frontend/src/components/shared/navLinks.ts`, in the `"seeker"` case, add the link to the `session` list (after Jobs, before Help):

```ts
        return [
          { to: "/", label: "Home" },
          { to: "/jobs", label: "Jobs" },
          { to: "/saved", label: "Saved" },
          { to: "/help", label: "Help" },
          { to: "/updates", label: "Updates" },
        ];
```

(The public list is untouched — a signed-out visitor has no shortlist to link to.)

- [ ] **Step 5: Run to verify passing**

Run: `cd D:\job-portal-2.0\frontend; npx vitest run tests/savedJobs.test.tsx tests/navbar.test.tsx tests/routing.test.tsx tests/publicPages.test.tsx`
Expected: PASS — the new tests, and the routing/public-page pins unchanged (a new session-only link and a new gated route disturb neither).

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/components/SavedJobs.tsx frontend/src/routes/appRoutes.tsx frontend/src/components/shared/navLinks.ts frontend/tests/navbar.test.tsx frontend/tests/savedJobs.test.tsx
git commit -m "feat(web): the saved list, one click from the navbar"
```

---

### Task 4: Docs, release note, and the full gate

**Files:**
- Modify: `README.md` (roadmap row)
- Modify: `ARCHITECTURE.md` (Data model block + a feature section after "Bulk moves and posting health")
- Modify: `frontend/src/data/updates.ts` (new newest entry)

**Interfaces:**
- Consumes: everything shipped in Tasks 1–3.
- Produces: the durable record. No ADR — no architectural decision beyond the spec, which records its own.

- [ ] **Step 1: README roadmap**

Replace:

```markdown
| 3 | Saved jobs | Planned |
```

with:

```markdown
| Saved jobs (2026-09-02) | The seeker's shortlist: save from the role's page, list at /saved, idempotent unsave | Complete |
```

- [ ] **Step 2: ARCHITECTURE**

In the Data model collections block, after the `applications` entry, add:

```
savedJobs      seeker → seekers, job → jobs
               unique on {seeker, job}
```

And after the `### Bulk moves and posting health` section (before `### Location`), add:

```markdown
### Saved jobs

The seeker's shortlist (2026-09-02): `POST`/`DELETE /saved/:jobId` and
`GET /saved` under `authenticate("seeker")` — session-gated only, because
saving is a bookmark and the profile gate belongs to applying, the
consequential action. Save and unsave are idempotent by design: the unique
`{seeker, job}` index is the dedupe, a duplicate insert answers 200 (the
state the caller asked for already holds), and a delete that matched nothing
answers 200 too — a toggle must never error on stale button state, which is
the deliberate contrast with apply's 409. The list resolves jobs in two steps
(raw ids, then a populate keyed on them) so a deleted posting keeps its row
with a null `job` and its stored `jobId` — the id Unsave targets and the
applied join keys on — and closed roles keep their `status`. Each row carries
an `applied` boolean from one bounded read, so the list tells a to-do from a
done exactly. No recruiter surface reads this collection: a save is the
seeker's private signal.
```

- [ ] **Step 3: The release note**

In `frontend/src/data/updates.ts`, add as the newest entry at the top of `PLATFORM_UPDATES`:

```ts
  {
    id: "saved-jobs",
    date: "2026-09-02",
    kind: "Feature",
    title: "Save roles to a shortlist of your own",
    summary:
      "Every role's page now has a Save button. The roles you're still deciding on wait for you under Saved in the navigation — each with a note of whether you've already applied.",
    details: [
      "A saved role stays on your list even after it closes or its posting comes down, marked so you know where it stands.",
      "Saving is private: recruiters never see who saved a role.",
    ],
  },
```

- [ ] **Step 4: Run the release-note tests and the full gate**

Run: `cd D:\job-portal-2.0\frontend; npx vitest run tests/updates.test.tsx tests/updatesEmptyState.test.tsx`
Expected: PASS — newest-first ordering stays green with the new top entry.

Run from the workspace root (capture the real exit code — a pipe to `tail` eats it):

```powershell
npm run typecheck
npm run lint
npm run lint:colour
npm test
npm run audit:prod
git diff --check
```

Expected: all green. Backend tests are typechecked — the typecheck is the gate a focused vitest run cannot replace.

- [ ] **Step 5: Commit**

```powershell
git add README.md ARCHITECTURE.md frontend/src/data/updates.ts
git commit -m "docs: the saved jobs phase, and its release note"
```

- [ ] **Step 6: Hand back for push**

Both hosts auto-deploy on push to `main` — do not push without the user. When they push, confirm the Actions run actually went green (`gh run list --limit 1`).

---

## Self-Review (done at planning time)

**Spec coverage:** D1 (description-page-only control, Task 2) · D2 (SavedJob collection + unique index, Task 1) · D3 (idempotent toggles, 201/200 insert semantics, 404 only for a nonexistent job, Task 1) · D4 (own `/saved` route, session-gated only, applied-jobs-idiom table, session nav link, Task 3) · D5 (deleted → null-job row kept and removable; closed → status kept; no mail, Tasks 1 and 3) · D6 (server-side applied join on stored ids, Task 1) · D7 (per-job check endpoint, never-404, anonymous redirect with return path, Task 2). Contract section: all four endpoints and every status code mapped to a test. Non-goals: none violated — no board control, no notifications, no recruiter surface reads the collection.

**Placeholder scan:** no TBD/TODO/"add validation" steps; every code step carries its full code.

**Type consistency:** `saveJob` returns `boolean` and the controller maps it to 201/200; `useIsSaved` resolves `boolean` and the page narrows with `=== true`; `SavedJobDto`'s five fields match the service's return literal, the backend test's allowlist, and both frontend fixtures; `useUnsaveJob` takes the `jobId` the DTO always carries; `renderNavbar`/`storeWithUser`/`makeQueryClient`/`makeStore` are the existing helpers the new tests reuse.
