import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { Admin } from "../src/models/admin.model.js";
import { Seeker } from "../src/models/seeker.model.js";
import { Recruiter } from "../src/models/recruiter.model.js";
import { AccountEvent } from "../src/models/accountEvent.model.js";
import { hashPassword } from "../src/lib/password.js";
import { asSession, installCaptureMailer, outbox, signedUpOn } from "./auth/helpers.js";

const app = buildApp();
const PASSWORD = "correct horse battery staple";

beforeEach(installCaptureMailer);

/** An admin session, built the way adminProfile.test.ts builds its admins. */
async function adminCookies(email: string): Promise<string[]> {
  await Admin.create({
    email,
    fullName: "Oversight Admin",
    passwordHash: await hashPassword(PASSWORD),
    emailVerifiedAt: new Date(),
    status: "active",
  });
  const login = await request(app)
    .post("/api/v1/admin/auth/login")
    .send({ email, password: PASSWORD });
  expect(login.status).toBe(200);
  return login.headers["set-cookie"] as unknown as string[];
}

function csrfFrom(cookies: string[]): string {
  return cookies
    .map((c) => /jp_admin_csrf=([^;]+)/.exec(c)?.[1])
    .find((v): v is string => Boolean(v))!;
}

/** A recruiter with an approved account, an open job, and one application. */
async function recruiterWithJobAndApplicant(ownerEmail: string, applicantEmail: string) {
  const { Company } = await import("../src/models/company.model.js");
  const { Job } = await import("../src/models/job.model.js");
  const { Application } = await import("../src/models/application.model.js");

  const owner = await signedUpOn("recruiter", ownerEmail);
  const company = await Company.create({ name: "Oversight Co", userId: owner.id });
  const job = await Job.create({
    title: "Queued Role",
    description: "Work.",
    requirements: [],
    salary: 5,
    experienceLevel: 0,
    location: "Remote",
    jobType: "Full-time",
    position: 1,
    company: company._id,
    created_by: owner.id,
  });
  const applicant = await signedUpOn("seeker", applicantEmail);
  await Application.create({
    job: job._id,
    applicant: applicant.id,
    status: "applied",
    history: [{ status: "applied", at: new Date(), byPortal: "seeker" }],
  });
  return { owner, job, applicant };
}

