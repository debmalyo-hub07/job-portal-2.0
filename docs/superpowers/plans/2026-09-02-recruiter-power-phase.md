# The Recruiter Power Phase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bulk status moves on one job's applicant list (apply-where-legal, honest per-row results) and a derived posting-health block (dense 56-day series, first applicant, total) beside the pipeline funnel.

**Architecture:** Shared gains the bulk body schema and result contract first, then the API adds `POST /application/:jobId/status/bulk`, which checks the job's ownership once and runs each row through the same `transition()` path a single move takes, skipping refused rows with reasons. Posting health is derived inside the existing `listApplicants` from the complete ranked set already in memory — the dense-series helper is extracted from the admin console so both consumers share one contract. The frontend adds a checkbox column, bulk bar, confirmation dialog and honest result toast, then the health block (the console's JobsTrend pattern re-implemented on workspace tokens). Docs and the release note ship last.

**Tech Stack:** Express 5 services, Mongoose 8, Zod 4 schemas in `packages/shared`, React 19 + TanStack Query, the existing workspace and Radix primitives.

**Spec:** `docs/superpowers/specs/2026-09-02-recruiter-power-phase-design.md`

## Global Constraints

- The spec's decisions D1–D5 are contracts. The Non-goals are hard: no view tracking, no talent-pool rediscovery, no bulk withdraw, no bulk across jobs, no reason field on bulk reject.
- The single move's behavior is the pin: a bulk row moves through the module-private `transition()` — history entry, `decidedAt` on terminal stages, the candidate email on notifying stages, byte for byte.
- The bulk response is `{ success, moved, skipped: [{ id, reason }] }` with reasons exactly `TERMINAL`, `SAME_STATUS`, `NOT_FOUND`. `moved` is a count. The endpoint's own 404 is reserved for a job the caller does not own.
- The ids array is capped at 100 (`BULK_STATUS_CAP`), non-empty, every id an ObjectId string; the stage is `RECRUITER_SETTABLE`-derived.
- Posting health adds zero additional queries to `listApplicants` and stores/tracks nothing. Time-to-first is the client's subtraction, never a server opinion.
- Backend relative imports end `.js`; frontend imports do not. Cross-boundary request/response schemas live in `packages/shared`. `AppError` for API failures.
- Backend tests run from `backend/` (running them from the repo root skips setup.ts and looks like a broken app); shared tests from `packages/shared/`; frontend tests from `frontend/`.
- Rebuild shared after shared edits before any backend/frontend typecheck or web suite: `npm run build --workspace @jobportal/shared`.
- No raw colours — CSS custom-property tokens only; `npm run lint:colour` must stay at zero.
- The health series is UTC-keyed; its tests must also pass under `TZ=UTC` (CI runs UTC, the dev machine does not).
- No `Co-Authored-By` trailer in commit messages. Work lands on `main` — no feature branches, no worktree.
- A user-visible change publishes its release-note entry in `frontend/src/data/updates.ts` in the same commit that ships it.

---

### Task 1: Shared — the bulk body schema and the result contract

**Files:**
- Modify: `packages/shared/src/domain.ts` (schema + types, after `applicationStatusBodySchema` around line 142)
- Test: `packages/shared/tests/domain.test.ts` (extend)

**Interfaces:**
- Consumes: `objectIdSchema`, `RECRUITER_SETTABLE` (both already in scope in `domain.ts`).
- Produces: `BULK_STATUS_CAP = 100`, `bulkStatusBodySchema`, `BulkStatusBody`, `BulkSkipReason` (`"TERMINAL" | "SAME_STATUS" | "NOT_FOUND"`), `BulkStatusResult` (`{ moved: number; skipped: { id: string; reason: BulkSkipReason }[] }`). Note: the health DTO (`PostingHealthDto`, `DailySeriesPoint`, `ApplicantsPageDto.health`) deliberately does NOT land here — it lands in Task 3 with the backend that produces it, so every task ends compilable.

- [ ] **Step 1: Write the failing tests**

In `packages/shared/tests/domain.test.ts`, add `bulkStatusBodySchema` and `BULK_STATUS_CAP` to the import from `"../src/domain.js"`, then append this describe:

```ts
describe("bulkStatusBodySchema", () => {
  const ids = ["64b0c8f2a9d3e45f6a7b8c9d", "64b0c8f2a9d3e45f6a7b8c9e"];

  it("accepts a legal batch and every settable stage", () => {
    // Derived from RECRUITER_SETTABLE, so the schema and the state machine
    // still name the same set — same assertion the single move's schema has.
    for (const status of RECRUITER_SETTABLE) {
      expect(bulkStatusBodySchema.parse({ applicationIds: ids, status }).status).toBe(status);
    }
  });

  it("refuses an empty batch and a batch over the cap", () => {
    expect(
      bulkStatusBodySchema.safeParse({ applicationIds: [], status: "rejected" }).success,
    ).toBe(false);
    const tooMany = Array.from({ length: BULK_STATUS_CAP + 1 }, () => "64b0c8f2a9d3e45f6a7b8c9d");
    expect(
      bulkStatusBodySchema.safeParse({ applicationIds: tooMany, status: "rejected" }).success,
    ).toBe(false);
  });

  it("refuses a malformed id and the stages a recruiter may not set", () => {
    expect(
      bulkStatusBodySchema.safeParse({ applicationIds: ["not-an-id"], status: "rejected" }).success,
    ).toBe(false);
    // `applied` is the creation default; `withdrawn` is the candidate's alone.
    for (const status of ["applied", "withdrawn"]) {
      expect(bulkStatusBodySchema.safeParse({ applicationIds: ids, status }).success).toBe(false);
    }
  });

  it("is strict about unknown keys", () => {
    expect(
      bulkStatusBodySchema.safeParse({ applicationIds: ids, status: "rejected", reason: "x" })
        .success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd D:\job-portal-2.0\packages\shared; npx vitest run tests/domain.test.ts`
Expected: FAIL — `bulkStatusBodySchema` is not exported.

- [ ] **Step 3: Implement**

In `packages/shared/src/domain.ts`, immediately after `applicationStatusBodySchema` (and its `export type ApplicationStatusBody` stays where it is), insert:

```ts
/**
 * A bulk status move: one stage, many of one job's applications.
 *
 * The ids are capped at 100 — larger than any page the applicants screen
 * holds, small enough to bound one request's work. Each id is an ObjectId
 * string, so a malformed one fails validation here rather than reaching the
 * service, and the stage rides the same RECRUITER_SETTABLE derivation the
 * single move's schema uses.
 */
export const BULK_STATUS_CAP = 100;

export const bulkStatusBodySchema = z
  .object({
    applicationIds: z.array(objectIdSchema).min(1).max(BULK_STATUS_CAP),
    status: z.enum(RECRUITER_SETTABLE),
  })
  .strict();

export type BulkStatusBody = z.infer<typeof bulkStatusBodySchema>;

/** Why one row of a bulk move did not move. */
export type BulkSkipReason = "TERMINAL" | "SAME_STATUS" | "NOT_FOUND";

/**
 * The bulk move's honest result: how many rows moved, and every row that
 * refused with its reason. Skipped rows are reported, never a veto.
 */
export type BulkStatusResult = {
  moved: number;
  skipped: { id: string; reason: BulkSkipReason }[];
};
```

- [ ] **Step 4: Run to verify passing, then rebuild**

Run: `cd D:\job-portal-2.0\packages\shared; npx vitest run tests/domain.test.ts`
Expected: PASS (whole file).

Run: `cd D:\job-portal-2.0; npm run build --workspace @jobportal/shared`
Expected: build succeeds (backend and web read the dist).

- [ ] **Step 5: Commit**

```powershell
git add packages/shared/src/domain.ts packages/shared/tests/domain.test.ts
git commit -m "feat(shared): the bulk status body and its honest result contract"
```

---

### Task 2: Backend — the bulk endpoint, apply-where-legal

**Files:**
- Modify: `backend/src/services/application.service.ts` (new `bulkUpdateApplicationStatus` after `updateApplicationStatus`)
- Modify: `backend/src/controllers/application.controller.ts` (new `bulkUpdateStatus`)
- Modify: `backend/src/routes/application.route.ts` (new route after the single status route)
- Test: `backend/tests/application.test.ts` (new describe)

**Interfaces:**
- Consumes: `bulkStatusBodySchema` (controller), `BulkStatusResult` (service), plus everything `updateApplicationStatus` already uses: `getOwnedJob`, `transition`, `transitionRefusal`, `notifiesSeeker`, `dispatch`, `sendRendered`, `renderApplicationStatusEmail`.
- Produces: `bulkUpdateApplicationStatus(recruiterId: string, jobId: string, applicationIds: string[], status: ApplicationStatus): Promise<BulkStatusResult>`; HTTP `POST /api/v1/application/:jobId/status/bulk` gated `authenticate("recruiter") + requireApproved + csrfProtection()`, answering `{ success, moved, skipped }`.

- [ ] **Step 1: Write the failing tests**

In `backend/tests/application.test.ts`, add a new describe as a sibling of `"applicants + status, ownership matrix"` (inside the outer `describe("application routes")`, so it reuses `recruiter`, `rival`, `seeker`, `jobId`, `apply`, `outbox`):

