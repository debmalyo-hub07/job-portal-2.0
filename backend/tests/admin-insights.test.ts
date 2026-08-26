import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { APPLICATION_STATUSES } from "@jobportal/shared";

import { buildApp } from "../src/app.js";
import { Admin } from "../src/models/admin.model.js";
import { Application } from "../src/models/application.model.js";
import { Company } from "../src/models/company.model.js";
import { Job } from "../src/models/job.model.js";
import { Recruiter } from "../src/models/recruiter.model.js";
import { Seeker } from "../src/models/seeker.model.js";
import { asSession, cookieValue, installCaptureMailer, lastCodeFor } from "./auth/helpers.js";

/**
 * The dashboard's two read endpoints.
 *
 * Separate from `admin-console.test.ts`, which covers the counters, the two
 * moderation lists and the deny action. These are the aggregations the redesigned
 * dashboard reads, and every test below names a way the shape can be wrong while
 * still being a valid JSON response — an omitted pipeline stage, a zero standing
 * in for an unmeasurable rate, a sparse series a chart would silently close.
 */

const app = buildApp();
const PASSWORD = "correct horse battery staple";

async function signedInAdmin(email: string): Promise<{ access: string; csrf: string }> {
  await Admin.create({
    email,
    fullName: "Root Admin",
    passwordHash: null,
    emailVerifiedAt: new Date(),
    status: "active",
  });
  await request(app).post("/api/v1/admin/auth/forgot-password").send({ email });
  const code = await lastCodeFor(email);
  await request(app)
    .post("/api/v1/admin/auth/reset-password")
    .send({ email, code, newPassword: PASSWORD });
  const login = await request(app)
    .post("/api/v1/admin/auth/login")
    .send({ email, password: PASSWORD });
  return {
    access: cookieValue(login, "jp_admin_at")!,
    csrf: cookieValue(login, "jp_admin_csrf")!,
  };
}

async function pendingRecruiter(email: string): Promise<string> {
  await request(app)
    .post("/api/v1/recruiter/auth/register")
    .send({ fullName: "Pending", email, password: PASSWORD });
  const code = await lastCodeFor(email);
  await request(app).post("/api/v1/recruiter/auth/verify-email").send({ email, code });
  const login = await request(app)
    .post("/api/v1/recruiter/auth/login")
    .send({ email, password: PASSWORD });
  return cookieValue(login, "jp_recruiter_at")!;
}

async function signedInSeeker(email: string): Promise<string> {
  await request(app)
    .post("/api/v1/seeker/auth/register")
    .send({ fullName: "Seeker", email, password: PASSWORD });
  const code = await lastCodeFor(email);
  await request(app).post("/api/v1/seeker/auth/verify-email").send({ email, code });
  const login = await request(app)
    .post("/api/v1/seeker/auth/login")
    .send({ email, password: PASSWORD });
  return cookieValue(login, "jp_seeker_at")!;
}

/**
 * One recruiter, one (unbranded) company, two open jobs and one seeker.
 *
 * Written directly through the models rather than the HTTP surface: these tests
 * are about aggregation shape, and driving registration for every fixture makes
 * the arrange step longer than the assertion. The company is deliberately left
 * without a logo or a website so the branding-triage case has a baseline.
 */
async function marketplace(prefix: string) {
  const recruiter = await Recruiter.create({
    fullName: "Recruiter",
    email: `${prefix}-recruiter@example.com`,
    passwordHash: null,
    status: "active",
    emailVerifiedAt: new Date(),
  });
  const company = await Company.create({ name: `${prefix} Co`, userId: recruiter._id });
  const jobFields = {
    description: "d",
    requirements: ["ts"],
    salary: 10,
    experienceLevel: 2,
    location: "Pune",
    jobType: "Full-time" as const,
    position: "1",
    company: company._id,
    created_by: recruiter._id,
  };
  const job = await Job.create({ title: "First", ...jobFields });
  const secondJob = await Job.create({ title: "Second", ...jobFields });
  const seeker = await Seeker.create({
    fullName: "Seeker",
    email: `${prefix}-seeker@example.com`,
    passwordHash: null,
    emailVerifiedAt: new Date(),
  });
  return {
    recruiter: recruiter._id,
    company: company._id,
    job: job._id,
    secondJob: secondJob._id,
    seeker: seeker._id,
  };
}

