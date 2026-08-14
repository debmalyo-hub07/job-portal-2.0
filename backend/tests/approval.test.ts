import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { Recruiter } from "../src/models/recruiter.model.js";
import { Admin } from "../src/models/admin.model.js";
import { asSession, installCaptureMailer, lastCodeFor, cookieValue, outbox } from "./auth/helpers.js";

const app = buildApp();
const PASSWORD = "correct horse battery staple";

async function pendingRecruiter(email: string): Promise<{ access: string; csrf: string }> {
  await request(app)
    .post("/api/v1/recruiter/auth/register")
    .send({ fullName: "Pending", email, password: PASSWORD });
  const code = await lastCodeFor(email);
  await request(app).post("/api/v1/recruiter/auth/verify-email").send({ email, code });
  const login = await request(app)
    .post("/api/v1/recruiter/auth/login")
    .send({ email, password: PASSWORD });
  return {
    access: cookieValue(login, "jp_recruiter_at")!,
    csrf: cookieValue(login, "jp_csrf")!,
  };
}

/**
 * The authorization half of the pending split. `authenticate` admits a pending
 * recruiter so they can reach /me and learn why they are stuck; this is what
 * refuses the work itself.
 *
 * 403 rather than the 404 used for ownership failures: that rule exists so a
 * foreign recruiter cannot prove a resource EXISTS, whereas this concerns the
 * caller's own account state and discloses nothing about any resource.
 */
describe("requireApproved", () => {
  beforeEach(() => installCaptureMailer());

  it("refuses company creation with 403 RECRUITER_PENDING_APPROVAL", async () => {
    const access = await pendingRecruiter("p1@example.com");
    const res = await request(app)
      .post("/api/v1/company/register")
      .use(asSession("recruiter", access))
      .send({ name: "Acme" })
      .expect(403);
    expect(res.body.code).toBe("RECRUITER_PENDING_APPROVAL");
  });

  it("refuses job creation", async () => {
    const access = await pendingRecruiter("p2@example.com");
    await request(app)
      .post("/api/v1/job/post")
      .use(asSession("recruiter", access))
      .send({ title: "Dev" })
      .expect(403);
  });

  it("refuses reading applicants", async () => {
    const access = await pendingRecruiter("p4@example.com");
    await request(app)
      .get("/api/v1/application/000000000000000000000000/applicants")
      .use(asSession("recruiter", access))
      .expect(403);
  });

  it("refuses updating an application's status", async () => {
    const access = await pendingRecruiter("p5@example.com");
    await request(app)
      .post("/api/v1/application/status/000000000000000000000000/update")
      .use(asSession("recruiter", access))
      .send({ status: "shortlisted" })
      .expect(403);
  });

  it("allows the same call once approved", async () => {
    const access = await pendingRecruiter("p3@example.com");
    await Recruiter.updateOne({ email: "p3@example.com" }, { $set: { status: "active" } });
    const res = await request(app)
      .post("/api/v1/company/register")
      .use(asSession("recruiter", access))
      .send({ name: "Acme Two" });
    expect(res.status).not.toBe(403);
  });

  it("is unreachable for an anonymous caller — 401 before 403", async () => {
    await request(app).post("/api/v1/company/register").send({ name: "Acme" }).expect(401);
  });

  // A pending recruiter has no rows of their own, so these read the empty set
  // rather than erroring. Gating them would turn an ordinary empty workspace
  // into an error screen with nothing to explain it.
  it("still allows a pending recruiter to read their own (empty) lists", async () => {
    const access = await pendingRecruiter("p6@example.com");
    await request(app)
      .get("/api/v1/company/get")
      .use(asSession("recruiter", access))
      .expect(200);
    await request(app)
      .get("/api/v1/job/getadminjobs")
      .use(asSession("recruiter", access))
      .expect(200);
  });
});

/**
 * Creates a signed-in admin the way `seed:admin` will: the row is created with
 * no password, then a password is set through the ordinary reset flow. No
 * password ever passes through a CLI argument or a log.
 */
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
    csrf: cookieValue(login, "jp_csrf")!,
  };
}

