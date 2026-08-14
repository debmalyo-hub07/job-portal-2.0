import request from "supertest";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Never opens a socket to Cloudinary: the suite runs offline and with fake
// credentials. `private_download_url` is echoed back with a marker so the tests
// can tell a signed link from a bare storage key.
vi.mock("../../src/utils/cloudinary.js", () => ({
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

import { buildApp } from "../../src/app.js";
import { asSession, signedUpOn, installCaptureMailer } from "./helpers.js";
import { Seeker } from "../../src/models/seeker.model.js";
import { Company } from "../../src/models/company.model.js";
import { Job } from "../../src/models/job.model.js";
import { Application } from "../../src/models/application.model.js";

const app = buildApp();
beforeEach(installCaptureMailer);

describe("updateProfile on the account collections", () => {
  it("writes to the account, not to users, and returns a SessionUser", async () => {
    const seeker = await signedUpOn("seeker", "edit@x.test");
    const res = await request(app)
      .post("/api/v1/user/profile/update")
      .use(asSession("seeker", seeker))
      .field("fullname", "Edited Name")
      .field("skills", "ts, node,, mongo");     // note the empty entry

    expect(res.status).toBe(200);
    // Explicit DTO all the way down: SessionUser inside, no hash anywhere.
    expect(Object.keys(res.body.profile.user).sort())
      .toEqual(["avatarUrl", "email", "emailVerified", "fullName", "id", "portal", "status"]);
    expect(res.body.profile.recruiter).toBeNull();
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$argon2id\$/);

    const account = await Seeker.findById(seeker.id);
    expect(account!.fullName).toBe("Edited Name");
    expect(account!.profile!.skills).toEqual(["ts", "node", "mongo"]);   // trimmed, no blanks
  });

  it("GET /profile returns what the profile page renders", async () => {
    const seeker = await signedUpOn("seeker", "read@x.test");
    await request(app)
      .post("/api/v1/user/profile/update")
      .use(asSession("seeker", seeker))
      .field("bio", "hello").field("skills", "ts").field("phoneNumber", "+919876543210");

    const res = await request(app)
      .get("/api/v1/user/profile")
      .use(asSession("seeker", seeker));
    expect(res.status).toBe(200);
    expect(res.body.profile).toMatchObject({
      phone: "+919876543210",
      seeker: { bio: "hello", skills: ["ts"], resumeUrl: null },
    });
  });

  it("GET /profile 401s anonymously", async () => {
    expect((await request(app).get("/api/v1/user/profile")).status).toBe(401);
  });

  /**
   * All five fields `toFitSeekerInput` reads, not the three this test used to
   * cover while calling itself "the fit fields".
   *
   * `experienceYears` and `location` were on the model, in `ProfileView` and in
   * the pipeline from 4A.3, and missing from `profileUpdateBodySchema` — so no
   * request could set either and both scored as no-penalty unknowns for every
   * seeker. This test passed throughout, because its name claimed a completeness
   * its body did not have.
   */
  it("persists the fit fields and returns them on the profile view", async () => {
    const seeker = await signedUpOn("seeker", "fit@x.test");
    const res = await request(app)
      .post("/api/v1/user/profile/update")
      .use(asSession("seeker", seeker))
      .field("salaryMin", "80000")
      .field("salaryMax", "120000")
      .field("openToRemote", "true")
      .field("experienceYears", "6")
      .field("location", "Kolkata");

    expect(res.status).toBe(200);
    expect(res.body.profile.seeker).toMatchObject({
      salaryMin: 80000,
      salaryMax: 120000,
      openToRemote: true,
      experienceYears: 6,
      location: "Kolkata",
    });

    // The fields survive a fresh read, so the fit pipeline can read them.
    const account = await Seeker.findById(seeker.id);
    expect(account!.profile!.salaryMin).toBe(80000);
    expect(account!.profile!.salaryMax).toBe(120000);
    expect(account!.profile!.openToRemote).toBe(true);
    expect(account!.profile!.experienceYears).toBe(6);
    expect(account!.profile!.location).toBe("Kolkata");
  });

  /**
   * The model caps experience at 60. Without the schema bound this reaches
   * Mongoose validation and answers 500 for what is plainly a bad request.
   */
  it("rejects an out-of-range experienceYears with 400", async () => {
    const seeker = await signedUpOn("seeker", "range@x.test");
    const res = await request(app)
      .post("/api/v1/user/profile/update")
      .use(asSession("seeker", seeker))
      .field("experienceYears", "600");

    expect(res.status).toBe(400);
  });

  /**
   * A blank numeric field clears the stored value instead of writing a zero.
   *
   * `z.coerce.number()` reads `""` as `0`, so before `clearableInt` a seeker who
   * emptied their salary boxes stored `salaryMin: 0, salaryMax: 0` — a band no
   * real salary falls inside, which scores `salaryFit` at 0 for every job on the
   * board. The distinction that has to survive the round trip is blank → `null`,
   * absent → untouched.
   */
  it("clears a fit field when its form value is blank, and leaves absent ones alone", async () => {
    const seeker = await signedUpOn("seeker", "clear@x.test");
    await request(app)
      .post("/api/v1/user/profile/update")
      .use(asSession("seeker", seeker))
      .field("salaryMin", "8")
      .field("salaryMax", "20")
      .field("experienceYears", "6")
      .field("openToRemote", "true");

    const res = await request(app)
      .post("/api/v1/user/profile/update")
      .use(asSession("seeker", seeker))
      .field("salaryMin", "")
      .field("salaryMax", "")
      .field("openToRemote", "");
    // experienceYears is not in this request at all.

    expect(res.status).toBe(200);
    expect(res.body.profile.seeker).toMatchObject({
      salaryMin: null,
      salaryMax: null,
      openToRemote: null,
      experienceYears: 6,
    });

    const account = await Seeker.findById(seeker.id);
    // Not 0: a zero band is an active constraint no salary can satisfy, and
    // `toFitSeekerInput` would pass it straight to `salaryFit`.
    expect(account!.profile!.salaryMin).toBeNull();
    expect(account!.profile!.salaryMax).toBeNull();
    // Not false: `remoteFit` no-penalties an unknown and scores an explicit
    // `false` at 0 against a remote role, so the two are not interchangeable.
    expect(account!.profile!.openToRemote).toBeNull();
    expect(account!.profile!.experienceYears).toBe(6);
  });

  it("rejects an attempt to change the email", async () => {
    const seeker = await signedUpOn("seeker", "keep@x.test");
    const res = await request(app)
      .post("/api/v1/user/profile/update")
      .use(asSession("seeker", seeker))
      .field("email", "attacker@x.test");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    // Rejected and not honoured: the takeover path stays shut. If a real
    // email-change flow is added, it needs its own verification contract.
    const account = await Seeker.findById(seeker.id);
    expect(account!.email).toBe("keep@x.test");
  });

  it("succeeds with no file attached", async () => {
    // The inherited controller threw a TypeError here and answered 500.
    const seeker = await signedUpOn("seeker", "nofile@x.test");
    const res = await request(app)
      .post("/api/v1/user/profile/update")
      .use(asSession("seeker", seeker))
      .field("bio", "no resume today");
    expect(res.status).toBe(200);
    const account = await Seeker.findById(seeker.id);
    expect(account!.profile!.bio).toBe("no resume today");
    expect(account!.resume!.storageKey).toBeNull();
  });

  it("works for an account registered on the new endpoints", async () => {
    // Was phrased as "never had a users row" while the legacy collection still
    // existed. The collection is gone, so every account is this case now — the
    // test stays because it is the plain happy path for a fresh registration.
    const seeker = await signedUpOn("seeker", "brandnew@x.test");
    const res = await request(app)
      .post("/api/v1/user/profile/update")
      .use(asSession("seeker", seeker))
      .field("fullname", "Brand New");
    expect(res.status).toBe(200);
  });

  it("stores the public_id and returns a signed resume URL, never the bare key", async () => {
    const seeker = await signedUpOn("seeker", "resume@x.test");
    const res = await request(app)
      .post("/api/v1/user/profile/update")
      .use(asSession("seeker", seeker))
      .attach("file", Buffer.from("%PDF-1.4 fake"), {
        filename: "cv.pdf",
        contentType: "application/pdf",
      })
      .field("bio", "hello");

    expect(res.status).toBe(200);
    expect(res.body.profile.seeker.resumeUrl).toContain("sig=");
    expect(res.body.profile.seeker.resumeName).toBe("cv.pdf");

    // What is persisted is the Cloudinary public_id, not a URL. Storing a URL is
    // what made the old resume links permanent.
    const account = await Seeker.findById(seeker.id);
    expect(account!.resume!.storageKey).toBe("resumes/abc123");
  });

  it("rejects a non-PDF resume with 400 UNSUPPORTED_FILE_TYPE", async () => {
    const seeker = await signedUpOn("seeker", "gif@x.test");
    const res = await request(app)
      .post("/api/v1/user/profile/update")
      .use(asSession("seeker", seeker))
      .attach("file", Buffer.from("GIF89a"), { filename: "cv.gif", contentType: "image/gif" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("UNSUPPORTED_FILE_TYPE");
  });

  it("rejects a PDF MIME claim when the bytes are not a PDF", async () => {
    const seeker = await signedUpOn("seeker", "spoofed-pdf@x.test");
    const res = await request(app)
      .post("/api/v1/user/profile/update")
      .use(asSession("seeker", seeker))
      .attach("file", Buffer.from("<html>not a pdf</html>"), {
        filename: "cv.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("UNSUPPORTED_FILE_TYPE");
  });

  it("rejects an operator-shaped profile body with 400", async () => {
    const seeker = await signedUpOn("seeker", "operator@x.test");
    const res = await request(app)
      .post("/api/v1/user/profile/update")
      .use(asSession("seeker", seeker))
      .send({ fullname: { $gt: "" } });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });
});

describe("populate after the ref change", () => {
  it("resolves an applicant created on the new endpoints", async () => {
    const seeker = await signedUpOn("seeker", "applicant@x.test", { fullName: "Applicant Name" });
    const recruiter = await signedUpOn("recruiter", "hiring@x.test");
    const company = await Company.create({ name: "Acme", userId: recruiter.id });
    const job = await Job.create({
      title: "Dev", description: "d", salary: 1, experienceLevel: 1, location: "Remote",
      jobType: "full-time", position: 1, company: company._id, created_by: recruiter.id,
    });
    await Application.create({ job: job._id, applicant: seeker.id });

    const res = await request(app)
      .get(`/api/v1/application/${job._id}/applicants`)
      .set("Cookie", [`jp_recruiter_at=${recruiter.access}`]);

    expect(res.status).toBe(200);
    // Before the ref change this was null — the seeker has no `users` row.
    // The applicant now arrives flattened into the DTO rather than as a
    // populated subdocument, but resolving the ref is still what is under test.
    expect(res.body.items[0].fullName).toBe("Applicant Name");
    // And the hash is gone from a response that used to carry it.
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$argon2id\$|\$2[aby]\$/);
  });
});