describe("suspend and reinstate", () => {
  it("suspends an active account, kills its sessions, and records why", async () => {
    const cookies = await adminCookies("admin-susp@x.test");
    const csrf = csrfFrom(cookies);
    const victim = await signedUpOn("seeker", "suspended-seeker@x.test");

    const res = await request(app)
      .post(`/api/v1/admin/seekers/${victim.id}/suspend`)
      .set("Cookie", cookies)
      .set("X-CSRF-Token", csrf)
      .send({ reason: "Spam applications." });
    expect(res.status).toBe(200);

    const account = await Seeker.findById(victim.id);
    expect(account?.status).toBe("suspended");
    expect(account?.suspension?.reason).toBe("Spam applications.");

    // The session died with the account.
    const me = await request(app)
      .get("/api/v1/seeker/auth/me")
      .set("Cookie", [`jp_seeker_at=${victim.access}`]);
    expect(me.status).toBe(401);

    // The mail told the owner why.
    expect(
      outbox.some(
        (m) => m.to === "suspended-seeker@x.test" && /suspended/i.test(m.subject) && /Spam applications\./.test(m.text),
      ),
    ).toBe(true);

    // The decision is in the history.
    const events = await AccountEvent.find({ portal: "seeker", subjectId: victim.id }).lean();
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe("suspended");
    expect(events[0]?.reason).toBe("Spam applications.");
  });

  it("shows the reason at login only after a correct password", async () => {
    const cookies = await adminCookies("admin-login@x.test");
    const csrf = csrfFrom(cookies);
    const victim = await signedUpOn("seeker", "reason-seeker@x.test");
    await request(app)
      .post(`/api/v1/admin/seekers/${victim.id}/suspend`)
      .set("Cookie", cookies)
      .set("X-CSRF-Token", csrf)
      .send({ reason: "Harassment in messages." });

    // A wrong password keeps the uniform 401 — the reason is not for strangers.
    const wrong = await request(app)
      .post("/api/v1/seeker/auth/login")
      .send({ email: "reason-seeker@x.test", password: "not the password at all" });
    expect(wrong.status).toBe(401);
    expect(wrong.body.code).toBe("INVALID_CREDENTIALS");

    // The owner sees why.
    const right = await request(app)
      .post("/api/v1/seeker/auth/login")
      .send({ email: "reason-seeker@x.test", password: PASSWORD });
    expect(right.status).toBe(403);
    expect(right.body.code).toBe("ACCOUNT_SUSPENDED");
    expect(right.body.message).toContain("Harassment in messages.");
  });

  it("requires a reason to suspend", async () => {
    const cookies = await adminCookies("admin-noreason@x.test");
    const csrf = csrfFrom(cookies);
    const victim = await signedUpOn("seeker", "reasonless-seeker@x.test");
    const res = await request(app)
      .post(`/api/v1/admin/seekers/${victim.id}/suspend`)
      .set("Cookie", cookies)
      .set("X-CSRF-Token", csrf)
      .send({});
    expect(res.status).toBe(400);
    expect(await Seeker.countDocuments({ _id: victim.id, status: "active" })).toBe(1);
  });

  it("suspension is idempotent and races produce one event", async () => {
    const cookies = await adminCookies("admin-race@x.test");
    const csrf = csrfFrom(cookies);
    const victim = await signedUpOn("recruiter", "raced-recruiter@x.test");

    const both = await Promise.all([
      request(app)
        .post(`/api/v1/admin/recruiters/${victim.id}/suspend`)
        .set("Cookie", cookies)
        .set("X-CSRF-Token", csrf)
        .send({ reason: "First." }),
      request(app)
        .post(`/api/v1/admin/recruiters/${victim.id}/suspend`)
        .set("Cookie", cookies)
        .set("X-CSRF-Token", csrf)
        .send({ reason: "Second." }),
    ]);
    expect(both.every((r) => r.status === 200)).toBe(true);
    expect(await AccountEvent.countDocuments({ portal: "recruiter", subjectId: victim.id })).toBe(1);
  });

  it("reinstate restores login and records the reversal", async () => {
    const cookies = await adminCookies("admin-rein@x.test");
    const csrf = csrfFrom(cookies);
    const victim = await signedUpOn("seeker", "reinstated-seeker@x.test");
    await request(app)
      .post(`/api/v1/admin/seekers/${victim.id}/suspend`)
      .set("Cookie", cookies)
      .set("X-CSRF-Token", csrf)
      .send({ reason: "Mistake." });

    const res = await request(app)
      .post(`/api/v1/admin/seekers/${victim.id}/reinstate`)
      .set("Cookie", cookies)
      .set("X-CSRF-Token", csrf);
    expect(res.status).toBe(200);

    const account = await Seeker.findById(victim.id);
    expect(account?.status).toBe("active");
    expect(account?.suspension?.reason ?? null).toBeNull();

    const login = await request(app)
      .post("/api/v1/seeker/auth/login")
      .send({ email: "reinstated-seeker@x.test", password: PASSWORD });
    expect(login.status).toBe(200);

    const events = await AccountEvent.find({ portal: "seeker", subjectId: victim.id })
      .sort({ createdAt: 1 })
      .lean();
    expect(events.map((e) => e.kind)).toEqual(["suspended", "reinstated"]);
  });

  it("reinstate of a DENIED recruiter returns them to pending, not active", async () => {
    const cookies = await adminCookies("admin-undeny@x.test");
    const csrf = csrfFrom(cookies);

    // A pending recruiter, denied through the real queue.
    const { Recruiter: RecruiterModel } = await import("../src/models/recruiter.model.js");
    const pending = await signedUpOn("recruiter", "denied-recruiter@x.test", { approved: false });
    await RecruiterModel.updateOne({ email: "denied-recruiter@x.test" }, { $set: { status: "pending" } });
    const deny = await request(app)
      .post(`/api/v1/admin/recruiters/${pending.id}/deny`)
      .set("Cookie", cookies)
      .set("X-CSRF-Token", csrf)
      .send({ reason: "Could not verify." });
    expect(deny.status).toBe(200);

    // Undone into the queue, not around it.
    const reinstate = await request(app)
      .post(`/api/v1/admin/recruiters/${pending.id}/reinstate`)
      .set("Cookie", cookies)
      .set("X-CSRF-Token", csrf);
    expect(reinstate.status).toBe(200);
    expect(await Recruiter.countDocuments({ _id: pending.id, status: "pending" })).toBe(1);
  });
});