describe("admin approval", () => {
  beforeEach(() => installCaptureMailer());

  it("lists pending recruiters", async () => {
    await pendingRecruiter("list1@example.com");
    const admin = await signedInAdmin("root1@example.com");

    const res = await request(app)
      .get("/api/v1/admin/recruiters/pending")
      .use(asSession("admin", admin))
      .expect(200);

    expect(res.body.items.map((r: { email: string }) => r.email)).toContain("list1@example.com");
    // Projected DTO only — never the raw document.
    expect(res.body.items[0].passwordHash).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$argon2id\$/);
  });

  it("does not list an already-approved recruiter", async () => {
    await pendingRecruiter("already@example.com");
    await Recruiter.updateOne({ email: "already@example.com" }, { $set: { status: "active" } });
    const admin = await signedInAdmin("root5@example.com");

    const res = await request(app)
      .get("/api/v1/admin/recruiters/pending")
      .use(asSession("admin", admin))
      .expect(200);

    expect(res.body.items.map((r: { email: string }) => r.email)).not.toContain(
      "already@example.com",
    );
  });

  it("approves a recruiter and mails them", async () => {
    const access = await pendingRecruiter("appr@example.com");
    const rec = await Recruiter.findOne({ email: "appr@example.com" });
    const admin = await signedInAdmin("root2@example.com");

    await request(app)
      .post(`/api/v1/admin/recruiters/${String(rec!._id)}/approve`)
      .use(asSession("admin", admin))
      .expect(200);

    expect((await Recruiter.findById(rec!._id))?.status).toBe("active");
    expect(outbox.some((m) => m.to === "appr@example.com")).toBe(true);

    // The recruiter's EXISTING session now works on a gated route — proof that
    // requireApproved re-reads the account rather than trusting a token claim.
    const res = await request(app)
      .post("/api/v1/company/register")
      .use(asSession("recruiter", access))
      .send({ name: "Approved Co" });
    expect(res.status).not.toBe(403);
  });

  it("refuses a recruiter token on the admin route", async () => {
    const access = await pendingRecruiter("notadmin@example.com");
    await request(app)
      .get("/api/v1/admin/recruiters/pending")
      .use(asSession("recruiter", access))
      .expect(401);
  });

  it("refuses an anonymous caller on the admin route", async () => {
    await request(app).get("/api/v1/admin/recruiters/pending").expect(401);
  });

  // The cryptographic half of the portal boundary: the admin token is signed
  // with an HKDF key derived from "access:admin", so presenting it at the
  // recruiter mount fails SIGNATURE verification, not merely a claim check.
  it("refuses an admin token presented as a recruiter cookie — signature check", async () => {
    const admin = await signedInAdmin("root3@example.com");
    await request(app)
      .get("/api/v1/recruiter/auth/me")
      .set("Cookie", [`jp_recruiter_at=${admin.access}`])
      .expect(401);
  });

  it("is idempotent — approving an active recruiter is a no-op 200", async () => {
    await pendingRecruiter("idem@example.com");
    const rec = await Recruiter.findOne({ email: "idem@example.com" });
    const admin = await signedInAdmin("root4@example.com");
    const url = `/api/v1/admin/recruiters/${String(rec!._id)}/approve`;

    await request(app).post(url).use(asSession("admin", admin)).expect(200);
    const afterFirst = outbox.filter((m) => m.to === "idem@example.com").length;

    await request(app).post(url).use(asSession("admin", admin)).expect(200);
    expect((await Recruiter.findById(rec!._id))?.status).toBe("active");
    // Guarded update: the second approval matches nothing, so no second mail.
    expect(outbox.filter((m) => m.to === "idem@example.com").length).toBe(afterFirst);
  });

  it("404s an unknown recruiter id", async () => {
    const admin = await signedInAdmin("root6@example.com");
    await request(app)
      .post("/api/v1/admin/recruiters/000000000000000000000000/approve")
      .use(asSession("admin", admin))
      .expect(404);
  });
});
