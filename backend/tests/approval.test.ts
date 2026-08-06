import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { Recruiter } from "../src/models/recruiter.model.js";
import { installCaptureMailer, lastCodeFor, cookieValue } from "./auth/helpers.js";

const app = buildApp();
const PASSWORD = "correct horse battery staple";

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
      .set("Cookie", [`jp_recruiter_at=${access}`])
      .send({ name: "Acme" })
      .expect(403);
    expect(res.body.code).toBe("RECRUITER_PENDING_APPROVAL");
  });

  it("refuses job creation", async () => {
    const access = await pendingRecruiter("p2@example.com");
    await request(app)
      .post("/api/v1/job/post")
      .set("Cookie", [`jp_recruiter_at=${access}`])
      .send({ title: "Dev" })
      .expect(403);
  });

  it("refuses reading applicants", async () => {
    const access = await pendingRecruiter("p4@example.com");
    await request(app)
      .get("/api/v1/application/000000000000000000000000/applicants")
      .set("Cookie", [`jp_recruiter_at=${access}`])
      .expect(403);
  });

  it("refuses updating an application's status", async () => {
    const access = await pendingRecruiter("p5@example.com");
    await request(app)
      .post("/api/v1/application/status/000000000000000000000000/update")
      .set("Cookie", [`jp_recruiter_at=${access}`])
      .send({ status: "shortlisted" })
      .expect(403);
  });

  it("allows the same call once approved", async () => {
    const access = await pendingRecruiter("p3@example.com");
    await Recruiter.updateOne({ email: "p3@example.com" }, { $set: { status: "active" } });
    const res = await request(app)
      .post("/api/v1/company/register")
      .set("Cookie", [`jp_recruiter_at=${access}`])
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
      .set("Cookie", [`jp_recruiter_at=${access}`])
      .expect(200);
    await request(app)
      .get("/api/v1/job/getadminjobs")
      .set("Cookie", [`jp_recruiter_at=${access}`])
      .expect(200);
  });
});