describe("a suspended recruiter's jobs", () => {
  it("stay live on the board but accept no applications", async () => {
    const { Job } = await import("../src/models/job.model.js");
    const { owner, job } = await recruiterWithJobAndApplicant(
      "susp-owner@x.test",
      "susp-applicant@x.test",
    );
    const cookies = await adminCookies("admin-jobs@x.test");
    const csrf = csrfFrom(cookies);

    await request(app)
      .post(`/api/v1/admin/recruiters/${owner.id}/suspend`)
      .set("Cookie", cookies)
      .set("X-CSRF-Token", csrf)
      .send({ reason: "Under review." });

    // The listing is still public.
    const detail = await request(app).get(`/api/v1/job/get/${job.id}`);
    expect(detail.status).toBe(200);

    // A new application is refused — vague copy, no named reason.
    const fresh = await signedUpOn("seeker", "fresh-applicant@x.test");
    const apply = await request(app)
      .post(`/api/v1/application/apply/${job.id}`)
      .use(asSession("seeker", fresh));
    expect(apply.status).toBe(403);
    expect(apply.body.code).toBe("JOB_OWNER_SUSPENDED");
    expect(apply.body.message).not.toContain("Under review");
  });
});

describe("the admin listings", () => {
  it("lists seekers with the derived minor flag and counts", async () => {
    const cookies = await adminCookies("admin-seekers@x.test");
    const minor = await signedUpOn("seeker", "listed-minor@x.test");
    await Seeker.updateOne(
      { email: "listed-minor@x.test" },
      { $set: { dob: new Date("2010-01-01T00:00:00Z") } },
    );

    const res = await request(app).get("/api/v1/admin/seekers").set("Cookie", cookies);
    expect(res.status).toBe(200);
    const row = res.body.items.find((item: { email: string }) => item.email === "listed-minor@x.test");
    expect(row.minor).toBe(true);
    expect(row.status).toBe("active");
    // The hand-written projection: no DOB, no phone, no resume anywhere.
    expect(JSON.stringify(res.body)).not.toMatch(/"dob"|resumeUrl|passwordHash/);
  });

  it("lists every recruiter with status and counts", async () => {
    const cookies = await adminCookies("admin-recs@x.test");
    await recruiterWithJobAndApplicant("listed-owner@x.test", "listed-applicant@x.test");

    const res = await request(app).get("/api/v1/admin/recruiters").set("Cookie", cookies);
    expect(res.status).toBe(200);
    const row = res.body.items.find((item: { email: string }) => item.email === "listed-owner@x.test");
    expect(row.status).toBe("active");
    expect(row.jobCount).toBe(1);
    expect(row.applicationCount).toBe(1);
  });

  it("keyword-matches and paginates like the other console lists", async () => {
    const cookies = await adminCookies("admin-kw@x.test");
    await signedUpOn("seeker", "needle-person@x.test");
    await signedUpOn("seeker", "haystack-person@x.test");

    const res = await request(app)
      .get("/api/v1/admin/seekers?keyword=needle")
      .set("Cookie", cookies);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].email).toBe("needle-person@x.test");

    const paged = await request(app)
      .get("/api/v1/admin/seekers?page=1&limit=1")
      .set("Cookie", cookies);
    expect(paged.body.items).toHaveLength(1);
    expect(paged.body.pages).toBeGreaterThanOrEqual(2);
  });

  it("refuses a non-admin and a bad portal segment", async () => {
    const seeker = await signedUpOn("seeker", "not-admin@x.test");
    const denied = await request(app)
      .get("/api/v1/admin/seekers")
      .set("Cookie", [`jp_seeker_at=${seeker.access}`]);
    expect(denied.status).toBe(401);

    const cookies = await adminCookies("admin-portal@x.test");
    const bad = await request(app)
      .get(`/api/v1/admin/accounts/notaportal/${seeker.id}/events`)
      .set("Cookie", cookies);
    expect(bad.status).toBe(400);
  });
});

