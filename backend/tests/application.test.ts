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
import { Seeker } from "../src/models/seeker.model.js";
import { asSession, installCaptureMailer, outbox, signedUpOn } from "./auth/helpers.js";

const app = buildApp();

describe("application routes", () => {
  let recruiter: Awaited<ReturnType<typeof signedUpOn>>;
  let rival: Awaited<ReturnType<typeof signedUpOn>>;
  let seeker: Awaited<ReturnType<typeof signedUpOn>>;
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
      .use(asSession("recruiter", recruiter))
      .send({ name: "Acme" });
    const job = await request(app)
      .post("/api/v1/job/post")
      .use(asSession("recruiter", recruiter))
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

  const apply = (
    actor?: {
      portal: "seeker" | "recruiter";
      session: Awaited<ReturnType<typeof signedUpOn>>;
    },
  ) => {
    const call = request(app).post(`/api/v1/application/apply/${jobId}`);
    if (actor) call.use(asSession(actor.portal, actor.session));
    return call;
  };

  it("GET /apply/:id no longer exists — applying is not a GET", async () => {
    const res = await request(app)
      .get(`/api/v1/application/apply/${jobId}`)
      .use(asSession("seeker", seeker));
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(await Application.countDocuments({})).toBe(0);
  });

  it("POST apply matrix: anonymous 401, recruiter 401, seeker 201", async () => {
    expect((await apply()).status).toBe(401);
    expect((await apply({ portal: "recruiter", session: recruiter })).status).toBe(401);
    expect((await apply({ portal: "seeker", session: seeker })).status).toBe(201);
  });

  it("404s an application to a job that does not exist", async () => {
    const res = await request(app)
      .post("/api/v1/application/apply/64b0c8f2a9d3e45f6a7b8c9d")
      .use(asSession("seeker", seeker));
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("JOB_NOT_FOUND");
  });

  it("400s a malformed job id", async () => {
    const res = await request(app)
      .post("/api/v1/application/apply/not-an-id")
      .use(asSession("seeker", seeker));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("duplicate apply → 409, including under a parallel race", async () => {
    const results = await Promise.all([
      apply({ portal: "seeker", session: seeker }),
      apply({ portal: "seeker", session: seeker }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await Application.countDocuments({})).toBe(1);

    const third = await apply({ portal: "seeker", session: seeker });
    expect(third.status).toBe(409);
    expect(third.body.code).toBe("ALREADY_APPLIED");
  });

  it("seeker's applied list is an enveloped DTO", async () => {
    await apply({ portal: "seeker", session: seeker });
    const res = await request(app)
      .get("/api/v1/application/get")
      .use(asSession("seeker", seeker));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 1, page: 1, pages: 1 });
    // `applied`, not `pending`: the creation default is the pipeline's first
    // stage now that the model stores the full seven.
    expect(res.body.items[0]).toMatchObject({ status: "applied" });
    // A fresh application already carries one history entry, so the timeline
    // starts where the candidate actually entered it.
    expect(res.body.items[0].history).toEqual([
      { status: "applied", at: expect.any(String), byPortal: "seeker" },
    ]);
    expect(res.body.items[0].job.title).toBe("Dev");
    expect(res.body.items[0]._id).toBeUndefined();
    expect(res.body.items[0].applicant).toBeUndefined();
  });

  describe("applicants + status, ownership matrix", () => {
    let applicationId: string;

    beforeEach(async () => {
      await apply({ portal: "seeker", session: seeker });
      const list = await request(app)
        .get(`/api/v1/application/${jobId}/applicants`)
        .use(asSession("recruiter", recruiter));
      applicationId = list.body.items[0].applicationId;
    });

    it("owner sees exactly the ApplicantDto keys and nothing more", async () => {
      const res = await request(app)
        .get(`/api/v1/application/${jobId}/applicants`)
        .use(asSession("recruiter", recruiter));
      expect(res.status).toBe(200);
      const applicant = res.body.items[0];
      expect(applicant).toMatchObject({
        fullName: "Signed Up",
        email: "s@example.com",
        status: "applied",
      });
      // An exact allowlist, so any future widening of the DTO fails here rather
      // than silently shipping more of a seeker's record to a recruiter.
      expect(Object.keys(applicant).sort()).toEqual(
        [
          "appliedAt",
          "applicationId",
          "email",
          "fit",
          "fullName",
          "headline",
          "phone",
          "resumeName",
          "resumeUrl",
          "skills",
          "status",
        ].sort(),
      );
      expect(applicant.fit).toMatchObject({
        score: expect.any(Number),
        factors: expect.arrayContaining([
          expect.objectContaining({ key: "skills", reason: expect.any(String) }),
        ]),
      });
      expect(applicant.fit.factors.map((factor: { reason: string }) => factor.reason).join(" "))
        .not.toMatch(/\byou(r|'re)?\b/i);
    });

    it("ranks the complete applicant set before slicing it into pages", async () => {
      const high = await signedUpOn("seeker", "high-fit@example.com");
      const low = await signedUpOn("seeker", "low-fit@example.com");

      await Seeker.findByIdAndUpdate(high.id, {
        $set: {
          "profile.skills": ["ts"],
          "profile.salaryMin": 8,
          "profile.salaryMax": 12,
          "profile.experienceYears": 3,
          "profile.location": "Remote",
          "profile.openToRemote": true,
        },
      });
      await Seeker.findByIdAndUpdate(low.id, {
        $set: {
          "profile.skills": [],
          "profile.salaryMin": 40,
          "profile.salaryMax": 50,
          "profile.experienceYears": 0,
          "profile.location": "Mumbai",
          "profile.openToRemote": false,
        },
      });

      // Applied in this order on purpose: the weakest applicant is newest. A
      // service that paginates by createdAt and sorts only the page would put
      // them on page 1 and could never recover the true global order.
      expect((await apply({ portal: "seeker", session: high })).status).toBe(201);
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect((await apply({ portal: "seeker", session: low })).status).toBe(201);

      const pages = await Promise.all(
        [1, 2, 3].map((page) =>
          request(app)
            .get(`/api/v1/application/${jobId}/applicants?page=${page}&limit=1`)
            .use(asSession("recruiter", recruiter)),
        ),
      );

      expect(pages.every((res) => res.status === 200)).toBe(true);
      const [first, second, third] = pages;
      expect(first).toBeDefined();
      expect(second).toBeDefined();
      expect(third).toBeDefined();
      const ranked = [first!, second!, third!];
      expect(first!.body).toMatchObject({ total: 3, page: 1, pages: 3 });
      expect(first!.body.items[0].email).toBe("high-fit@example.com");
      const scores = ranked.map((res) => res.body.items[0].fit.score as number);
      expect(scores).toEqual([...scores].sort((a, b) => b - a));
    });

    it("hands the recruiter a signed resume link, not the stored key", async () => {
      await request(app)
        .post("/api/v1/user/profile/update")
        .use(asSession("seeker", seeker))
        .attach("file", Buffer.from("%PDF-1.4 fake"), {
          filename: "cv.pdf",
          contentType: "application/pdf",
        });

      const res = await request(app)
        .get(`/api/v1/application/${jobId}/applicants`)
        .use(asSession("recruiter", recruiter));
      expect(res.body.items[0].resumeUrl).toContain("sig=");
      expect(res.body.items[0].resumeUrl).not.toBe("resumes/abc123");
      expect(res.body.items[0].resumeName).toBe("cv.pdf");
    });

    it("unrelated recruiter → 404 on applicants and on status update", async () => {
      const list = await request(app)
        .get(`/api/v1/application/${jobId}/applicants`)
        .use(asSession("recruiter", rival));
      expect(list.status).toBe(404);
      expect(list.body.code).toBe("JOB_NOT_FOUND");

      const upd = await request(app)
        .post(`/api/v1/application/status/${applicationId}/update`)
        .use(asSession("recruiter", rival))
        .send({ status: "shortlisted" });
      expect(upd.status).toBe(404);
      // Same code and message a missing application would produce: a foreign
      // application must not be distinguishable from one that does not exist.
      expect(upd.body.code).toBe("APPLICATION_NOT_FOUND");
    });

    it("owner updates status; operator-shaped status is a 400, not a 500", async () => {
      const bad = await request(app)
        .post(`/api/v1/application/status/${applicationId}/update`)
        .use(asSession("recruiter", recruiter))
        .send({ status: { $gt: "" } });
      expect(bad.status).toBe(400);
      expect(bad.body.code).toBe("VALIDATION_ERROR");

      // `applied` is the creation default, not a decision, so a recruiter naming
      // it is refused at the schema — as is `withdrawn`, which is the
      // candidate's transition alone.
      for (const status of ["applied", "withdrawn"]) {
        const res = await request(app)
          .post(`/api/v1/application/status/${applicationId}/update`)
          .use(asSession("recruiter", recruiter))
          .send({ status });
        expect(res.status).toBe(400);
      }

      const ok = await request(app)
        .post(`/api/v1/application/status/${applicationId}/update`)
        .use(asSession("recruiter", recruiter))
        .send({ status: "shortlisted" });
      expect(ok.status).toBe(200);

      const list = await request(app)
        .get(`/api/v1/application/${jobId}/applicants`)
        .use(asSession("recruiter", recruiter));
      expect(list.body.items[0].status).toBe("shortlisted");
    });

    /**
     * The pipeline end to end: enforcement, the history it records, the mail it
     * sends, and the candidate's own exit.
     */
    describe("status pipeline", () => {
      const setStatus = (status: string, session = recruiter) =>
        request(app)
          .post(`/api/v1/application/status/${applicationId}/update`)
          .use(asSession("recruiter", session))
          .send({ status });

      const withdrawAs = (session: typeof seeker, id = applicationId) =>
        request(app)
          .post(`/api/v1/application/${id}/withdraw`)
          .use(asSession("seeker", session));

      const mailTo = (to: string) =>
        vi.waitFor(() => {
          const mail = [...outbox].reverse().find((m) => m.to === to);
          if (!mail) throw new Error(`no mail to ${to} yet`);
          return mail;
        });

      it("records every transition in order, oldest first", async () => {
        expect((await setStatus("reviewed")).status).toBe(200);
        expect((await setStatus("shortlisted")).status).toBe(200);

        const list = await request(app)
          .get("/api/v1/application/get")
          .use(asSession("seeker", seeker));
        expect(list.body.items[0].status).toBe("shortlisted");
        expect(list.body.items[0].history.map((e: { status: string }) => e.status)).toEqual([
          "applied",
          "reviewed",
          "shortlisted",
        ]);
        expect(list.body.items[0].history.map((e: { byPortal: string }) => e.byPortal)).toEqual([
          "seeker",
          "recruiter",
          "recruiter",
        ]);
      });

      it("allows a backward correction among active stages", async () => {
        expect((await setStatus("interview")).status).toBe(200);
        // The mis-click fix. A strict forward-only machine would make this
        // permanent and hand the mistake to support.
        expect((await setStatus("shortlisted")).status).toBe(200);
      });

      it("409s a repeated status instead of silently re-applying it", async () => {
        expect((await setStatus("shortlisted")).status).toBe(200);
        const again = await setStatus("shortlisted");
        expect(again.status).toBe(409);
        expect(again.body.code).toBe("STATUS_UNCHANGED");
      });

      it("locks the application once rejected", async () => {
        expect((await setStatus("rejected")).status).toBe(200);
        const reopen = await setStatus("shortlisted");
        expect(reopen.status).toBe(409);
        expect(reopen.body.code).toBe("APPLICATION_CLOSED");
      });

      it("emails the candidate on a forward stage but not on `reviewed`", async () => {
        outbox.length = 0;
        expect((await setStatus("reviewed")).status).toBe(200);
        expect((await setStatus("shortlisted")).status).toBe(200);

        const mail = await mailTo("s@example.com");
        expect(mail.subject).toContain("shortlisted");
        // Exactly one — `reviewed` is deliberately silent, so two sends here
        // would mean the policy had drifted.
        expect(outbox.filter((m) => m.to === "s@example.com")).toHaveLength(1);
      });

      it("does not email a backward correction", async () => {
        expect((await setStatus("interview")).status).toBe(200);
        outbox.length = 0;
        expect((await setStatus("shortlisted")).status).toBe(200);
        // Give a dispatched send the same chance to land as the positive case.
        await new Promise((r) => setTimeout(r, 150));
        expect(outbox.filter((m) => m.to === "s@example.com")).toHaveLength(0);
      });

      it("lets the candidate withdraw, closes the application and tells the recruiter", async () => {
        outbox.length = 0;
        const res = await withdrawAs(seeker);
        expect(res.status).toBe(200);

        const list = await request(app)
          .get("/api/v1/application/get")
          .use(asSession("seeker", seeker));
        expect(list.body.items[0].status).toBe("withdrawn");

        const mail = await mailTo("r@example.com");
        expect(mail.subject).toContain("withdrew");
      });

      it("refuses a withdrawal the recruiter may not perform, and a foreign one", async () => {
        // `withdrawn` is not in the recruiter's settable set, so the schema stops
        // it before the service sees it.
        expect((await setStatus("withdrawn")).status).toBe(400);

        // Another seeker's application answers as missing, not as forbidden —
        // the same rule every other ownership check here follows.
        const stranger = await signedUpOn("seeker", "stranger@example.com");
        expect((await withdrawAs(stranger)).status).toBe(404);
      });

      it("cannot withdraw twice", async () => {
        expect((await withdrawAs(seeker)).status).toBe(200);
        const again = await withdrawAs(seeker);
        expect(again.status).toBe(409);
        expect(again.body.code).toBe("APPLICATION_CLOSED");
      });

      it("refuses a recruiter's decision after the candidate withdrew", async () => {
        expect((await withdrawAs(seeker)).status).toBe(200);
        const override = await setStatus("shortlisted");
        expect(override.status).toBe(409);
        expect(override.body.code).toBe("APPLICATION_CLOSED");
      });
    });

    it("anonymous and seeker cannot reach recruiter application routes", async () => {
      expect((await request(app).get(`/api/v1/application/${jobId}/applicants`)).status).toBe(401);
      expect(
        (
          await request(app)
            .get(`/api/v1/application/${jobId}/applicants`)
            .use(asSession("seeker", seeker))
        ).status,
      ).toBe(401);
      expect(
        (
          await request(app)
            .post(`/api/v1/application/status/${applicationId}/update`)
            .use(asSession("seeker", seeker))
            .send({ status: "shortlisted" })
        ).status,
      ).toBe(401);
    });
  });
});
