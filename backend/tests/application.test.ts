import request from "supertest";
import mongoose from "mongoose";
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
import { Job } from "../src/models/job.model.js";
import { Recruiter } from "../src/models/recruiter.model.js";
import { Seeker } from "../src/models/seeker.model.js";
import { setMailer } from "../src/lib/mailer.js";
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

  describe("the owner's application alert (P5)", () => {
    const isAlert = (m: { to: string; subject: string }) =>
      m.to === "r@example.com" && /new applicant/i.test(m.subject);

    it("emails the job's owner when a seeker applies", async () => {
      const res = await apply({ portal: "seeker", session: seeker });
      expect(res.status).toBe(201);

      await vi.waitFor(() => expect(outbox.some(isAlert)).toBe(true));
      const mail = outbox.find(isAlert)!;
      expect(mail.subject).toContain("Dev");
      expect(mail.text).toContain("Dev"); // the job's title
      expect(mail.text).toContain("Signed Up"); // the applicant's name
      expect(mail.text).toContain(`/hire/jobs/${jobId}/applicants`);
    });

    it("sends no alert for an ownerless job", async () => {
      // The Job model requires an owner at birth; real ownerless jobs come
      // from the owner row being deleted afterwards (the catalogue's story),
      // so that is the path reproduced here.
      const ghost = await Recruiter.create({ email: "ghost@r.test", fullName: "Ghost" });
      const orphan = await Job.create({
        title: "Orphan Role",
        description: "d",
        requirements: [],
        salary: 10,
        experienceLevel: 1,
        location: "Remote",
        jobType: "Full-time",
        position: "1",
        company: new mongoose.Types.ObjectId(),
        created_by: ghost._id,
      });
      await Recruiter.deleteOne({ _id: ghost._id });

      const res = await request(app)
        .post(`/api/v1/application/apply/${String(orphan._id)}`)
        .use(asSession("seeker", seeker));
      expect(res.status).toBe(201);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(outbox.some(isAlert)).toBe(false);
    });

    it("sends exactly one alert — the duplicate apply 409s before any mail", async () => {
      await apply({ portal: "seeker", session: seeker });
      await vi.waitFor(() => expect(outbox.some(isAlert)).toBe(true));
      const afterFirst = outbox.filter(isAlert).length;

      const dup = await apply({ portal: "seeker", session: seeker });
      expect(dup.status).toBe(409);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(outbox.filter(isAlert).length).toBe(afterFirst);
    });

    it("never fails the application when the alert mail fails", async () => {
      setMailer({
        async send() {
          throw new Error("brevo down");
        },
      });
      const res = await apply({ portal: "seeker", session: seeker });
      expect(res.status).toBe(201);
      expect(await Application.countDocuments({})).toBe(1);
    });
  });

  describe("the per-job pipeline funnel (P5)", () => {
    it("counts every status across the whole set, past what a page shows", async () => {
      const second = await signedUpOn("seeker", "s2@example.com");
      const third = await signedUpOn("seeker", "s3@example.com");
      await apply({ portal: "seeker", session: seeker });
      await request(app)
        .post(`/api/v1/application/apply/${jobId}`)
        .use(asSession("seeker", second));
      await request(app)
        .post(`/api/v1/application/apply/${jobId}`)
        .use(asSession("seeker", third));

      // Two of the three move on; the funnel must reflect the stages, not
      // whatever slice of the ranked list a page happens to hold.
      await Application.updateOne(
        { applicant: (seeker as { id: string }).id },
        { $set: { status: "shortlisted" } },
      );
      await Application.updateOne(
        { applicant: (second as { id: string }).id },
        { $set: { status: "reviewed" } },
      );

      const res = await request(app)
        .get(`/api/v1/application/${jobId}/applicants?limit=2`)
        .use(asSession("recruiter", recruiter))
        .expect(200);

      expect(res.body.funnel).toMatchObject({ applied: 1, reviewed: 1, shortlisted: 1 });
      // Zero-filled: every stage is present, so the strip renders uniformly.
      expect(res.body.funnel).toHaveProperty("offered", 0);
      expect(res.body.funnel).toHaveProperty("rejected", 0);
      expect(res.body.funnel).toHaveProperty("withdrawn", 0);
      expect(res.body.funnel).toHaveProperty("interview", 0);
    });
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

  describe("the bulk move", () => {
    let ids: Record<string, string>;
    let rivalJobId: string;
    let foreignId: string;

    beforeEach(async () => {
      const actors: Awaited<ReturnType<typeof signedUpOn>>[] = [];
      for (const email of ["b1@example.com", "b2@example.com", "b3@example.com", "b4@example.com"]) {
        const who = await signedUpOn("seeker", email);
        actors.push(who);
        await request(app)
          .post(`/api/v1/application/apply/${jobId}`)
          .use(asSession("seeker", who));
      }

      const list = await request(app)
        .get(`/api/v1/application/${jobId}/applicants?limit=10`)
        .use(asSession("recruiter", recruiter));
      ids = Object.fromEntries(
        list.body.items.map((i: { email: string; applicationId: string }) => [
          i.email,
          i.applicationId,
        ]),
      );

      // A rival's job with one application on it: legal work for the rival,
      // invisible to this recruiter's batch.
      const rivalCompany = await request(app)
        .post("/api/v1/company/register")
        .use(asSession("recruiter", rival))
        .send({ name: "RivalCo" });
      const rivalJob = await request(app)
        .post("/api/v1/job/post")
        .use(asSession("recruiter", rival))
        .send({
          title: "Rival Role",
          description: "Rival work",
          requirements: "ts",
          salary: 10,
          experience: 1,
          location: "Remote",
          jobType: "Full-time",
          position: "1",
          companyId: rivalCompany.body.company.id,
        });
      rivalJobId = rivalJob.body.job.id;
      await request(app)
        .post(`/api/v1/application/apply/${rivalJobId}`)
        .use(asSession("seeker", actors[0]!));
      const rivalList = await request(app)
        .get(`/api/v1/application/${rivalJobId}/applicants`)
        .use(asSession("recruiter", rival));
      foreignId = rivalList.body.items[0].applicationId;
    });

    const bulk = (body: unknown, session = recruiter) =>
      request(app)
        .post(`/api/v1/application/${jobId}/status/bulk`)
        .use(asSession("recruiter", session))
        .send(body);

    it("moves the legal rows and reports the refused ones with reasons", async () => {
      // One row already rejected, one already shortlisted; the other two open.
      await request(app)
        .post(`/api/v1/application/status/${ids["b1@example.com"]}/update`)
        .use(asSession("recruiter", recruiter))
        .send({ status: "rejected" });
      await request(app)
        .post(`/api/v1/application/status/${ids["b2@example.com"]}/update`)
        .use(asSession("recruiter", recruiter))
        .send({ status: "shortlisted" });

      const res = await bulk({
        applicationIds: [
          ids["b1@example.com"],
          ids["b2@example.com"],
          ids["b3@example.com"],
          ids["b4@example.com"],
        ],
        status: "shortlisted",
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: true, moved: 2 });
      expect(res.body.skipped).toEqual([
        { id: ids["b1@example.com"], reason: "TERMINAL" },
        { id: ids["b2@example.com"], reason: "SAME_STATUS" },
      ]);
      // The refused rows are untouched — a skip is a report, never a veto.
      expect((await Application.findById(ids["b1@example.com"]))?.status).toBe("rejected");
      expect((await Application.findById(ids["b2@example.com"]))?.status).toBe("shortlisted");
      // A moved row carries the transition byte-for-byte.
      const moved = await Application.findById(ids["b3@example.com"]);
      expect(moved?.status).toBe("shortlisted");
      expect(moved?.history.at(-1)).toMatchObject({ status: "shortlisted", byPortal: "recruiter" });
    });

    it("writes the same record a single move writes, decidedAt included", async () => {
      const res = await bulk({
        applicationIds: [ids["b1@example.com"], ids["b2@example.com"]],
        status: "rejected",
      });
      expect(res.body.moved).toBe(2);
      for (const email of ["b1@example.com", "b2@example.com"]) {
        const doc = await Application.findById(ids[email]);
        expect(doc?.status).toBe("rejected");
        expect(doc?.decidedAt).toBeInstanceOf(Date);
        expect(doc?.history.at(-1)).toMatchObject({ status: "rejected", byPortal: "recruiter" });
      }
    });

    it("skips a foreign id and an unknown id as NOT_FOUND while the rest move", async () => {
      const unknownId = new mongoose.Types.ObjectId().toHexString();
      const res = await bulk({
        applicationIds: [foreignId, unknownId, ids["b2@example.com"]],
        status: "interview",
      });
      expect(res.status).toBe(200);
      expect(res.body.moved).toBe(1);
      expect(res.body.skipped).toEqual([
        { id: foreignId, reason: "NOT_FOUND" },
        { id: unknownId, reason: "NOT_FOUND" },
      ]);
      // The foreign row is untouched — it was never this batch's to move.
      expect((await Application.findById(foreignId))?.status).toBe("applied");
    });

    it("404s the whole request for a job the caller does not own", async () => {
      const res = await request(app)
        .post(`/api/v1/application/${rivalJobId}/status/bulk`)
        .use(asSession("recruiter", recruiter))
        .send({ applicationIds: [ids["b1@example.com"]], status: "shortlisted" });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("JOB_NOT_FOUND");
    });

    it("bulk reject emails every moved candidate exactly once, and reviewed mails nobody", async () => {
      outbox.length = 0;
      const res = await bulk({
        applicationIds: [ids["b1@example.com"], ids["b2@example.com"]],
        status: "rejected",
      });
      expect(res.body.moved).toBe(2);
      await vi.waitFor(() => {
        for (const email of ["b1@example.com", "b2@example.com"]) {
          expect(outbox.filter((m) => m.to === email)).toHaveLength(1);
        }
      });

      // `reviewed` is deliberately silent, singly and in bulk.
      outbox.length = 0;
      const quiet = await bulk({ applicationIds: [ids["b3@example.com"]], status: "reviewed" });
      expect(quiet.body.moved).toBe(1);
      await new Promise((r) => setTimeout(r, 150));
      expect(outbox.filter((m) => m.to === "b3@example.com")).toHaveLength(0);
    });

    it("answers a duplicated id as a same-status skip, not a second move", async () => {
      const id = ids["b1@example.com"];
      const res = await bulk({ applicationIds: [id, id], status: "shortlisted" });
      expect(res.body).toMatchObject({ moved: 1 });
      expect(res.body.skipped).toEqual([{ id, reason: "SAME_STATUS" }]);
    });

    it("rejects a 101-id batch, an empty one, a malformed id, and operator stages", async () => {
      const many = Array.from({ length: 101 }, () => new mongoose.Types.ObjectId().toHexString());
      expect((await bulk({ applicationIds: many, status: "rejected" })).status).toBe(400);
      expect((await bulk({ applicationIds: [], status: "rejected" })).status).toBe(400);
      expect((await bulk({ applicationIds: ["not-an-id"], status: "rejected" })).status).toBe(400);
      for (const status of ["applied", "withdrawn"]) {
        expect((await bulk({ applicationIds: [ids["b1@example.com"]], status })).status).toBe(400);
      }
    });

    it("anonymous and seeker cannot reach the bulk route", async () => {
      const body = { applicationIds: [ids["b1@example.com"]], status: "shortlisted" };
      expect(
        (await request(app).post(`/api/v1/application/${jobId}/status/bulk`).send(body)).status,
      ).toBe(401);
      expect(
        (
          await request(app)
            .post(`/api/v1/application/${jobId}/status/bulk`)
            .use(asSession("seeker", seeker))
            .send(body)
        ).status,
      ).toBe(401);
    });
  });
});
