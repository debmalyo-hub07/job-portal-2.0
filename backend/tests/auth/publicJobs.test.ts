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
    expect(res.body).toMatchObject({ success: true, page: 1 });
    expect(res.body.items.map((j: { title: string }) => j.title)).toContain("Anon Listed");
  });

  it("serves a single job to an anonymous visitor", async () => {
    const { job } = await seedJob("Anon Detail");
    const res = await request(app).get(`/api/v1/job/get/${job._id}`);
    expect(res.status).toBe(200);
    expect(res.body.job.title).toBe("Anon Detail");
  });

  it("carries a stored company logo into public job DTOs", async () => {
    const { company, job } = await seedJob("Logo Detail");
    company.logo = "https://res.cloudinary.com/test/image/upload/company-logo.png";
    await company.save();

    const res = await request(app).get(`/api/v1/job/get/${job._id}`);
    expect(res.status).toBe(200);
    expect(res.body.job.company.logoUrl).toBe(company.logo);
  });

  it("never exposes a job's applicant list on the public endpoint", async () => {
    // The load-bearing assertion. This endpoint used to populate `applications`,
    // so opening it to anonymous callers would have published who applied where.
    // The Job schema no longer even has that field — the applicant side lives
    // entirely in the Application collection — so the guarantee is now enforced
    // by the DTO's shape, which is what this asserts.
    const { job } = await seedJob("Has Applicants");
    const seeker = await signedUpOn("seeker", "applied@x.test");
    const application = await Application.create({ job: job._id, applicant: seeker.id });

    // The DTO is an allowlist: anything not named here cannot be returned.
    // `remote` was added to the public allowlist in 4A.3 — it is the fit
    // pipeline's on-site/remote signal and is surfaced deliberately to drive
    // the faceted search rail and the fit explanation, not an accident.
    const base = [
      "company",
      "createdAt",
      "department",
      "description",
      "experienceLevel",
      "id",
      "jobType",
      "location",
      "position",
      "remote",
      "requirements",
      "salary",
      "title",
    ];

    // `fit` is the one key whose presence depends on the caller: it describes a
    // seeker's own profile, so an anonymous visitor must not receive it at all
    // rather than receive a zero. Asserting the two key sets separately is what
    // makes that difference a test rather than a coincidence.
    const cases = [
      { cookies: [] as string[], keys: base },
      { cookies: [`jp_seeker_at=${seeker.access}`], keys: [...base, "fit"].sort() },
    ];

    for (const { cookies, keys } of cases) {
      const res = await request(app).get(`/api/v1/job/get/${job._id}`).set("Cookie", cookies);
      expect(res.status).toBe(200);
      expect(res.body.job.applications).toBeUndefined();
      expect(Object.keys(res.body.job).sort()).toEqual(keys);
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
    // optionalAuthenticate must populate req.auth rather than ignore the cookie —
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
