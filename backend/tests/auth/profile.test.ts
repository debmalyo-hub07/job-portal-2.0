import request from "supertest";
import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "../../src/app.js";
import { signedUpOn, installCaptureMailer } from "./helpers.js";
import { Seeker } from "../../src/models/seeker.model.js";
import { User } from "../../src/models/user.model.js";
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
      .set("Cookie", [`jp_seeker_at=${seeker.access}`])
      .field("fullname", "Edited Name")
      .field("skills", "ts, node,, mongo");     // note the empty entry

    expect(res.status).toBe(200);
    // Explicit DTO all the way down: SessionUser inside, no hash anywhere.
    expect(Object.keys(res.body.profile.user).sort())
      .toEqual(["avatarUrl", "email", "emailVerified", "fullName", "id", "portal"]);
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
      .set("Cookie", [`jp_seeker_at=${seeker.access}`])
      .field("bio", "hello").field("skills", "ts").field("phoneNumber", "+919876543210");

    const res = await request(app)
      .get("/api/v1/user/profile")
      .set("Cookie", [`jp_seeker_at=${seeker.access}`]);
    expect(res.status).toBe(200);
    expect(res.body.profile).toMatchObject({
      phone: "+919876543210",
      seeker: { bio: "hello", skills: ["ts"], resumeUrl: null },
    });
  });

  it("GET /profile 401s anonymously", async () => {
    expect((await request(app).get("/api/v1/user/profile")).status).toBe(401);
  });

  it("ignores an attempt to change the email", async () => {
    const seeker = await signedUpOn("seeker", "keep@x.test");
    const res = await request(app)
      .post("/api/v1/user/profile/update")
      .set("Cookie", [`jp_seeker_at=${seeker.access}`])
      .field("email", "attacker@x.test");
    expect(res.status).toBe(200);
    // Silently ignored, not honoured: the takeover path stays shut. If 1C adds a
    // real email-change flow this assertion is what tells you to update it.
    const account = await Seeker.findById(seeker.id);
    expect(account!.email).toBe("keep@x.test");
  });

  it("succeeds with no file attached", async () => {
    // The inherited controller threw a TypeError here and answered 500.
    const seeker = await signedUpOn("seeker", "nofile@x.test");
    const res = await request(app)
      .post("/api/v1/user/profile/update")
      .set("Cookie", [`jp_seeker_at=${seeker.access}`])
      .field("bio", "no resume today");
    expect(res.status).toBe(200);
    const account = await Seeker.findById(seeker.id);
    expect(account!.profile!.bio).toBe("no resume today");
    expect(account!.resume!.storageKey).toBeNull();
  });

  it("works for an account that never had a users row", async () => {
    // The gap this step closes: registered on the new endpoints, so no legacy row.
    const seeker = await signedUpOn("seeker", "brandnew@x.test");
    expect(await User.countDocuments({ email: "brandnew@x.test" })).toBe(0);
    const res = await request(app)
      .post("/api/v1/user/profile/update")
      .set("Cookie", [`jp_seeker_at=${seeker.access}`])
      .field("fullname", "Brand New");
    expect(res.status).toBe(200);
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
    const application = await Application.create({ job: job._id, applicant: seeker.id });
    await Job.updateOne({ _id: job._id }, { $push: { applications: application._id } });

    const res = await request(app)
      .get(`/api/v1/application/${job._id}/applicants`)
      .set("Cookie", [`jp_recruiter_at=${recruiter.access}`]);

    expect(res.status).toBe(200);
    // Before the ref change this was null — the seeker has no `users` row.
    expect(res.body.job.applications[0].applicant.fullName).toBe("Applicant Name");
    // And the hash is gone from a response that used to carry it.
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$argon2id\$|\$2[aby]\$/);
  });
});