function utcDay(daysBack: number): Date {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d;
}

const isoDay = (daysBack: number) => utcDay(daysBack).toISOString().slice(0, 10);

describe("admin insights", () => {
  beforeEach(() => installCaptureMailer());

  it("reports every pipeline stage, including the ones with no applications", async () => {
    // The dashboard renders one row per stage. A response that omits empty
    // stages makes the client branch on presence, and a named stage that
    // vanishes reads as a stage the platform does not have.
    const { seeker, job } = await marketplace("ins-stages");
    await Application.create({ job, applicant: seeker, status: "shortlisted", history: [] });

    const admin = await signedInAdmin("ins-stages-root@example.com");
    const res = await request(app)
      .get("/api/v1/admin/insights")
      .use(asSession("admin", admin))
      .expect(200);

    expect(Object.keys(res.body.pipeline.byStatus).sort()).toEqual(
      [...APPLICATION_STATUSES].sort(),
    );
    expect(res.body.pipeline.byStatus.shortlisted).toBe(1);
    expect(res.body.pipeline.byStatus.applied).toBe(0);
    expect(res.body.pipeline.total).toBe(1);
  });

  it("separates live applications from decided ones", async () => {
    // `decidedAt` is stored on the model precisely so this is an indexed query
    // rather than a scan over history subdocuments.
    const { seeker, job, secondJob } = await marketplace("ins-live");
    await Application.create({ job, applicant: seeker, status: "reviewed", history: [] });
    await Application.create({
      job: secondJob,
      applicant: seeker,
      status: "rejected",
      decidedAt: new Date(),
      history: [],
    });

    const admin = await signedInAdmin("ins-live-root@example.com");
    const res = await request(app)
      .get("/api/v1/admin/insights")
      .use(asSession("admin", admin))
      .expect(200);

    expect(res.body.pipeline.live).toBe(1);
    expect(res.body.pipeline.decided).toBe(1);
  });

  it("declines to give a per-job rate when there are no open jobs", async () => {
    // Zero is a measurement; "nothing to measure" is not. The landing page's
    // counters already answer this way and the console must not contradict them.
    const admin = await signedInAdmin("ins-null-root@example.com");
    const res = await request(app)
      .get("/api/v1/admin/insights")
      .use(asSession("admin", admin))
      .expect(200);

    expect(res.body.liquidity.openJobs).toBe(0);
    expect(res.body.liquidity.applicationsPerJob).toBeNull();
    expect(res.body.liquidity.jobsWithApplications).toBe(0);
  });

  it("measures application coverage across open jobs", async () => {
    const { seeker, job } = await marketplace("ins-cover");
    await Application.create({ job, applicant: seeker, status: "applied", history: [] });

    const admin = await signedInAdmin("ins-cover-root@example.com");
    const res = await request(app)
      .get("/api/v1/admin/insights")
      .use(asSession("admin", admin))
      .expect(200);

    // Two open jobs, one of which holds the single application.
    expect(res.body.liquidity.openJobs).toBe(2);
    expect(res.body.liquidity.jobsWithApplications).toBe(1);
    expect(res.body.liquidity.applicationsPerJob).toBeCloseTo(0.5, 5);
  });

  it("excludes closed jobs from the open-job denominator", async () => {
    // A closed role cannot attract an application, so counting it as capacity
    // understates liquidity for a reason unrelated to demand.
    const { secondJob } = await marketplace("ins-closed");
    await Job.updateOne({ _id: secondJob }, { $set: { status: "closed" } });

    const admin = await signedInAdmin("ins-closed-root@example.com");
    const res = await request(app)
      .get("/api/v1/admin/insights")
      .use(asSession("admin", admin))
      .expect(200);

    expect(res.body.liquidity.openJobs).toBe(1);
  });

  it("counts a job with no status field as open", async () => {
    // Every one of production's 198 jobs predates the field. An equality match
    // on "open" returns none of them, which would report zero capacity on the
    // live platform — the trap `job.service` documents by filtering with $ne.
    const { job } = await marketplace("ins-legacy");
    await Job.collection.updateOne({ _id: job }, { $unset: { status: "" } });

    const admin = await signedInAdmin("ins-legacy-root@example.com");
    const res = await request(app)
      .get("/api/v1/admin/insights")
      .use(asSession("admin", admin))
      .expect(200);

    expect(res.body.liquidity.openJobs).toBe(2);
  });

  it("flags companies with an incomplete profile", async () => {
    // The triage band's second item, and the one with real volume: in production
    // every company carries a logo and none carries a website, so the useful
    // signal is "missing either", not "missing both" — the latter is zero there.
    //
    // The schema field is `logo`, not `logoUrl`; the DTO renames it on the way
    // out. Under strict mode a fixture written with the DTO's name is dropped
    // silently, which would make a company look unbranded for the wrong reason.
    const { recruiter } = await marketplace("ins-brand");
    await Company.create({ name: "Bare Co", userId: recruiter });
    await Company.create({
      name: "Logo Only Co",
      userId: recruiter,
      logo: "https://cdn.example.com/l.png",
    });
    await Company.create({
      name: "Complete Co",
      userId: recruiter,
      logo: "https://cdn.example.com/l.png",
      website: "https://example.com",
    });

    const admin = await signedInAdmin("ins-brand-root@example.com");
    const res = await request(app)
      .get("/api/v1/admin/insights")
      .use(asSession("admin", admin))
      .expect(200);

    // The fixture's own company (neither) plus Bare Co (neither) plus Logo Only
    // Co (no website). Complete Co is the only one excluded — which is what
    // separates "missing either" from "missing both".
    expect(res.body.triage.companiesMissingBranding).toBe(3);
  });

  it("counts pending recruiters in triage", async () => {
    await pendingRecruiter("ins-triage-pending@example.com");
    const admin = await signedInAdmin("ins-triage-root@example.com");
    const res = await request(app)
      .get("/api/v1/admin/insights")
      .use(asSession("admin", admin))
      .expect(200);

    expect(res.body.triage.pendingRecruiters).toBe(1);
  });

  it("returns a dense daily series with zero-filled gaps", async () => {
    // A sparse series makes the client infer the missing days, and a chart that
    // silently closes a gap draws a trend the data does not contain.
    const { recruiter, company } = await marketplace("ins-series");
    // createdAt is immutable under timestamps:true, so it is set at creation
    // rather than updated afterwards.
    await Job.create({
      title: "Backdated",
      description: "d",
      requirements: ["ts"],
      salary: 10,
      experienceLevel: 2,
      location: "Pune",
      jobType: "Full-time",
      position: "1",
      company,
      created_by: recruiter,
      createdAt: utcDay(3),
    });

    const admin = await signedInAdmin("ins-series-root@example.com");
    const res = await request(app)
      .get("/api/v1/admin/insights")
      .use(asSession("admin", admin))
      .expect(200);

    const series: Array<{ date: string; count: number }> = res.body.jobsPostedSeries;
    expect(series).toHaveLength(56);
    // Zip the series against itself one place over, so the pairwise walk needs
    // no indexing that strict mode has to be talked out of.
    for (const [prev, curr] of series.slice(0, -1).map((p, i) => [p, series[i + 1]!] as const)) {
      const gap = Date.parse(`${curr.date}T00:00:00Z`) - Date.parse(`${prev.date}T00:00:00Z`);
      expect(gap).toBe(86_400_000);
    }
    expect(series.at(-1)!.date).toBe(isoDay(0));
    expect(series.find((p) => p.date === isoDay(3))!.count).toBe(1);
  });

  it("ranks departments by volume and omits the ones with none", async () => {
    // The composition list is a ranking, so an entry at zero is noise — unlike
    // the pipeline, where a named stage at zero is information.
    const { recruiter, company } = await marketplace("ins-dept");
    await Job.create({
      title: "Designer",
      description: "d",
      requirements: ["figma"],
      salary: 10,
      experienceLevel: 2,
      location: "Pune",
      jobType: "Full-time",
      position: "1",
      department: "Design & Research",
      company,
      created_by: recruiter,
    });

    const admin = await signedInAdmin("ins-dept-root@example.com");
    const res = await request(app)
      .get("/api/v1/admin/insights")
      .use(asSession("admin", admin))
      .expect(200);

    const depts: Array<{ label: string; count: number }> = res.body.composition.byDepartment;
    expect(depts.length).toBeGreaterThan(0);
    expect(depts.every((d) => d.count > 0)).toBe(true);
    const counts = depts.map((d) => d.count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it("reports the remote share against open jobs", async () => {
    const { secondJob } = await marketplace("ins-remote");
    await Job.updateOne({ _id: secondJob }, { $set: { remote: true } });

    const admin = await signedInAdmin("ins-remote-root@example.com");
    const res = await request(app)
      .get("/api/v1/admin/insights")
      .use(asSession("admin", admin))
      .expect(200);

    expect(res.body.composition.remoteOpenJobs).toBe(1);
  });

  it("ranks employment types by volume", async () => {
    const { recruiter, company } = await marketplace("ins-type");
    await Job.create({
      title: "Intern",
      description: "d",
      requirements: ["ts"],
      salary: 10,
      experienceLevel: 0,
      location: "Pune",
      jobType: "Internship",
      position: "1",
      company,
      created_by: recruiter,
    });

    const admin = await signedInAdmin("ins-type-root@example.com");
    const res = await request(app)
      .get("/api/v1/admin/insights")
      .use(asSession("admin", admin))
      .expect(200);

    const types: Array<{ label: string; count: number }> = res.body.composition.byType;
    expect(types[0]).toEqual({ label: "Full-time", count: 2 });
    expect(types).toContainEqual({ label: "Internship", count: 1 });
  });

  it("stamps the response with the time it was generated", async () => {
    // The screen says "as of". Without a server timestamp that label would be
    // the browser's clock describing the server's numbers.
    const admin = await signedInAdmin("ins-stamp-root@example.com");
    const res = await request(app)
      .get("/api/v1/admin/insights")
      .use(asSession("admin", admin))
      .expect(200);

    expect(Number.isNaN(Date.parse(res.body.generatedAt))).toBe(false);
  });

  it("refuses a recruiter cookie", async () => {
    // Same boundary the rest of the console answers to: insights read across
    // every recruiter's data, so the portal check is the only thing in the way.
    const access = await pendingRecruiter("ins-authz@example.com");
    await request(app)
      .get("/api/v1/admin/insights")
      .set("Cookie", [`jp_recruiter_at=${access}`])
      .expect(401);
  });
});

describe("admin activity", () => {
  beforeEach(() => installCaptureMailer());

  it("merges events from every collection, newest first", async () => {
    const { seeker, job } = await marketplace("act-merge");
    await Application.create({ job, applicant: seeker, status: "applied", history: [] });

    const admin = await signedInAdmin("act-merge-root@example.com");
    const res = await request(app)
      .get("/api/v1/admin/activity")
      .use(asSession("admin", admin))
      .expect(200);

    const kinds = res.body.items.map((i: { kind: string }) => i.kind);
    expect(kinds).toContain("job_posted");
    expect(kinds).toContain("company_created");
    expect(kinds).toContain("application_submitted");

    const times = res.body.items.map((i: { at: string }) => Date.parse(i.at));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it("caps the feed", async () => {
    const { recruiter, company } = await marketplace("act-cap");
    for (let i = 0; i < 20; i += 1) {
      await Job.create({
        title: `Role ${i}`,
        description: "d",
        requirements: ["ts"],
        salary: 10,
        experienceLevel: 2,
        location: "Pune",
        jobType: "Full-time",
        position: "1",
        company,
        created_by: recruiter,
      });
    }

    const admin = await signedInAdmin("act-cap-root@example.com");
    const res = await request(app)
      .get("/api/v1/admin/activity")
      .use(asSession("admin", admin))
      .expect(200);

    expect(res.body.items.length).toBeLessThanOrEqual(12);
  });

  it("carries no contact details for the people in the feed", async () => {
    // The feed is a narrow projection like every other console read. A seeker's
    // address has no place in a "what happened" list, and inheriting one later
    // is how a moderation screen becomes an export.
    const { seeker, job } = await marketplace("act-pii");
    await Application.create({ job, applicant: seeker, status: "applied", history: [] });

    const admin = await signedInAdmin("act-pii-root@example.com");
    const res = await request(app)
      .get("/api/v1/admin/activity")
      .use(asSession("admin", admin))
      .expect(200);

    expect(JSON.stringify(res.body)).not.toContain("act-pii-seeker@example.com");
  });

  it("refuses a seeker cookie", async () => {
    const access = await signedInSeeker("act-authz@example.com");
    await request(app)
      .get("/api/v1/admin/activity")
      .set("Cookie", [`jp_seeker_at=${access}`])
      .expect(401);
  });
});