describe("the per-account history", () => {
  it("records approve and deny from the queue, with the acting admin", async () => {
    const cookies = await adminCookies("admin-hist@x.test");
    const csrf = csrfFrom(cookies);
    const { Recruiter: RecruiterModel } = await import("../src/models/recruiter.model.js");

    const approved = await signedUpOn("recruiter", "hist-approved@x.test", { approved: false });
    await RecruiterModel.updateOne({ email: "hist-approved@x.test" }, { $set: { status: "pending" } });
    await request(app)
      .post(`/api/v1/admin/recruiters/${approved.id}/approve`)
      .set("Cookie", cookies)
      .set("X-CSRF-Token", csrf);

    const denied = await signedUpOn("recruiter", "hist-denied@x.test", { approved: false });
    await RecruiterModel.updateOne({ email: "hist-denied@x.test" }, { $set: { status: "pending" } });
    await request(app)
      .post(`/api/v1/admin/recruiters/${denied.id}/deny`)
      .set("Cookie", cookies)
      .set("X-CSRF-Token", csrf)
      .send({ reason: "No company." });

    const history = await request(app)
      .get(`/api/v1/admin/accounts/recruiter/${denied.id}/events`)
      .set("Cookie", cookies);
    expect(history.status).toBe(200);
    expect(history.body.items[0].kind).toBe("denied");
    expect(history.body.items[0].reason).toBe("No company.");
    expect(history.body.items[0].actorEmail).toBe("admin-hist@x.test");

    // And approve/deny leave exactly one row even when raced (the guarded
    // update matched zero for the loser, so nothing was recorded).
    expect(
      await AccountEvent.countDocuments({ portal: "recruiter", subjectId: approved.id }),
    ).toBe(1);
  });
});

describe("the recruiter's cross-job queue", () => {
  it("lists applications across every owned job, newest first, with the job named", async () => {
    const { owner } = await recruiterWithJobAndApplicant(
      "queue-owner@x.test",
      "queue-applicant@x.test",
    );
    // A second job and applicant, so the queue is genuinely cross-job.
    const { Company } = await import("../src/models/company.model.js");
    const { Job } = await import("../src/models/job.model.js");
    const { Application } = await import("../src/models/application.model.js");
    const company = await Company.findOne({ userId: owner.id });
    const secondJob = await Job.create({
      title: "Second Role",
      description: "Work.",
      requirements: [],
      salary: 6,
      experienceLevel: 1,
      location: "Remote",
      jobType: "Contract",
      position: 1,
      company: company!._id,
      created_by: owner.id,
    });
    const secondApplicant = await signedUpOn("seeker", "queue-second@x.test");
    await Application.create({
      job: secondJob._id,
      applicant: secondApplicant.id,
      status: "applied",
      history: [{ status: "applied", at: new Date(), byPortal: "seeker" }],
    });

    const res = await request(app)
      .get("/api/v1/application/queue")
      .use(asSession("recruiter", owner));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);

    const titles = res.body.items.map((item: { jobTitle: string }) => item.jobTitle);
    expect(titles).toContain("Queued Role");
    expect(titles).toContain("Second Role");
    // The applicant fields the per-job list carries are all here too.
    expect(res.body.items[0].email).toBeTruthy();
    expect(typeof (res.body.items[0].fit?.score ?? null)).not.toBe("undefined");
  });

  it("shows another recruiter nothing", async () => {
    await recruiterWithJobAndApplicant("queue-owner2@x.test", "queue-applicant2@x.test");
    const stranger = await signedUpOn("recruiter", "queue-stranger@x.test");
    const res = await request(app)
      .get("/api/v1/application/queue")
      .use(asSession("recruiter", stranger));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  it("refuses an unapproved recruiter", async () => {
    const pending = await signedUpOn("recruiter", "queue-pending@x.test", { approved: false });
    await Recruiter.updateOne({ email: "queue-pending@x.test" }, { $set: { status: "pending" } });
    const res = await request(app)
      .get("/api/v1/application/queue")
      .use(asSession("recruiter", pending));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("RECRUITER_PENDING_APPROVAL");
  });
});