```ts
describe("the bulk move", () => {
  let ids: Record<string, string>;
  let rivalJobId: string;
  let foreignId: string;

  beforeEach(async () => {
    const actors: Awaited<ReturnType<typeof signedUpOn>>[] = [];
    for (const email of ["b1@example.com", "b2@example.com", "b3@example.com", "b4@example.com"]) {
      const who = await signedUpOn("seeker", email);
      actors.push(who);
      await request(app)
        .post(`/api/v1/application/apply/${jobId}`)
        .use(asSession("seeker", who));
    }

    const list = await request(app)
      .get(`/api/v1/application/${jobId}/applicants?limit=10`)
      .use(asSession("recruiter", recruiter));
    ids = Object.fromEntries(
      list.body.items.map((i: { email: string; applicationId: string }) => [
        i.email,
        i.applicationId,
      ]),
    );

    // A rival's job with one application on it: legal work for the rival,
    // invisible to this recruiter's batch.
    const rivalCompany = await request(app)
      .post("/api/v1/company/register")
      .use(asSession("recruiter", rival))
      .send({ name: "RivalCo" });
    const rivalJob = await request(app)
      .post("/api/v1/job/post")
      .use(asSession("recruiter", rival))
      .send({
        title: "Rival Role",
        description: "d",
        requirements: "ts",
        salary: 10,
        experience: 1,
        location: "Remote",
        jobType: "Full-time",
        position: "1",
        companyId: rivalCompany.body.company.id,
      });
    rivalJobId = rivalJob.body.job.id;
    await request(app)
      .post(`/api/v1/application/apply/${rivalJobId}`)
      .use(asSession("seeker", actors[0]!));
    const rivalList = await request(app)
      .get(`/api/v1/application/${rivalJobId}/applicants`)
      .use(asSession("recruiter", rival));
    foreignId = rivalList.body.items[0].applicationId;
  });

  const bulk = (body: unknown, session = recruiter) =>
    request(app)
      .post(`/api/v1/application/${jobId}/status/bulk`)
      .use(asSession("recruiter", session))
      .send(body);

  it("moves the legal rows and reports the refused ones with reasons", async () => {
    // One row already rejected, one already shortlisted; the other two open.
    await request(app)
      .post(`/api/v1/application/status/${ids["b1@example.com"]}/update`)
      .use(asSession("recruiter", recruiter))
      .send({ status: "rejected" });
    await request(app)
      .post(`/api/v1/application/status/${ids["b2@example.com"]}/update`)
      .use(asSession("recruiter", recruiter))
      .send({ status: "shortlisted" });

    const res = await bulk({
      applicationIds: [
        ids["b1@example.com"],
        ids["b2@example.com"],
        ids["b3@example.com"],
        ids["b4@example.com"],
      ],
      status: "shortlisted",
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, moved: 2 });
    expect(res.body.skipped).toEqual([
      { id: ids["b1@example.com"], reason: "TERMINAL" },
      { id: ids["b2@example.com"], reason: "SAME_STATUS" },
    ]);
    // The refused rows are untouched — a skip is a report, never a veto.
    expect((await Application.findById(ids["b1@example.com"]))?.status).toBe("rejected");
    expect((await Application.findById(ids["b2@example.com"]))?.status).toBe("shortlisted");
    // A moved row carries the transition byte-for-byte.
    const moved = await Application.findById(ids["b3@example.com"]);
    expect(moved?.status).toBe("shortlisted");
    expect(moved?.history.at(-1)).toMatchObject({ status: "shortlisted", byPortal: "recruiter" });
  });

  it("writes the same record a single move writes, decidedAt included", async () => {
    const res = await bulk({
      applicationIds: [ids["b1@example.com"], ids["b2@example.com"]],
      status: "rejected",
    });
    expect(res.body.moved).toBe(2);
    for (const email of ["b1@example.com", "b2@example.com"]) {
      const doc = await Application.findById(ids[email]);
      expect(doc?.status).toBe("rejected");
      expect(doc?.decidedAt).toBeInstanceOf(Date);
      expect(doc?.history.at(-1)).toMatchObject({ status: "rejected", byPortal: "recruiter" });
    }
  });

  it("skips a foreign id and an unknown id as NOT_FOUND while the rest move", async () => {
    const unknownId = new mongoose.Types.ObjectId().toHexString();
    const res = await bulk({
      applicationIds: [foreignId, unknownId, ids["b2@example.com"]],
      status: "interview",
    });
    expect(res.status).toBe(200);
    expect(res.body.moved).toBe(1);
    expect(res.body.skipped).toEqual([
      { id: foreignId, reason: "NOT_FOUND" },
      { id: unknownId, reason: "NOT_FOUND" },
    ]);
    // The foreign row is untouched — it was never this batch's to move.
    expect((await Application.findById(foreignId))?.status).toBe("applied");
  });

  it("404s the whole request for a job the caller does not own", async () => {
    const res = await request(app)
      .post(`/api/v1/application/${rivalJobId}/status/bulk`)
      .use(asSession("recruiter", recruiter))
      .send({ applicationIds: [ids["b1@example.com"]], status: "shortlisted" });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("JOB_NOT_FOUND");
  });

  it("bulk reject emails every moved candidate exactly once, and reviewed mails nobody", async () => {
    outbox.length = 0;
    const res = await bulk({
      applicationIds: [ids["b1@example.com"], ids["b2@example.com"]],
      status: "rejected",
    });
    expect(res.body.moved).toBe(2);
    await vi.waitFor(() => {
      for (const email of ["b1@example.com", "b2@example.com"]) {
        expect(outbox.filter((m) => m.to === email)).toHaveLength(1);
      }
    });

    // `reviewed` is deliberately silent, singly and in bulk.
    outbox.length = 0;
    const quiet = await bulk({ applicationIds: [ids["b3@example.com"]], status: "reviewed" });
    expect(quiet.body.moved).toBe(1);
    await new Promise((r) => setTimeout(r, 150));
    expect(outbox.filter((m) => m.to === "b3@example.com")).toHaveLength(0);
  });

  it("answers a duplicated id as a same-status skip, not a second move", async () => {
    const id = ids["b1@example.com"];
    const res = await bulk({ applicationIds: [id, id], status: "shortlisted" });
    expect(res.body).toMatchObject({ moved: 1 });
    expect(res.body.skipped).toEqual([{ id, reason: "SAME_STATUS" }]);
  });

  it("rejects a 101-id batch, an empty one, a malformed id, and operator stages", async () => {
    const many = Array.from({ length: 101 }, () => new mongoose.Types.ObjectId().toHexString());
    expect((await bulk({ applicationIds: many, status: "rejected" })).status).toBe(400);
    expect((await bulk({ applicationIds: [], status: "rejected" })).status).toBe(400);
    expect((await bulk({ applicationIds: ["not-an-id"], status: "rejected" })).status).toBe(400);
    for (const status of ["applied", "withdrawn"]) {
      expect((await bulk({ applicationIds: [ids["b1@example.com"]], status })).status).toBe(400);
    }
  });

  it("anonymous and seeker cannot reach the bulk route", async () => {
    const body = { applicationIds: [ids["b1@example.com"]], status: "shortlisted" };
    expect(
      (await request(app).post(`/api/v1/application/${jobId}/status/bulk`).send(body)).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post(`/api/v1/application/${jobId}/status/bulk`)
          .use(asSession("seeker", seeker))
          .send(body)
      ).status,
    ).toBe(401);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd D:\job-portal-2.0\backend; npx vitest run tests/application.test.ts`
Expected: FAIL — every bulk test gets 404 (the route does not exist), not the expected 200/400 shapes.

- [ ] **Step 3: Implement the service**

In `backend/src/services/application.service.ts`:

Add `BulkStatusResult` to the `import type { ... } from "@jobportal/shared"` block.

After the `updateApplicationStatus` function, add:

