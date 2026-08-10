import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Offline, like every other suite that touches uploads. The signed-URL stub
// carries a marker so the applicant DTO assertion can prove the recruiter gets
// a minted link rather than the stored key.
vi.mock("../src/utils/cloudinary.js", () => ({
  getCloudinary: () => ({
    uploader: {
      upload: vi.fn(async () => ({
        public_id: "resumes/abc123",
        secure_url: "https://res.cloudinary.com/test/raw/authenticated/resumes/abc123",
      })),
    },
    utils: {
      private_download_url: vi.fn(
        (publicId: string) => `https://res.cloudinary.com/signed/${publicId}?sig=stub`,
      ),
    },
  }),
}));

import { buildApp } from "../src/app.js";
import { Application } from "../src/models/application.model.js";
import { installCaptureMailer, signedUpOn } from "./auth/helpers.js";

const app = buildApp();

describe("application routes", () => {
  let recruiter: { access: string };
  let rival: { access: string };
  let seeker: { access: string };
  let jobId: string;

  beforeEach(async () => {
    installCaptureMailer();
    // The unique {job, applicant} index backs the duplicate-apply 409; without
    // an explicit init the autoIndex build races the first duplicate insert.
    await Application.init();

    recruiter = await signedUpOn("recruiter", "r@example.com");
    rival = await signedUpOn("recruiter", "rival@example.com");
    seeker = await signedUpOn("seeker", "s@example.com");

    const company = await request(app)
      .post("/api/v1/company/register")
      .set("Cookie", [`jp_recruiter_at=${recruiter.access}`])
      .send({ name: "Acme" });
    const job = await request(app)
      .post("/api/v1/job/post")
      .set("Cookie", [`jp_recruiter_at=${recruiter.access}`])
      .send({
        title: "Dev",
        description: "Build",
        requirements: "ts",
        salary: 10,
        experience: 1,
        location: "Remote",
        jobType: "Full-time",
        position: "1",
        companyId: company.body.company.id,
      });
    jobId = job.body.job.id;
  });

  const apply = (cookies: string[]) =>
    request(app).post(`/api/v1/application/apply/${jobId}`).set("Cookie", cookies);

  it("GET /apply/:id no longer exists — applying is not a GET", async () => {
    const res = await request(app)
      .get(`/api/v1/application/apply/${jobId}`)
      .set("Cookie", [`jp_seeker_at=${seeker.access}`]);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(await Application.countDocuments({})).toBe(0);
  });

  it("POST apply matrix: anonymous 401, recruiter 401, seeker 201", async () => {
    expect((await apply([])).status).toBe(401);
    expect((await apply([`jp_recruiter_at=${recruiter.access}`])).status).toBe(401);
    expect((await apply([`jp_seeker_at=${seeker.access}`])).status).toBe(201);
  });

  it("404s an application to a job that does not exist", async () => {
    const res = await request(app)
      .post("/api/v1/application/apply/64b0c8f2a9d3e45f6a7b8c9d")
      .set("Cookie", [`jp_seeker_at=${seeker.access}`]);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("JOB_NOT_FOUND");
  });

  it("400s a malformed job id", async () => {
    const res = await request(app)
      .post("/api/v1/application/apply/not-an-id")
      .set("Cookie", [`jp_seeker_at=${seeker.access}`]);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("duplicate apply → 409, including under a parallel race", async () => {
    const results = await Promise.all([
      apply([`jp_seeker_at=${seeker.access}`]),
      apply([`jp_seeker_at=${seeker.access}`]),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await Application.countDocuments({})).toBe(1);

    const third = await apply([`jp_seeker_at=${seeker.access}`]);
    expect(third.status).toBe(409);
    expect(third.body.code).toBe("ALREADY_APPLIED");
  });

  it("seeker's applied list is an enveloped DTO", async () => {
    await apply([`jp_seeker_at=${seeker.access}`]);
    const res = await request(app)
      .get("/api/v1/application/get")
      .set("Cookie", [`jp_seeker_at=${seeker.access}`]);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 1, page: 1, pages: 1 });
    expect(res.body.items[0]).toMatchObject({ status: "pending" });
    expect(res.body.items[0].job.title).toBe("Dev");
    expect(res.body.items[0]._id).toBeUndefined();
    expect(res.body.items[0].applicant).toBeUndefined();
  });

  describe("applicants + status, ownership matrix", () => {
    let applicationId: string;

    beforeEach(async () => {
      await apply([`jp_seeker_at=${seeker.access}`]);
      const list = await request(app)
        .get(`/api/v1/application/${jobId}/applicants`)
        .set("Cookie", [`jp_recruiter_at=${recruiter.access}`]);
      applicationId = list.body.items[0].applicationId;
    });

    it("owner sees exactly the ApplicantDto keys and nothing more", async () => {
      const res = await request(app)
        .get(`/api/v1/application/${jobId}/applicants`)
        .set("Cookie", [`jp_recruiter_at=${recruiter.access}`]);
      expect(res.status).toBe(200);
      const applicant = res.body.items[0];
      expect(applicant).toMatchObject({
        fullName: "Signed Up",
        email: "s@example.com",
        status: "pending",
      });
      // An exact allowlist, so any future widening of the DTO fails here rather
      // than silently shipping more of a seeker's record to a recruiter.
      expect(Object.keys(applicant).sort()).toEqual(
        [
          "appliedAt",
          "applicationId",
          "email",
          "fullName",
          "headline",
          "phone",
          "resumeName",
          "resumeUrl",
          "skills",
          "status",
        ].sort(),
      );
    });

    it("hands the recruiter a signed resume link, not the stored key", async () => {
      await request(app)
        .post("/api/v1/user/profile/update")
        .set("Cookie", [`jp_seeker_at=${seeker.access}`])
        .attach("file", Buffer.from("%PDF-1.4 fake"), {
          filename: "cv.pdf",
          contentType: "application/pdf",
        });

      const res = await request(app)
        .get(`/api/v1/application/${jobId}/applicants`)
        .set("Cookie", [`jp_recruiter_at=${recruiter.access}`]);
      expect(res.body.items[0].resumeUrl).toContain("sig=");
      expect(res.body.items[0].resumeUrl).not.toBe("resumes/abc123");
      expect(res.body.items[0].resumeName).toBe("cv.pdf");
    });

    it("unrelated recruiter → 404 on applicants and on status update", async () => {
      const list = await request(app)
        .get(`/api/v1/application/${jobId}/applicants`)
        .set("Cookie", [`jp_recruiter_at=${rival.access}`]);
      expect(list.status).toBe(404);
      expect(list.body.code).toBe("JOB_NOT_FOUND");

      const upd = await request(app)
        .post(`/api/v1/application/status/${applicationId}/update`)
        .set("Cookie", [`jp_recruiter_at=${rival.access}`])
        .send({ status: "accepted" });
      expect(upd.status).toBe(404);
      // Same code and message a missing application would produce: a foreign
      // application must not be distinguishable from one that does not exist.
      expect(upd.body.code).toBe("APPLICATION_NOT_FOUND");
    });

    it("owner updates status; operator-shaped status is a 400, not a 500", async () => {
      const bad = await request(app)
        .post(`/api/v1/application/status/${applicationId}/update`)
        .set("Cookie", [`jp_recruiter_at=${recruiter.access}`])
        .send({ status: { $gt: "" } });
      expect(bad.status).toBe(400);
      expect(bad.body.code).toBe("VALIDATION_ERROR");

      const pending = await request(app)
        .post(`/api/v1/application/status/${applicationId}/update`)
        .set("Cookie", [`jp_recruiter_at=${recruiter.access}`])
        .send({ status: "pending" });
      expect(pending.status).toBe(400);

      const ok = await request(app)
        .post(`/api/v1/application/status/${applicationId}/update`)
        .set("Cookie", [`jp_recruiter_at=${recruiter.access}`])
        .send({ status: "accepted" });
      expect(ok.status).toBe(200);

      const list = await request(app)
        .get(`/api/v1/application/${jobId}/applicants`)
        .set("Cookie", [`jp_recruiter_at=${recruiter.access}`]);
      expect(list.body.items[0].status).toBe("accepted");
    });

    it("anonymous and seeker cannot reach recruiter application routes", async () => {
      expect((await request(app).get(`/api/v1/application/${jobId}/applicants`)).status).toBe(401);
      expect(
        (
          await request(app)
            .get(`/api/v1/application/${jobId}/applicants`)
            .set("Cookie", [`jp_seeker_at=${seeker.access}`])
        ).status,
      ).toBe(401);
      expect(
        (
          await request(app)
            .post(`/api/v1/application/status/${applicationId}/update`)
            .set("Cookie", [`jp_seeker_at=${seeker.access}`])
            .send({ status: "accepted" })
        ).status,
      ).toBe(401);
    });
  });
});
