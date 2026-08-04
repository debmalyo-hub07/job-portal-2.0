import request from "supertest";
import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "../../src/app.js";
import { signedUpOn, installCaptureMailer } from "./helpers.js";
import { Company } from "../../src/models/company.model.js";
import { Job } from "../../src/models/job.model.js";
import { Application } from "../../src/models/application.model.js";

const app = buildApp();
beforeEach(installCaptureMailer);

/** A recruiter, a company and one job — the minimum for a browsable board. */
let seedCount = 0;
async function seedJob(title = "Public Dev") {
  const tag = `poster${++seedCount}`;
  const recruiter = await signedUpOn("recruiter", `${tag}@x.test`);
  const company = await Company.create({ name: `Acme ${tag}`, userId: recruiter.id });
  const job = await Job.create({
    title,
    description: "d",
    salary: 1,
    experienceLevel: 1,
    location: "Remote",
    jobType: "full-time",
    position: 1,
    company: company._id,
    created_by: recruiter.id,
  });
  return { recruiter, company, job };
}

describe("the public job board", () => {
  it("lists jobs for an anonymous visitor", async () => {
    // The inherited code required a session here, so the home page rendered
    // "No Job Available" to everyone who had not signed in — the product's front
    // door was shut.
    await seedJob("Anon Listed");
    const res = await request(app).get("/api/v1/job/get?keyword=");
    expect(res.status).toBe(200);
    expect(res.body.jobs.map((j: { title: string }) => j.title)).toContain("Anon Listed");
  });

  it("serves a single job to an anonymous visitor", async () => {
    const { job } = await seedJob("Anon Detail");
    const res = await request(app).get(`/api/v1/job/get/${job._id}`);
    expect(res.status).toBe(200);
    expect(res.body.job.title).toBe("Anon Detail");
  });

  it("never exposes a job's applicant list on the public endpoint", async () => {
    // The load-bearing assertion. This endpoint used to populate `applications`,
    // so opening it to anonymous callers would have published who applied where.
    const { job } = await seedJob("Has Applicants");
    const seeker = await signedUpOn("seeker", "applied@x.test");
    const application = await Application.create({ job: job._id, applicant: seeker.id });
    await Job.updateOne({ _id: job._id }, { $push: { applications: application._id } });

    for (const cookies of [[], [`jp_seeker_at=${seeker.access}`]]) {
      const res = await request(app)
        .get(`/api/v1/job/get/${job._id}`)
        .set("Cookie", cookies);
      expect(res.status).toBe(200);
      expect(res.body.job.applications).toBeUndefined();
      // Neither the applicant's id nor the application's should appear anywhere.
      expect(JSON.stringify(res.body)).not.toContain(seeker.id);
      expect(JSON.stringify(res.body)).not.toContain(String(application._id));
    }
  });

  it("still refuses the recruiter-only job routes to anonymous callers", async () => {
    // Opening the two public reads must not have loosened anything else.
    expect((await request(app).get("/api/v1/job/getadminjobs")).status).toBe(401);
    expect((await request(app).post("/api/v1/job/post").send({})).status).toBe(401);
  });

  it("resolves a session on the public route when one is present", async () => {
    // optionalBridgeAuth must populate req.auth rather than ignore the cookie —
    // a seeker's own applications list depends on it elsewhere.
    const seeker = await signedUpOn("seeker", "optional@x.test");
    const res = await request(app)
      .get("/api/v1/job/get?keyword=")
      .set("Cookie", [`jp_seeker_at=${seeker.access}`]);
    expect(res.status).toBe(200);
  });

  it("does not 401 a public route holding a garbage cookie", async () => {
    // A stale or tampered cookie on a public read is not an error; the visitor
    // is simply anonymous. Failing closed here would break the board for anyone
    // whose session expired in a background tab.
    const res = await request(app)
      .get("/api/v1/job/get?keyword=")
      .set("Cookie", ["jp_seeker_at=not-a-token"]);
    expect(res.status).toBe(200);
  });
});