```ts
/**
 * The bulk move: one stage, many of this job's applications, legal rows only.
 *
 * The job's ownership is checked once, and a job the caller does not own is
 * the request's own 404, exactly as the per-job list. Each row then answers
 * for itself through the same guarded state machine a single move runs —
 * history entry, `decidedAt` on terminal stages, the candidate email on
 * notifying stages, byte for byte. A refused row is skipped and reported with
 * its reason rather than vetoing the batch: a real applicant list is mixed,
 * and one decided row must not block nine open ones.
 *
 * A foreign or unknown id is a skipped row, not a 404 — the other rows' work
 * is legal — which is the one place bulk deliberately differs from a single
 * move, where a foreign application answers exactly as a missing one does.
 */
export async function bulkUpdateApplicationStatus(
  recruiterId: string,
  jobId: string,
  applicationIds: string[],
  status: ApplicationStatus,
): Promise<BulkStatusResult> {
  const job = await getOwnedJob(recruiterId, jobId);

  const skipped: BulkStatusResult["skipped"] = [];
  const moved: { applicant: unknown; from: ApplicationStatus }[] = [];

  for (const id of applicationIds) {
    const application = await Application.findById(id).select(
      "job status history decidedAt applicant",
    );
    // Foreign to this job — another recruiter's, or the caller's own other
    // posting, this batch being one job's pipeline — answers as a missing row.
    if (!application || String(application.job) !== jobId) {
      skipped.push({ id, reason: "NOT_FOUND" });
      continue;
    }
    const refusal = transitionRefusal(application.status as ApplicationStatus, status, "recruiter");
    // NOT_ALLOWED_FOR_PORTAL cannot occur — the body schema pins `status` to
    // RECRUITER_SETTABLE — and if it ever did, `transition` below remains the
    // authority and the request fails loudly rather than mis-reporting.
    if (refusal === "TERMINAL" || refusal === "SAME_STATUS") {
      skipped.push({ id, reason: refusal });
      continue;
    }
    const from = await transition(application, status, "recruiter");
    moved.push({ applicant: application.applicant, from });
  }

  // Notifying stages mail exactly the moved rows, byte-for-byte as the single
  // move's mail. The company is constant across the batch, so it is read once;
  // the seekers are one `$in` read rather than one per row.
  const notifying = moved.filter((row) => notifiesSeeker(row.from, status));
  if (notifying.length > 0) {
    const [company, seekers] = await Promise.all([
      Company.findById(job.company).select("name"),
      Seeker.find({
        _id: mongoose.trusted({ $in: notifying.map((row) => row.applicant) }),
      }).select("email"),
    ]);
    const emailByApplicant = new Map(seekers.map((s) => [String(s._id), s.email]));
    for (const row of notifying) {
      const email = emailByApplicant.get(String(row.applicant));
      if (email) {
        dispatch(
          sendRendered(
            email,
            renderApplicationStatusEmail(
              status as "shortlisted" | "interview" | "offered" | "rejected",
              job.title,
              company?.name ?? null,
            ),
          ),
        );
      }
    }
  }

  return { moved: moved.length, skipped };
}
```

- [ ] **Step 4: Implement the controller and route**

In `backend/src/controllers/application.controller.ts`, add `bulkStatusBodySchema` to the `@jobportal/shared` import block, and after `updateStatus` add:

```ts
/**
 * The bulk move. The job is the route's target and the ids name rows inside
 * it; the service owns the apply-where-legal contract and the honest result.
 */
export const bulkUpdateStatus = async (req: Request, res: Response): Promise<void> => {
  const jobId = parseBody(objectIdSchema, req.params.jobId);
  const { applicationIds, status } = parseBody(bulkStatusBodySchema, req.body);
  const result = await applicationService.bulkUpdateApplicationStatus(
    req.auth!.id,
    jobId,
    applicationIds,
    status,
  );
  res.status(200).json({ success: true, ...result });
};
```

In `backend/src/routes/application.route.ts`, add `bulkUpdateStatus` to the controller import block, and after the `/status/:id/update` route add:

```ts
// The bulk move: one stage, many of this job's applications. Legal rows move
// and refused rows are skipped with a reason, so a mixed page is one action.
// Same gates as the single move — an unapproved recruiter changes nothing.
// (`/:jobId/status/bulk` cannot collide with `/status/:id/update`: that
// pattern pins its first segment to the literal `status` and its last to
// `update`, neither of which this path's segments are.)
router
  .route("/:jobId/status/bulk")
  .post(authenticate("recruiter"), requireApproved, csrfProtection(), bulkUpdateStatus);
```

- [ ] **Step 5: Run to verify passing**

Run: `cd D:\job-portal-2.0\backend; npx vitest run tests/application.test.ts`
Expected: PASS (whole file — the single-move suite is the pin that bulk changed nothing).

- [ ] **Step 6: Commit**

```powershell
git add backend/src/services/application.service.ts backend/src/controllers/application.controller.ts backend/src/routes/application.route.ts backend/tests/application.test.ts
git commit -m "feat(api): the bulk status move, apply-where-legal"
```

---

### Task 3: Shared + Backend — posting health, derived not queried

**Files:**
- Create: `backend/src/lib/dailySeries.ts`
- Modify: `packages/shared/src/domain.ts` (`DailySeriesPoint`, `PostingHealthDto`, `ApplicantsPageDto.health`)
- Modify: `packages/shared/src/admin.ts` (`AdminSeriesPoint` becomes the alias)
- Modify: `backend/src/services/adminConsole.service.ts` (use the shared lib)
- Modify: `backend/src/services/application.service.ts` (derive health in `listApplicants`)
- Test: `packages/shared/tests/domain.test.ts` (type-level only — no new runtime asserts needed), `backend/tests/application.test.ts` (new describe), and `backend/tests/admin-insights.test.ts` must stay green as the refactor pin

**Interfaces:**
- Consumes: `ApplicantsPageDto`, `PaginatedResponse`, the ranked set already computed in `listApplicants`.
- Produces: `DailySeriesPoint = { date: string; count: number }` (UTC `YYYY-MM-DD`); `PostingHealthDto = { series: DailySeriesPoint[]; firstApplicationAt: string | null; total: number }`; `ApplicantsPageDto` gains required `health: PostingHealthDto`; `AdminSeriesPoint = DailySeriesPoint`; `backend/src/lib/dailySeries.ts` exports `SERIES_DAYS = 56`, `utcMidnight(daysBack: number): Date`, `isoDay(date: Date): string`, `denseDailySeries(countByDay: Map<string, number>): DailySeriesPoint[]`.

- [ ] **Step 1: Write the failing backend tests**

In `backend/tests/application.test.ts`, add as a sibling of `"the bulk move"`:

```ts
describe("posting health", () => {
  const utcDay = (daysBack: number) => {
    const d = new Date();
    d.setUTCHours(12, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - daysBack);
    return d;
  };
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  it("derives a dense zero-filled series and the earliest application, whole-set", async () => {
    const second = await signedUpOn("seeker", "h2@example.com");
    const third = await signedUpOn("seeker", "h3@example.com");
    const fourth = await signedUpOn("seeker", "h4@example.com");
    await apply({ portal: "seeker", session: seeker });
    await apply({ portal: "seeker", session: second });
    // Backdated at creation: `createdAt` is immutable under timestamps:true,
    // so it is set here or never.
    await Application.create([
      {
        job: jobId,
        applicant: (third as { id: string }).id,
        status: "applied",
        history: [{ status: "applied", at: utcDay(3), byPortal: "seeker" }],
        createdAt: utcDay(3),
      },
      {
        job: jobId,
        applicant: (fourth as { id: string }).id,
        status: "applied",
        history: [{ status: "applied", at: utcDay(40), byPortal: "seeker" }],
        createdAt: utcDay(40),
      },
    ]);

    // `limit=1`: health must describe the whole set, not the page — the same
    // rule the funnel obeys.
    const res = await request(app)
      .get(`/api/v1/application/${jobId}/applicants?limit=1`)
      .use(asSession("recruiter", recruiter))
      .expect(200);

    const { series, firstApplicationAt, total } = res.body.health;
    expect(series).toHaveLength(56);
    // Dense: every consecutive pair is exactly one day apart, so the client
    // never infers a gap the data does not contain.
    for (let i = 0; i < series.length - 1; i += 1) {
      expect(Date.parse(series[i + 1].date) - Date.parse(series[i].date)).toBe(86_400_000);
    }
    expect(series.at(-1).date).toBe(iso(utcDay(0)));
    expect(series.find((p: { date: string }) => p.date === iso(utcDay(0))).count).toBe(2);
    expect(series.find((p: { date: string }) => p.date === iso(utcDay(3))).count).toBe(1);
    expect(series.find((p: { date: string }) => p.date === iso(utcDay(40))).count).toBe(1);
    expect(series.find((p: { date: string }) => p.date === iso(utcDay(10))).count).toBe(0);
    expect(firstApplicationAt).toBe(utcDay(40).toISOString());
    expect(total).toBe(4);
    expect(res.body.total).toBe(4);
  });

  it("answers null firstApplicationAt and an all-zero series for an empty job", async () => {
    const company = await request(app)
      .post("/api/v1/company/register")
      .use(asSession("recruiter", recruiter))
      .send({ name: "HealthCo" });
    const job = await request(app)
      .post("/api/v1/job/post")
      .use(asSession("recruiter", recruiter))
      .send({
        title: "Quiet Role",
        description: "d",
        requirements: "ts",
        salary: 10,
        experience: 1,
        location: "Remote",
        jobType: "Full-time",
        position: "1",
        companyId: company.body.company.id,
      });

    const res = await request(app)
      .get(`/api/v1/application/${job.body.job.id}/applicants`)
      .use(asSession("recruiter", recruiter))
      .expect(200);

    expect(res.body.health.firstApplicationAt).toBeNull();
    expect(res.body.health.total).toBe(0);
    expect(res.body.health.series).toHaveLength(56);
    expect(res.body.health.series.every((p: { count: number }) => p.count === 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd D:\job-portal-2.0\backend; npx vitest run tests/application.test.ts -t "posting health"`
Expected: FAIL — `res.body.health` is undefined.

- [ ] **Step 3: Create the shared series lib**

Create `backend/src/lib/dailySeries.ts`:

