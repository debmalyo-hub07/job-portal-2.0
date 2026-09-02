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

    const rows = res.body.items as Array<{
      jobId: string;
      applied: boolean;
      job: { status: string };
    }>;
    const byJobId = new Map(rows.map((row) => [row.jobId, row]));
    expect(byJobId.get(jobId)).toMatchObject({ applied: true });
    expect(byJobId.get(jobId)!.job.status).toBe("closed");
    expect(byJobId.get(secondJobId)).toMatchObject({ applied: false });
    expect(byJobId.get(secondJobId)!.job.status).toBe("open");
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
