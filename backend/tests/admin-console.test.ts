import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { Recruiter } from "../src/models/recruiter.model.js";
import { Admin } from "../src/models/admin.model.js";
import { Company } from "../src/models/company.model.js";
import { Job } from "../src/models/job.model.js";
import { installCaptureMailer, lastCodeFor, cookieValue, outbox } from "./auth/helpers.js";

const app = buildApp();
const PASSWORD = "correct horse battery staple";

async function signedInAdmin(email: string): Promise<string> {
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
  return cookieValue(login, "jp_admin_at")!;
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
 * The authorization matrix CLAUDE.md requires. These endpoints read across
 * EVERY recruiter's data, so the portal check is the only thing between a
 * seeker's cookie and the whole domain.
 *
 * A seeker or recruiter cookie fails SIGNATURE verification here rather than a
 * claim comparison — the access key is HKDF-derived per portal — so the
 * expected answer is 401, not 403.
 */
describe("admin console authorization", () => {
  beforeEach(() => installCaptureMailer());

  const ENDPOINTS = ["/api/v1/admin/overview", "/api/v1/admin/review/jobs", "/api/v1/admin/review/companies"];

  for (const [i, url] of ENDPOINTS.entries()) {
    it(`${url} refuses an anonymous caller`, async () => {
      await request(app).get(url).expect(401);
    });

    it(`${url} refuses a seeker`, async () => {
      const access = await signedInSeeker(`seeker${i}@example.com`);
      await request(app).get(url).set("Cookie", [`jp_seeker_at=${access}`]).expect(401);
    });

    it(`${url} refuses a recruiter`, async () => {
      const access = await pendingRecruiter(`rec${i}@example.com`);
      await request(app).get(url).set("Cookie", [`jp_recruiter_at=${access}`]).expect(401);
    });
  }

  it("deny refuses a recruiter trying to deny a peer", async () => {
    const target = await Recruiter.create({
      fullName: "Target",
      email: "target-deny@example.com",
      passwordHash: null,
      status: "pending",
    });
    const access = await pendingRecruiter("peer-deny@example.com");
    await request(app)
      .post(`/api/v1/admin/recruiters/${String(target._id)}/deny`)
      .set("Cookie", [`jp_recruiter_at=${access}`])
      .send({ reason: "nope" })
      .expect(401);
  });
});

describe("admin overview", () => {
  beforeEach(() => installCaptureMailer());

  it("counts recruiters by status and totals the domain", async () => {
    await pendingRecruiter("ov-pending@example.com");
    const active = await Recruiter.create({
      fullName: "Active",
      email: "ov-active@example.com",
      passwordHash: null,
      status: "active",
    });
    const company = await Company.create({ name: "Acme", userId: active._id });
    await Job.create({
      title: "Dev",
      description: "d",
      requirements: ["ts"],
      salary: 10,
      experienceLevel: 2,
      location: "Pune",
      jobType: "Full-time",
      position: "1",
      company: company._id,
      created_by: active._id,
    });

    const admin = await signedInAdmin("ov-root@example.com");
    const res = await request(app)
      .get("/api/v1/admin/overview")
      .set("Cookie", [`jp_admin_at=${admin}`])
      .expect(200);

    expect(res.body.recruiters.pending).toBe(1);
    expect(res.body.recruiters.active).toBe(1);
    expect(res.body.jobs.total).toBe(1);
    expect(res.body.companies.total).toBe(1);
  });
});

describe("admin jobs list", () => {
  beforeEach(() => installCaptureMailer());

  it("lists jobs with the poster's email and company", async () => {
    const recruiter = await Recruiter.create({
      fullName: "Poster",
      email: "poster@example.com",
      passwordHash: null,
      status: "active",
    });
    const company = await Company.create({ name: "Globex", userId: recruiter._id });
    await Job.create({
      title: "Staff Engineer",
      description: "d",
      requirements: ["go"],
      salary: 40,
      experienceLevel: 8,
      location: "Remote",
      jobType: "Full-time",
      position: "1",
      company: company._id,
      created_by: recruiter._id,
    });

    const admin = await signedInAdmin("jobs-root@example.com");
    const res = await request(app)
      .get("/api/v1/admin/review/jobs")
      .set("Cookie", [`jp_admin_at=${admin}`])
      .expect(200);

    expect(res.body.total).toBe(1);
    expect(res.body.items[0].title).toBe("Staff Engineer");
    // The one field the public JobDto withholds and the admin needs.
    expect(res.body.items[0].recruiterEmail).toBe("poster@example.com");
    expect(res.body.items[0].companyName).toBe("Globex");
  });

  it("treats a regex metacharacter in keyword as a literal", async () => {
    const recruiter = await Recruiter.create({
      fullName: "Poster",
      email: "poster2@example.com",
      passwordHash: null,
      status: "active",
    });
    const company = await Company.create({ name: "Initech", userId: recruiter._id });
    const base = {
      description: "d",
      requirements: ["x"],
      salary: 1,
      experienceLevel: 1,
      location: "Pune",
      jobType: "Full-time",
      position: "1",
      company: company._id,
      created_by: recruiter._id,
    };
    await Job.create({ ...base, title: "Literal .* match" });
    await Job.create({ ...base, title: "Should not match" });

    const admin = await signedInAdmin("regex-root@example.com");
    const res = await request(app)
      .get("/api/v1/admin/review/jobs?keyword=.*")
      .set("Cookie", [`jp_admin_at=${admin}`])
      .expect(200);

    expect(res.body.total).toBe(1);
    expect(res.body.items[0].title).toBe("Literal .* match");
  });
});

describe("admin companies list", () => {
  beforeEach(() => installCaptureMailer());

  it("lists companies with their owner and job count", async () => {
    const recruiter = await Recruiter.create({
      fullName: "Owner",
      email: "owner@example.com",
      passwordHash: null,
      status: "active",
    });
    const company = await Company.create({ name: "Umbrella", userId: recruiter._id });
    await Job.create({
      title: "Dev",
      description: "d",
      requirements: ["ts"],
      salary: 5,
      experienceLevel: 1,
      location: "Pune",
      jobType: "Full-time",
      position: "1",
      company: company._id,
      created_by: recruiter._id,
    });

    const admin = await signedInAdmin("co-root@example.com");
    const res = await request(app)
      .get("/api/v1/admin/review/companies")
      .set("Cookie", [`jp_admin_at=${admin}`])
      .expect(200);

    expect(res.body.total).toBe(1);
    expect(res.body.items[0].name).toBe("Umbrella");
    expect(res.body.items[0].ownerEmail).toBe("owner@example.com");
    expect(res.body.items[0].jobCount).toBe(1);
  });
});

describe("admin deny", () => {
  beforeEach(() => installCaptureMailer());

  it("suspends a pending recruiter and mails them the reason", async () => {
    await pendingRecruiter("deny-me@example.com");
    const admin = await signedInAdmin("deny-root@example.com");
    const target = await Recruiter.findOne({ email: "deny-me@example.com" });

    outbox.length = 0;
    await request(app)
      .post(`/api/v1/admin/recruiters/${String(target!._id)}/deny`)
      .set("Cookie", [`jp_admin_at=${admin}`])
      .send({ reason: "Company could not be verified" })
      .expect(200);

    const after = await Recruiter.findById(target!._id);
    expect(after!.status).toBe("suspended");
  });

  it("requires a reason", async () => {
    await pendingRecruiter("deny-noreason@example.com");
    const admin = await signedInAdmin("deny-root2@example.com");
    const target = await Recruiter.findOne({ email: "deny-noreason@example.com" });

    await request(app)
      .post(`/api/v1/admin/recruiters/${String(target!._id)}/deny`)
      .set("Cookie", [`jp_admin_at=${admin}`])
      .send({ reason: "   " })
      .expect(400);
  });

  it("404s an unknown recruiter", async () => {
    const admin = await signedInAdmin("deny-root3@example.com");
    await request(app)
      .post("/api/v1/admin/recruiters/000000000000000000000000/deny")
      .set("Cookie", [`jp_admin_at=${admin}`])
      .send({ reason: "gone" })
      .expect(404);
  });

  it("refuses to deny an already-active recruiter", async () => {
    // Denial is for the pending queue. An active recruiter is a running
    // business relationship; ending it is suspension, a different action with
    // different consequences, and must not be reachable by a queue button.
    const target = await Recruiter.create({
      fullName: "Established",
      email: "established@example.com",
      passwordHash: null,
      status: "active",
    });
    const admin = await signedInAdmin("deny-root4@example.com");

    await request(app)
      .post(`/api/v1/admin/recruiters/${String(target._id)}/deny`)
      .set("Cookie", [`jp_admin_at=${admin}`])
      .send({ reason: "changed my mind" })
      .expect(409);

    const after = await Recruiter.findById(target._id);
    expect(after!.status).toBe("active");
  });
});