```ts
import type { DailySeriesPoint } from "@jobportal/shared";

/**
 * Dense daily series, shared by the console's jobs-posted trend and the
 * workspace's posting health.
 *
 * The contract every consumer rests on: every day of the window present,
 * zero-filled, ascending, keyed on UTC `YYYY-MM-DD`. A sparse series makes
 * the client infer the gaps, and a chart that silently closes one draws a
 * trend the data does not contain.
 */

/** Eight weeks. Long enough to show a trend, short enough to stay one screen. */
export const SERIES_DAYS = 56;

/** Midnight UTC, `daysBack` days ago. Series are keyed on UTC dates. */
export function utcMidnight(daysBack: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d;
}

export const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

export function denseDailySeries(countByDay: Map<string, number>): DailySeriesPoint[] {
  return Array.from({ length: SERIES_DAYS }, (_, i) => {
    const date = isoDay(utcMidnight(SERIES_DAYS - 1 - i));
    return { date, count: countByDay.get(date) ?? 0 };
  });
}
```

- [ ] **Step 4: Add the shared DTO types**

In `packages/shared/src/domain.ts`, replace the `ApplicantsPageDto` block (currently `export type ApplicantsPageDto = PaginatedResponse<ApplicantDto> & { funnel: Record<ApplicationStatus, number>; };`) with:

```ts
/** One day of a dense daily series. `date` is a UTC `YYYY-MM-DD`. */
export type DailySeriesPoint = { date: string; count: number };

/**
 * Posting health: how a role is doing at attracting applicants, derived from
 * the application records the platform already keeps — nothing is tracked,
 * nothing is stored, nothing new reaches the privacy page.
 * `firstApplicationAt` is the raw fact (null when nobody has applied);
 * time-to-first is the client's subtraction of the job's `createdAt`, not a
 * server opinion.
 */
export type PostingHealthDto = {
  /**
   * Dense and ascending, the console's jobsPostedSeries shape: every day of
   * the window present, zero-filled, so the client never infers a gap.
   */
  series: DailySeriesPoint[];
  firstApplicationAt: string | null;
  total: number;
};

export type ApplicantsPageDto = PaginatedResponse<ApplicantDto> & {
  funnel: Record<ApplicationStatus, number>;
  health: PostingHealthDto;
};
```

In `packages/shared/src/admin.ts`, add `DailySeriesPoint` to the type imports from `"./domain.js"` and replace the local definition:

```ts
/** One day of the jobs-posted series. `date` is a UTC `YYYY-MM-DD`. */
export type AdminSeriesPoint = DailySeriesPoint;
```

Then rebuild: `cd D:\job-portal-2.0; npm run build --workspace @jobportal/shared`

- [ ] **Step 5: Point the console at the lib**

In `backend/src/services/adminConsole.service.ts`:

Delete the private `SERIES_DAYS`, `utcMidnight`, and `isoDay` definitions (the block comment "Eight weeks…" through `const isoDay = …`), and add to the relative imports:

```ts
import { SERIES_DAYS, denseDailySeries, utcMidnight } from "../lib/dailySeries.js";
```

Replace the series construction inside `getInsights`:

```ts
  // Dense and ascending. A sparse series makes the client infer the gaps, and a
  // chart that silently closes one draws a trend the data does not contain.
  const countByDay = new Map(seriesRows.map((row) => [row._id, row.n]));
  const jobsPostedSeries = Array.from({ length: SERIES_DAYS }, (_, i) => {
    const date = isoDay(utcMidnight(SERIES_DAYS - 1 - i));
    return { date, count: countByDay.get(date) ?? 0 };
  });
```

with:

```ts
  // Dense and ascending — the shared series contract; see lib/dailySeries.
  const jobsPostedSeries = denseDailySeries(new Map(seriesRows.map((row) => [row._id, row.n])));
```

(`seriesFrom = utcMidnight(SERIES_DAYS - 1)` stays as-is — both names now come from the import.)

- [ ] **Step 6: Derive health in `listApplicants`**

In `backend/src/services/application.service.ts`, add to the relative imports:

```ts
import { denseDailySeries, isoDay } from "../lib/dailySeries.js";
```

Inside `listApplicants`, after `const total = ranked.length;` and before the `return`, insert:

```ts
  // Posting health: derived from the complete set already in memory — zero
  // additional queries, the same set the funnel counted. The series is dense
  // and UTC-keyed so the client never infers a gap; `firstApplicationAt` is
  // the raw fact, and time-to-first stays the client's subtraction.
  const countByDay = new Map<string, number>();
  let firstApplied: Date | null = null;
  for (const { application } of ranked) {
    const at = application.createdAt ?? null;
    if (!at) continue;
    if (!firstApplied || at < firstApplied) firstApplied = at;
    const day = isoDay(at);
    countByDay.set(day, (countByDay.get(day) ?? 0) + 1);
  }
```

and extend the returned object (after `funnel,`) with:

```ts
    health: {
      series: denseDailySeries(countByDay),
      firstApplicationAt: firstApplied?.toISOString() ?? null,
      total,
    },
```

- [ ] **Step 7: Run everything this task touches, including the UTC rehearsal**

Run: `cd D:\job-portal-2.0\backend; npx vitest run tests/application.test.ts tests/admin-insights.test.ts`
Expected: PASS — the new health describe, and the console's series tests unchanged (the refactor pin).

Run the CI timezone rehearsal for the time-touching suite:

```powershell
cd D:\job-portal-2.0\backend
$env:TZ = "UTC"; npx vitest run tests/application.test.ts; Remove-Item Env:TZ
```

Expected: PASS (the series is UTC-keyed by construction; this proves it).

- [ ] **Step 8: Commit**

```powershell
git add backend/src/lib/dailySeries.ts backend/src/services/adminConsole.service.ts backend/src/services/application.service.ts packages/shared/src/domain.ts packages/shared/src/admin.ts backend/tests/application.test.ts
git commit -m "feat(api): posting health rides the applicants page"
```

---

### Task 4: Frontend — the checkbox column, the bulk bar, the honest result

**Files:**
- Modify: `frontend/src/hooks/useRecruiterWorkspace.tsx` (new `useBulkApplicantDecision`)
- Modify: `frontend/src/components/workspace/Applicants.tsx` (full rewrite below)
- Test: `frontend/tests/workspace.test.tsx` (extend the `Applicants` describe)

**Interfaces:**
- Consumes: `BulkStatusResult`, `BulkSkipReason`, `RECRUITER_SETTABLE`, `statusMeta`, `ConfirmDialog`, `apiClient`.
- Produces: `useBulkApplicantDecision(jobId: string | undefined)` — a mutation whose `mutateAsync({ applicationIds: string[]; status })` resolves to `{ success: boolean } & BulkStatusResult`, invalidating `[...WORKSPACE_KEY, "applicants", jobId]` and `[...WORKSPACE_KEY, "queue"]` on success (exactly as `useApplicantDecision` does).

- [ ] **Step 1: Write the failing tests**

In `frontend/tests/workspace.test.tsx`:

Add `import { toast } from "sonner";` to the imports.

Inside the `Applicants` describe (which already has `afterEach(() => vi.restoreAllMocks())` and the `fit` fixture), add this helper next to `withOneApplicant`:

```ts
  const withApplicants = (count: number) =>
    vi.spyOn(apiClient, "get").mockResolvedValue({
      data: {
        success: true,
        items: Array.from({ length: count }, (_, i) => ({
          applicationId: `a${i + 1}`,
          status: "applied" as const,
          appliedAt: "2026-01-01T00:00:00.000Z",
          fullName: `Candidate ${i + 1}`,
          email: `c${i + 1}@example.com`,
          phone: null,
          headline: null,
          skills: [],
          resumeUrl: null,
          resumeName: null,
          fit,
        })),
        total: count,
        page: 1,
        pages: 1,
      },
    } as never);
```

and these tests:

```ts
  it("shows the bulk bar at one selection, selects all, and clears", async () => {
    withApplicants(2);
    renderRoute(<Applicants />, {
      route: "/hire/jobs/64b0c8f2a9d3e45f6a7b8c9d/applicants",
      path: "/hire/jobs/:id/applicants",
    });
    // No bar before a selection — "Not selected" is a status label, so the
    // anchored regex keeps the absence assertion honest.
    expect(screen.queryByText(/^\d+ selected$/)).toBeNull();

    await userEvent.click(await screen.findByLabelText("Select Candidate 1"));
    expect(await screen.findByText("1 selected")).toBeInTheDocument();
    // Some-but-not-all is indeterminate on the header box.
    expect(screen.getByLabelText("Select every applicant on this page").indeterminate).toBe(true);

    await userEvent.click(screen.getByLabelText("Select every applicant on this page"));
    expect(await screen.findByText("2 selected")).toBeInTheDocument();
    expect(screen.getByLabelText("Select every applicant on this page").indeterminate).toBe(false);

    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryByText(/^\d+ selected$/)).toBeNull();
  });

  it("confirms the count and stage, then reports moved and skipped", async () => {
    withApplicants(2);
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({
      data: { success: true, moved: 1, skipped: [{ id: "a2", reason: "TERMINAL" }] },
    } as never);
    const success = vi.spyOn(toast, "success").mockImplementation(() => "toast-id");
    renderRoute(<Applicants />, {
      route: "/hire/jobs/64b0c8f2a9d3e45f6a7b8c9d/applicants",
      path: "/hire/jobs/:id/applicants",
    });

    await userEvent.click(await screen.findByLabelText("Select Candidate 1"));
    await userEvent.click(screen.getByLabelText("Select Candidate 2"));
    await userEvent.click(screen.getByRole("button", { name: /move to/i }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Interview" }));

    // The dialog names both halves before anything is sent.
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("Move 2 applicants")).toBeInTheDocument();
    expect(screen.getByText(/Move 2 applicants to Interview\?/)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Move", exact: true }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/application/64b0c8f2a9d3e45f6a7b8c9d/status/bulk",
        { applicationIds: ["a1", "a2"], status: "interview" },
      ),
    );
    // Both halves of the honest result, in one toast.
    expect(success).toHaveBeenCalledWith("Moved 1 to Interview · 1 skipped — already closed");
    // A completed move clears the selection.
    expect(screen.queryByText(/^\d+ selected$/)).toBeNull();
  });

  it("keeps the selection when the dialog is cancelled", async () => {
    withApplicants(1);
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({
      data: { success: true },
    } as never);
    renderRoute(<Applicants />, {
      route: "/hire/jobs/64b0c8f2a9d3e45f6a7b8c9d/applicants",
      path: "/hire/jobs/:id/applicants",
    });

    await userEvent.click(await screen.findByLabelText("Select Candidate 1"));
    await userEvent.click(screen.getByRole("button", { name: /move to/i }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Shortlisted" }));
    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `cd D:\job-portal-2.0\frontend; npx vitest run tests/workspace.test.tsx`
Expected: FAIL — no checkbox, no bar, no dialog.

- [ ] **Step 3: Implement the hook**

In `frontend/src/hooks/useRecruiterWorkspace.tsx`, add `BulkStatusResult` to the `@jobportal/shared` type import, and after `useApplicantDecision` add:

```ts
/**
 * The bulk move: one stage, many of this job's applications.
 *
 * Same invalidation as the single decision — the list and the cross-job queue
 * show the same rows — and the mutation returns the honest result so the
 * caller can report both halves rather than a bare success.
 */
export function useBulkApplicantDecision(jobId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (decision: {
      applicationIds: string[];
      // The recruiter-settable subset, exactly as the single decision takes.
      status: (typeof RECRUITER_SETTABLE)[number];
    }) => {
      const res = await apiClient.post<{ success: boolean } & BulkStatusResult>(
        `/application/${jobId}/status/bulk`,
        { applicationIds: decision.applicationIds, status: decision.status },
      );
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [...WORKSPACE_KEY, "applicants", jobId],
      });
      void queryClient.invalidateQueries({
        queryKey: [...WORKSPACE_KEY, "queue"],
      });
    },
  });
}
```

- [ ] **Step 4: Implement the screen**

Replace the whole of `frontend/src/components/workspace/Applicants.tsx` with:

```tsx
import { useEffect, useState } from "react";
import { MoreHorizontal, Users } from "lucide-react";
import { useParams } from "react-router";
import { toast } from "sonner";
import type { ApplicantDto, BulkSkipReason } from "@jobportal/shared";
import { ACTIVE_STATUSES, RECRUITER_SETTABLE, TERMINAL_STATUSES, isTerminal } from "@jobportal/shared";

import HireShell from "./HireShell";
import { FitBadge } from "@/components/FitBadge";
import { Pager } from "@/components/layout/ListControls";
import { EmptyState } from "@/components/layout/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
import { statusMeta } from "@/lib/applicationStatus";
import {
  useApplicantDecision,
  useApplicants,
  useBulkApplicantDecision,
} from "@/hooks/useRecruiterWorkspace";

/** The skip reasons a bulk result can carry, in words a recruiter reads. */
const SKIP_COPY: Record<BulkSkipReason, string> = {
  TERMINAL: "already closed",
  SAME_STATUS: "already at that stage",
  NOT_FOUND: "no longer available",
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
 *
 * Fit is server-owned. The API scores every applicant against this job and sorts
 * the complete set before pagination, so this table explains the order instead
 * of recomputing a second version of the business rule.
 *
 * Bulk is a shortcut through the same rules, not a different rule: the batch
 * posts to one endpoint that applies each row through the single move's state
 * machine and reports every refusal, so the toast can be honest about both
 * halves.
 */
export function Applicants() {
  const params = useParams();
  const { data, isPending, isError, error, page, setPage } = useApplicants(params.id);
  const decide = useApplicantDecision(params.id);
  const bulk = useBulkApplicantDecision(params.id);

  // Selection is client state, page-scoped: the ranked list re-orders under a
  // decision, so ids from another page are stale by definition once it turns.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingStage, setPendingStage] = useState<(typeof RECRUITER_SETTABLE)[number] | null>(
    null,
  );
  useEffect(() => {
    setSelected(new Set());
  }, [page]);

  const pageIds = data?.items.map((item) => item.applicationId) ?? [];
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  const toggleOne = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((current) => {
      const next = new Set(current);
      if (allSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  // The settable subset, not every ApplicationStatus — the menu is built from
  // the same list, so this is the type making that agreement checkable.
  const onDecide = async (
    applicationId: string,
    status: (typeof RECRUITER_SETTABLE)[number],
  ) => {
    try {
      await decide.mutateAsync({ applicationId, status });
      toast.success(`Moved to ${statusMeta(status).label}`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not update status"));
    }
  };

  // The honest result: both halves of the batch, in one toast.
  const onBulkMove = async () => {
    if (pendingStage === null || selected.size === 0) return;
    try {
      const result = await bulk.mutateAsync({
        applicationIds: [...selected],
        status: pendingStage,
      });
      const parts = [`Moved ${result.moved} to ${statusMeta(pendingStage).label}`];
      if (result.skipped.length > 0) {
        const reasons = [...new Set(result.skipped.map((s) => s.reason))]
          .map((reason) => SKIP_COPY[reason])
          .join(", ");
        parts.push(`${result.skipped.length} skipped — ${reasons}`);
      }
      toast.success(parts.join(" · "));
      setSelected(new Set());
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not move applicants"));
    } finally {
      setPendingStage(null);
    }
  };

  const selectedLabel = `${selected.size} ${selected.size === 1 ? "applicant" : "applicants"}`;

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
      {data?.funnel ? (
        /* P5's funnel: where everyone stands, across every page. Server-owned
           for the same reason the fit ordering is — the list below paginates
           after ranking, so a client-side count would describe a slice. */
        <ol
          aria-label="Pipeline"
          className="mb-4 flex flex-wrap items-baseline gap-x-5 gap-y-1 rounded-surface border border-line bg-paper-raised px-4 py-3"
        >
          {ACTIVE_STATUSES.map((status) => (
            <li key={status} className="flex items-baseline gap-1.5">
              <span className="font-mono text-sm font-semibold tabular-nums text-ink">
                {data.funnel[status]}
              </span>
              <span className="text-xs text-ink-muted">{statusMeta(status).label}</span>
            </li>
          ))}
          <li aria-hidden="true" className="hidden h-4 w-px bg-line sm:block" />
          {TERMINAL_STATUSES.map((status) => (
            <li key={status} className="flex items-baseline gap-1.5">
              <span className="font-mono text-sm font-semibold tabular-nums text-ink-faint">
                {data.funnel[status]}
              </span>
              <span className="text-xs text-ink-faint">{statusMeta(status).label}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {selected.size > 0 ? (
        /* The bulk bar: count, destination, clear. Selecting a stage opens the
           confirmation dialog — a mass decision is never one click. */
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-surface border border-line bg-paper-raised px-4 py-3">
          <span className="text-sm font-medium text-ink">{selected.size} selected</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Move to…
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {/* Every settable stage, including ones some rows already hold:
                  bulk reports those as skips rather than hiding them, because
                  the rows in a batch do not share one current status. */}
              {RECRUITER_SETTABLE.map((next) => {
                const meta = statusMeta(next);
                const NextIcon = meta.Icon;
                return (
                  <DropdownMenuItem key={next} onSelect={() => setPendingStage(next)}>
                    <NextIcon className="size-4" />
                    {meta.label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      ) : null}
      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-12 rounded-surface" />
          ))}
        </div>
      ) : isError ? (
        <p role="alert" className="text-sm text-danger-text">
          Could not load applicants: {error instanceof Error ? error.message : "unknown error"}
        </p>
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No applicants yet"
          description="Applications appear here as seekers apply to this role."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  aria-label="Select every applicant on this page"
                  checked={allSelected}
                  onChange={toggleAll}
                  ref={(el) => {
                    // Native checkboxes have no `indeterminate` attribute and
                    // React does not manage the property — the ref is the one
                    // way to show some-but-not-all.
                    if (el) el.indeterminate = selected.size > 0 && !allSelected;
                  }}
                  className="size-4 rounded accent-[var(--signal-text)]"
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Resume</TableHead>
              <TableHead>Fit</TableHead>
              <TableHead>Applied</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((item) => {
              const status = statusMeta(item.status);
              const StatusIcon = status.Icon;
              // A closed application takes no further decision; the API answers
              // one with 409, so the menu is not offered at all. It stays
              // selectable: a select-all batch reports it as a skip, which is
              // the honest result, not a hidden one.
              const closed = isTerminal(item.status);
              return (
                <TableRow
                  key={item.applicationId}
                  data-state={selected.has(item.applicationId) ? "selected" : undefined}
                >
                  <TableCell>
                    <input
                      type="checkbox"
                      aria-label={`Select ${item.fullName}`}
                      checked={selected.has(item.applicationId)}
                      onChange={() => toggleOne(item.applicationId)}
                      className="size-4 rounded accent-[var(--signal-text)]"
                    />
                  </TableCell>
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
                  <TableCell className="min-w-56">
                    {item.fit ? (
                      <FitBadge
                        fit={item.fit}
                        perfectLabel="Matches every requirement"
                        className="flex-col items-start gap-1"
                      />
                    ) : (
                      <span className="text-ink-muted">&mdash;</span>
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
                    {closed ? (
                      <span className="text-sm text-ink-muted">&mdash;</span>
                    ) : (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Change status for ${item.fullName}`}
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {/*
                            Built from RECRUITER_SETTABLE, so the menu cannot
                            offer a move the API would refuse — and a stage added
                            to the pipeline appears here without an edit.
                            The current status is omitted: setting it again is a
                            409 STATUS_UNCHANGED by design.
                          */}
                          {RECRUITER_SETTABLE.filter((next) => next !== item.status).map((next) => {
                            const meta = statusMeta(next);
                            const NextIcon = meta.Icon;
                            return (
                              <DropdownMenuItem
                                key={next}
                                onSelect={() => void onDecide(item.applicationId, next)}
                              >
                                <NextIcon className="size-4" />
                                {meta.label}
                              </DropdownMenuItem>
                            );
                          })}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <ConfirmDialog
        open={pendingStage !== null}
        onOpenChange={(open) => {
          if (!open) setPendingStage(null);
        }}
        title={`Move ${selectedLabel}`}
        description={
          pendingStage
            ? `Move ${selectedLabel} to ${statusMeta(pendingStage).label}? Each moved candidate is emailed exactly as a single move emails them.`
            : ""
        }
        confirmLabel="Move"
        destructive={pendingStage === "rejected"}
        pending={bulk.isPending}
        onConfirm={() => void onBulkMove()}
      />
    </HireShell>
  );
}

export default Applicants;
```

- [ ] **Step 5: Run to verify passing**

Run: `cd D:\job-portal-2.0\frontend; npx vitest run tests/workspace.test.tsx tests/applicantsFunnel.test.tsx`
Expected: PASS — the new bulk tests, and the funnel test unchanged.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/hooks/useRecruiterWorkspace.tsx frontend/src/components/workspace/Applicants.tsx frontend/tests/workspace.test.tsx
git commit -m "feat(web): the bulk bar and its honest result"
```

---

### Task 5: Frontend — the posting health block beside the funnel

**Files:**
- Create: `frontend/src/components/workspace/PostingHealth.tsx`
- Modify: `frontend/src/components/workspace/Applicants.tsx` (layout wrapper + `useJob`)
- Test: `frontend/tests/postingHealth.test.tsx` (new), `frontend/tests/workspace.test.tsx` (one integration test)

**Interfaces:**
- Consumes: `PostingHealthDto` (Task 3), `useJob` (existing hook — the public job read carrying `createdAt`), the mounted public route `/description/:id`.
- Produces: `PostingHealth({ health, jobId, jobCreatedAt }: { health: PostingHealthDto; jobId: string | undefined; jobCreatedAt?: string })` — a pure presentational component, mounted with literals in its tests the way the console's dashboard panels are.

- [ ] **Step 1: Write the failing tests**

Create `frontend/tests/postingHealth.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { PostingHealthDto } from "@jobportal/shared";

import { PostingHealth } from "@/components/workspace/PostingHealth";

// The dashboard-test convention: these panels are pure functions of one DTO
// slice, so they mount with a literal rather than driving the route.
function series(days: number, at: Record<number, number> = {}) {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.UTC(2026, 5, 1));
    d.setUTCDate(d.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), count: at[i] ?? 0 };
  });
}

const health = (over: Partial<PostingHealthDto> = {}): PostingHealthDto => ({
  series: series(56, { 10: 4, 20: 7 }),
  firstApplicationAt: "2026-06-11T00:00:00.000Z",
  total: 11,
  ...over,
});

const renderHealth = (props: Parameters<typeof PostingHealth>[0]) =>
  render(<MemoryRouter>{<PostingHealth {...props} />}</MemoryRouter>);

describe("PostingHealth", () => {
  it("plots a line and offers the same numbers as a table", () => {
    // "A tooltip as the only way to read a value" is the anti-pattern. A dense
    // series cannot label every point, so the table view is what un-gates it.
    const { container } = renderHealth({ health: health(), jobId: "j1" });
    expect(container.querySelector("svg path[data-mark='line']")).toBeTruthy();
    const table = screen.getByRole("table", { name: /applications per day/i });
    expect(within(table).getByText("7")).toBeInTheDocument();
  });

  it("summarises the window so the headline needs no hover at all", () => {
    renderHealth({ health: health(), jobId: "j1" });
    expect(screen.getByText("11 applicants")).toBeInTheDocument();
    expect(screen.getByText(/busiest day: 7/i)).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /applications per day over the last eight weeks/i }),
    ).toBeInTheDocument();
  });

  it("states time-to-first from the job's own creation, not a server opinion", () => {
    // firstApplicationAt 2026-06-11 minus createdAt 2026-06-08 = 3 days.
    renderHealth({ health: health(), jobId: "j1", jobCreatedAt: "2026-06-08T00:00:00.000Z" });
    expect(screen.getByText(/First applicant after 3 days/)).toBeInTheDocument();
  });

  it("says 'within a day' when the first applicant landed the same day", () => {
    renderHealth({
      health: health({ firstApplicationAt: "2026-06-08T09:00:00.000Z" }),
      jobId: "j1",
      jobCreatedAt: "2026-06-08T00:00:00.000Z",
    });
    expect(screen.getByText(/First applicant within a day of posting/)).toBeInTheDocument();
  });

  it("makes the empty state an invitation with the live posting's link", () => {
    renderHealth({
      health: health({ series: series(56), firstApplicationAt: null, total: 0 }),
      jobId: "64b0c8f2a9d3e45f6a7b8c9d",
    });
    expect(screen.getByText(/no applicants yet/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /view the live posting/i });
    expect(link).toHaveAttribute("href", "/description/64b0c8f2a9d3e45f6a7b8c9d");
  });

  it("notes when nothing applied in the window instead of drawing a flat line", () => {
    const { container } = renderHealth({
      health: health({ series: series(56), firstApplicationAt: "2026-01-05T00:00:00.000Z", total: 3 }),
      jobId: "j1",
      jobCreatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(screen.getByText(/no applications in the last eight weeks/i)).toBeInTheDocument();
    expect(container.querySelector("svg path[data-mark='line']")).toBeNull();
  });

  it("renders the facts rather than crashing on an empty series", () => {
    // The API guarantees 56 dense points; a component that indexes
    // `series[0]` unguarded turns a contract change into a blank page.
    renderHealth({
      health: health({ series: [], firstApplicationAt: "2026-06-11T00:00:00.000Z", total: 2 }),
      jobId: "j1",
    });
    expect(screen.getByText("2 applicants")).toBeInTheDocument();
    expect(screen.getByText(/First applicant after/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd D:\job-portal-2.0\frontend; npx vitest run tests/postingHealth.test.tsx`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Implement the component**

Create `frontend/src/components/workspace/PostingHealth.tsx`:

```tsx
import { useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import type { PostingHealthDto } from "@jobportal/shared";

/**
 * Posting health: how this role is doing at attracting applicants.
 *
 * The console's JobsTrend pattern re-implemented on workspace tokens, because
 * the same three rules hold here:
 *
 * It must not label every point. Fifty-six numbers is chaos and goes unread,
 * so the summary line carries the aggregate and the tooltip carries the detail.
 *
 * The tooltip must not be the only way to read a value. A hover-gated number
 * is unreachable by keyboard and in print, so the `<details>` table below is
 * the accessible twin, and every daily value lives there too.
 *
 * The hit target must not be the mark. At 56 points a per-point target is
 * under the ~24px floor, so hovering resolves to the NEAREST point across the
 * whole plot instead.
 *
 * The empty state is an invitation, not a blank: a posting with no applicants
 * gets the link to share, not a flat line pretending to be a trend.
 */

/** Plot geometry in user units. The viewBox scales; the stroke widths do not. */
const W = 560;
const H = 140;
const PAD = { top: 8, right: 8, bottom: 4, left: 8 };

const shortDate = (iso: string): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

export function PostingHealth({
  health,
  jobId,
  jobCreatedAt,
}: {
  health: PostingHealthDto;
  jobId: string | undefined;
  jobCreatedAt?: string;
}) {
  const gradientId = useId();
  const plotRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<number | null>(null);

  const total = health.total;
  // The window's sum, not the all-time total: a role whose applicants all
  // arrived nine weeks ago has a real total and nothing to draw.
  const windowTotal = useMemo(
    () => health.series.reduce((sum, p) => sum + p.count, 0),
    [health.series],
  );
  const peak = useMemo(
    () => health.series.reduce((m, p) => Math.max(m, p.count), 0),
    [health.series],
  );

  // Time-to-first is the client's subtraction, not a server opinion: the job's
  // `createdAt` is one field the caller already has.
  const firstAfterDays =
    health.firstApplicationAt && jobCreatedAt
      ? Math.floor(
          (Date.parse(health.firstApplicationAt) - Date.parse(jobCreatedAt)) / 86_400_000,
        )
      : null;

  const geometry = useMemo(() => {
    // `length - 1` is a divisor, so a short series would produce Infinity. The
    // API guarantees 56 dense points; this guards the contract changing.
    if (health.series.length < 2) return null;
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    // Headroom above the peak, so the busiest day is a point on the plot
    // rather than a line pinned along the top edge. `+1` at small peaks, 15%
    // above larger ones: proportional headroom on a peak of 4 is half an
    // application, which rounds away to no headroom at all.
    const scaleMax = peak <= 8 ? peak + 1 : peak * 1.15;
    const x = (i: number) => PAD.left + (i / (health.series.length - 1)) * innerW;
    const y = (v: number) => PAD.top + innerH - (v / scaleMax) * innerH;
    const points = health.series.map((p, i) => ({ x: x(i), y: y(p.count) }));
    const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
    const area = `${line} L${points.at(-1)!.x} ${PAD.top + innerH} L${points[0]!.x} ${PAD.top + innerH} Z`;
    return { points, line, area, baseline: PAD.top + innerH };
  }, [health.series, peak]);

  if (total === 0) {
    return (
      <section
        aria-label="Posting health"
        className="w-full shrink-0 rounded-surface border border-line bg-paper-raised px-4 py-3 lg:w-80"
      >
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Posting health
        </h3>
        <p className="mt-2 text-sm font-medium text-ink">No applicants yet</p>
        <p className="mt-1 text-sm text-ink-muted">
          Share the role's public page to put it in front of candidates —{" "}
          {jobId ? (
            <Link className="text-signal-text underline" to={`/description/${jobId}`}>
              view the live posting
            </Link>
          ) : null}
        </p>
      </section>
    );
  }

  const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const svg = plotRef.current;
    if (!svg || !geometry) return;
    const box = svg.getBoundingClientRect();
    // Ratio rather than pixels: the viewBox scales with the block's width, so
    // a pixel offset would drift from the plotted coordinate at every size.
    const ratio = (event.clientX - box.left) / box.width;
    const userX = ratio * W;
    let nearest = 0;
    for (let i = 1; i < geometry.points.length; i += 1) {
      if (
        Math.abs(geometry.points[i]!.x - userX) < Math.abs(geometry.points[nearest]!.x - userX)
      ) {
        nearest = i;
      }
    }
    setActive(nearest);
  };

  const hovered = active === null ? null : health.series[active];
  const hoveredPoint = active === null || !geometry ? null : geometry.points[active];
  const last = geometry?.points.at(-1);

  const firstLine =
    firstAfterDays === null
      ? null
      : firstAfterDays <= 0
        ? "First applicant within a day of posting"
        : `First applicant after ${firstAfterDays} ${firstAfterDays === 1 ? "day" : "days"}`;

  return (
    <section
      aria-label="Posting health"
      className="w-full shrink-0 rounded-surface border border-line bg-paper-raised px-4 py-3 lg:w-80"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Posting health
        </h3>
        <span className="font-mono text-sm font-semibold tabular-nums text-ink">
          {total} {total === 1 ? "applicant" : "applicants"}
        </span>
      </div>

      {windowTotal === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">No applications in the last eight weeks.</p>
      ) : (
        <div className="relative">
          <svg
            ref={plotRef}
            viewBox={`0 0 ${W} ${H}`}
            className="mt-2 block h-32 w-full touch-none"
            role="img"
            aria-label={`Applications per day over the last eight weeks. ${total} in total, busiest day ${peak}.`}
            onPointerMove={onMove}
            onPointerLeave={() => setActive(null)}
          >
            <defs>
              {/* A ~10% wash, not a saturated block: the fill exists to give
                  the line a body, and `--signal-muted` is the token for it. */}
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--signal-muted)" />
                <stop offset="100%" stopColor="transparent" />
              </linearGradient>
            </defs>

            {/* Hairline, solid, one step off the surface — never dashed. */}
            {[0, 0.5, 1].map((t) => (
              <line
                key={t}
                x1={PAD.left}
                x2={W - PAD.right}
                y1={PAD.top + t * (H - PAD.top - PAD.bottom)}
                y2={PAD.top + t * (H - PAD.top - PAD.bottom)}
                stroke="var(--line)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {geometry ? (
              <>
                <path d={geometry.area} fill={`url(#${gradientId})`} />
                <path
                  d={geometry.line}
                  data-mark="line"
                  fill="none"
                  stroke="var(--signal-text)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
                {hoveredPoint ? (
                  <>
                    <line
                      x1={hoveredPoint.x}
                      x2={hoveredPoint.x}
                      y1={PAD.top}
                      y2={geometry.baseline}
                      stroke="var(--line-strong)"
                      strokeWidth="1"
                      vectorEffect="non-scaling-stroke"
                    />
                    {/* 2px surface ring so the marker stays legible where it
                        crosses the line. */}
                    <circle
                      cx={hoveredPoint.x}
                      cy={hoveredPoint.y}
                      r="4.5"
                      fill="var(--signal-text)"
                      stroke="var(--paper-raised)"
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                    />
                  </>
                ) : last ? (
                  <circle
                    cx={last.x}
                    cy={last.y}
                    r="4"
                    fill="var(--signal-text)"
                    stroke="var(--paper-raised)"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}
              </>
            ) : null}
          </svg>

          {hovered ? (
            <p
              aria-hidden="true"
              className="pointer-events-none absolute top-0 right-0 rounded-sharp border border-line bg-overlay px-2 py-1 text-xs text-ink shadow-[var(--elevate-2)]"
            >
              <span className="font-medium">{shortDate(hovered.date)}</span>{" "}
              <span className="font-mono tabular-nums">{hovered.count}</span>
            </p>
          ) : null}
        </div>
      )}

      {health.series.length > 0 ? (
        <div className="mt-1 flex justify-between text-xs text-ink-muted">
          <span>{shortDate(health.series[0]!.date)}</span>
          <span>{shortDate(health.series.at(-1)!.date)}</span>
        </div>
      ) : null}

      <p className="mt-2 text-xs text-ink-muted">
        {firstLine}
        {windowTotal > 0 ? ` · Busiest day: ${peak}` : ""}
      </p>

      {/* The table twin. A dense series cannot label every point, so this is
          what keeps every value reachable without a pointer. */}
      {windowTotal > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer rounded-sharp text-xs font-medium text-ink-muted outline-none hover:text-ink focus-visible:ring-[3px] focus-visible:ring-signal-ring">
            View as table
          </summary>
          <div className="mt-3 max-h-56 overflow-y-auto">
            <table className="w-full text-left text-xs" aria-label="Applications per day">
              <thead className="sticky top-0 bg-paper-raised">
                <tr className="text-ink-muted">
                  <th scope="col" className="py-1 pr-3 font-medium">
                    Date
                  </th>
                  <th scope="col" className="py-1 font-medium">
                    Applied
                  </th>
                </tr>
              </thead>
              <tbody>
                {health.series.map((point) => (
                  <tr key={point.date} className="border-t border-line">
                    <td className="py-1 pr-3 font-mono tabular-nums text-ink-muted">{point.date}</td>
                    <td className="py-1 font-mono tabular-nums text-ink">{point.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </section>
  );
}

export default PostingHealth;
```

- [ ] **Step 4: Mount it beside the funnel**

In `frontend/src/components/workspace/Applicants.tsx`:

Add imports:

```tsx
import PostingHealth from "./PostingHealth";
import { useApplicants, useApplicantDecision, useBulkApplicantDecision, useJob } from "@/hooks/useRecruiterWorkspace";
```

(The existing `useRecruiterWorkspace` import line is replaced by the second line above.)

Inside the component, after the `bulk` line add:

```tsx
  // The job's own `createdAt`, for time-to-first: an existing read of the
  // public detail route, cached — not a new server surface.
  const jobQuery = useJob(params.id);
```

Replace the funnel block's opening (the `{data?.funnel ? (` line) and its closing (`) : null}` after the `</ol>`) so the funnel and the health block share one row — the `ol` loses its `mb-4` and gains `lg:flex-1`:

```tsx
      {data?.funnel || data?.health ? (
        <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-stretch">
          {data?.funnel ? (
            /* P5's funnel: where everyone stands, across every page. Server-owned
               for the same reason the fit ordering is — the list below paginates
               after ranking, so a client-side count would describe a slice. */
            <ol
              aria-label="Pipeline"
              className="flex flex-wrap items-baseline gap-x-5 gap-y-1 rounded-surface border border-line bg-paper-raised px-4 py-3 lg:flex-1"
            >
              {/* …the funnel's <li> children are unchanged… */}
            </ol>
          ) : null}
          {data?.health ? (
            <PostingHealth
              health={data.health}
              jobId={params.id}
              jobCreatedAt={jobQuery.data?.createdAt}
            />
          ) : null}
        </div>
      ) : null}
```

(The `ACTIVE_STATUSES` / `TERMINAL_STATUSES` `<li>` mapping inside the `<ol>` stays byte-for-byte as it is in Task 4's version.)

- [ ] **Step 5: Add the integration test**

In `frontend/tests/workspace.test.tsx`, inside the `Applicants` describe, add:

```ts
  it("shows posting health beside the funnel when the page carries it", async () => {
    vi.spyOn(apiClient, "get").mockImplementation(async (url: string) => {
      if (url.startsWith("/job/get/")) {
        return {
          data: {
            success: true,
            job: { id: "64b0c8f2a9d3e45f6a7b8c9d", createdAt: "2026-06-08T00:00:00.000Z" },
          },
        } as never;
      }
      return {
        data: {
          success: true,
          items: [
            {
              applicationId: "a1",
              status: "applied" as const,
              appliedAt: "2026-06-11T00:00:00.000Z",
              fullName: "Ada Lovelace",
              email: "ada@example.com",
              phone: null,
              headline: null,
              skills: [],
              resumeUrl: null,
              resumeName: null,
              fit,
            },
          ],
          funnel: {
            applied: 1, reviewed: 0, shortlisted: 0, interview: 0,
            offered: 0, rejected: 0, withdrawn: 0,
          },
          health: {
            series: Array.from({ length: 56 }, (_, i) => {
              const d = new Date(Date.UTC(2026, 5, 1));
              d.setUTCDate(d.getUTCDate() + i);
              return { date: d.toISOString().slice(0, 10), count: i === 10 ? 1 : 0 };
            }),
            firstApplicationAt: "2026-06-11T00:00:00.000Z",
            total: 1,
          },
          total: 1,
          page: 1,
          pages: 1,
        },
      } as never;
    });
    renderRoute(<Applicants />, {
      route: "/hire/jobs/64b0c8f2a9d3e45f6a7b8c9d/applicants",
      path: "/hire/jobs/:id/applicants",
    });

    const health = await screen.findByRole("region", { name: "Posting health" });
    expect(within(health).getByText("1 applicant")).toBeInTheDocument();
    // Time-to-first, from the job read's createdAt.
    expect(within(health).getByText(/First applicant after 3 days/)).toBeInTheDocument();
    // The funnel still renders in the same row.
    expect(screen.getByRole("list", { name: "Pipeline" })).toBeInTheDocument();
  });
```

(`within` is already imported by this file.)

- [ ] **Step 6: Run to verify passing**

Run: `cd D:\job-portal-2.0\frontend; npx vitest run tests/postingHealth.test.tsx tests/workspace.test.tsx tests/applicantsFunnel.test.tsx`
Expected: PASS — the new tests, and the existing funnel/workspace tests unchanged (their mocks carry no `health`, and the guard renders nothing).

- [ ] **Step 7: Run the colour gate**

Run: `cd D:\job-portal-2.0; npm run lint:colour`
Expected: zero violations — the chart and checkboxes use tokens (`var(--signal-text)` via `accent-[var(--signal-text)]`, `--signal-muted`, `--line`, `--paper-raised`, `--elevate-2`) exactly as JobsTrend and FilterCard do.

- [ ] **Step 8: Commit**

```powershell
git add frontend/src/components/workspace/PostingHealth.tsx frontend/src/components/workspace/Applicants.tsx frontend/tests/postingHealth.test.tsx frontend/tests/workspace.test.tsx
git commit -m "feat(web): the posting health block beside the funnel"
```

---

### Task 6: Docs, release note, and the full gate

**Files:**
- Modify: `ARCHITECTURE.md` (new section after "The workspace's half (P5)")
- Modify: `README.md` (roadmap row)
- Modify: `frontend/src/data/updates.ts` (new newest entry)

**Interfaces:**
- Consumes: everything shipped in Tasks 1–5.
- Produces: the durable record. No ADR — the decisions live in the spec and ARCHITECTURE; no new infrastructure was chosen.

- [ ] **Step 1: ARCHITECTURE.md**

After the `### The workspace's half (P5)` section (which ends with "…would describe a page, not a pipeline."), insert:

```markdown
### Bulk moves and posting health

The recruiter power phase (2026-09-02) closes the hand-scale gap. `POST
/application/:jobId/status/bulk` moves many of one job's applications to one
stage under an apply-where-legal contract: the job's ownership is checked once
(a foreign job is the request's own 404), then each row runs the same guarded
state machine a single move runs — history entry, `decidedAt` on terminal
stages, the candidate email on notifying stages, byte for byte. Refused rows
are skipped and reported (`TERMINAL`, `SAME_STATUS`, or `NOT_FOUND` for a
foreign or stale id) rather than vetoing the batch, because a real applicant
list is mixed. The screen answers with a checkbox column, a bulk bar, a
confirmation dialog naming count and destination, and a result toast that
reports both halves.

Posting health rides the same `ApplicantsPageDto`. `listApplicants` already
holds the complete ranked set in memory, so `health` — a dense 56-day
zero-filled applications-per-day series (the console's `jobsPostedSeries`
shape, shared through `backend/src/lib/dailySeries.ts`), `firstApplicationAt`,
and the total — is derived with zero additional queries. Nothing is stored or
tracked, and nothing new reaches the privacy page; time-to-first is the
client's subtraction of the job's `createdAt`.
```

- [ ] **Step 2: README.md roadmap**

Replace:

```markdown
| 4 | Recruiter dashboard: bulk actions, analytics | Planned |
```

with:

```markdown
| Recruiter power (2026-09-02) | Bulk applicant moves and posting health | Complete |
```

- [ ] **Step 3: The release note**

In `frontend/src/data/updates.ts`, add as the newest entry at the top of `PLATFORM_UPDATES`:

```ts
  {
    id: "recruiter-power",
    date: "2026-09-02",
    kind: "Feature",
    title: "Decide on many applicants at once, and see how a role is doing",
    summary:
      "The applicants screen now takes bulk decisions — select any number of candidates and move them to a stage in one action, with each candidate emailed exactly as a single move would. Beside the pipeline, a posting-health block shows applications per day and how long the role waited for its first applicant.",
    details: [
      "A bulk move applies where it's legal: rows that can't move — already decided, already at that stage, no longer available — are skipped and reported, so one decided row never blocks the rest.",
      "Posting health is derived from the applications the platform already keeps: nothing is tracked, and the privacy page is unchanged.",
    ],
  },
```

- [ ] **Step 4: Run the release-note test and the full gate**

Run: `cd D:\job-portal-2.0\frontend; npx vitest run tests/updates.test.tsx tests/updatesEmptyState.test.tsx`
Expected: PASS — the newest-first ordering assertion stays green with the new top entry.

Run from the workspace root:

```powershell
npm run typecheck
npm run lint
npm run lint:colour
npm test
npm run audit:prod
git diff --check
```

Expected: all green. (CI runs lint before tests and the audit job separately — a green local `npm run ci` alone is not the whole verdict.)

- [ ] **Step 5: Commit**

```powershell
git add ARCHITECTURE.md README.md frontend/src/data/updates.ts
git commit -m "docs: the recruiter power phase, and its release note"
```

- [ ] **Step 6: Hand back for push**

Both hosts auto-deploy on push to `main` — do not push without the user. When they push, confirm the Actions run actually went green (`gh run list --limit 1`): local green is not the remote verdict.

---

## Self-Review (done at planning time)

**Spec coverage:** D1 (endpoint, cap, ownership-once, pure pre-check, response shape, apply-where-legal) → Tasks 1–2. D2 (foreign/unknown = skipped NOT_FOUND; 404 reserved for job ownership) → Task 2. D3 (checkbox column, page-change clearing, bar at one, dialog naming count and stage, two-halves toast, single-decision invalidation, bulk-reject mail) → Tasks 2 and 4. D4 (derived-not-queried, dense 56-day series, `firstApplicationAt`, total, nothing stored) → Task 3. D5 (beside the funnel, JobsTrend pattern on workspace tokens, total + first-after-N, invitation empty state, dataviz rules — single series so no legend, nearest-point hover, table twin, text in ink tokens) → Task 5. Testing section: every named case has a test. Documentation section → Task 6. Non-goals: none violated (no tracking, no bulk withdraw — the schema refuses it, no cross-job bulk — rows are matched against the route's job, no reason field).

**Placeholder scan:** the one elided region ("the funnel's `<li>` children are unchanged") is a quoted-verbatim carryover of code printed in full in Task 4's file listing, not an undescribed step. No TBD/TODO/"add validation" steps.

**Type consistency:** `bulkUpdateApplicationStatus(recruiterId, jobId, applicationIds, status)` matches the controller call; `useBulkApplicantDecision`'s mutation input matches `onBulkMove`'s call; `PostingHealth`'s props match both its own tests and the `Applicants` call site; `denseDailySeries(Map<string, number>)` matches both call sites; `SKIP_COPY` is keyed by `BulkSkipReason`.
