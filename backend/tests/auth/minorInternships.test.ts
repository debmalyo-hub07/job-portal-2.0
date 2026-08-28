import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { Types } from "mongoose";

import { buildApp } from "../../src/app.js";
import { Seeker } from "../../src/models/seeker.model.js";
import { asSession, installCaptureMailer, lastCodeFor, outbox, signedUpOn } from "./helpers.js";

const app = buildApp();
const PASSWORD = "correct horse battery staple";

beforeEach(installCaptureMailer);

/** A verified, complete adult seeker — the control case. */
async function adultSeeker(email: string) {
  const session = await signedUpOn("seeker", email);
  await Seeker.updateOne(
    { email },
    { $set: { dob: new Date("1990-01-01T00:00:00Z") } },
  );
  return session;
}

/**
 * A verified seeker still awaiting the identity block.
 *
 * `signedUpOn` sets an adult DOB by default (every other suite wants complete
 * accounts), so the gate suite clears it back to null per account — the same
 * move profileGate.test.ts makes.
 */
async function incompleteSeeker(email: string) {
  const session = await signedUpOn("seeker", email);
  await Seeker.updateOne({ email }, { $set: { dob: null } });
  return session;
}

async function completeDob(session: Awaited<ReturnType<typeof signedUpOn>>, dob: string) {
  return request(app)
    .post("/api/v1/user/profile/complete")
    .use(asSession("seeker", session))
    .send({ dob });
}

describe("guardian consent", () => {
  it("a minor DOB saves but the gate stays closed until consent", async () => {
    const session = await incompleteSeeker("minor-gate@x.test");
    const res = await completeDob(session, "2010-06-15");
    expect(res.status).toBe(200);
    expect(res.body.profile.minor).toBe(true);
    expect(res.body.profile.user.profileComplete).toBe(false);

    // The gate still refuses the minor's consequential write.
    const apply = await request(app)
      .post("/api/v1/application/apply/000000000000000000000000")
      .use(asSession("seeker", session));
    expect(apply.status).toBe(403);
    expect(apply.body.code).toBe("PROFILE_INCOMPLETE");
  });

  it("mails the code to the guardian's address, then completes the account", async () => {
    const session = await incompleteSeeker("minor-flow@x.test");
    await completeDob(session, "2009-03-01");

    const start = await request(app)
      .post("/api/v1/user/guardian-consent")
      .use(asSession("seeker", session))
      .send({ email: "guardian@family.test" });
    expect(start.status).toBe(200);

    // The code went to the guardian, and only to the guardian. Scoped past
    // the signup's own verification mail, which is 6-digit too.
    const code = await lastCodeFor("guardian@family.test");
    const consentMails = outbox.filter((m) =>
      m.subject.toLowerCase().includes("guardian"),
    );
    expect(consentMails.every((m) => m.to === "guardian@family.test")).toBe(true);
    expect(
      outbox.some((m) => m.to === "minor-flow@x.test" && /confirm guardian consent/i.test(m.subject)),
    ).toBe(false);

    const confirm = await request(app)
      .post("/api/v1/user/guardian-consent/confirm")
      .use(asSession("seeker", session))
      .send({ code });
    expect(confirm.status).toBe(200);

    // The gate is now clear for the minor.
    const account = await Seeker.findOne({ email: "minor-flow@x.test" });
    expect(account?.guardianConsent?.email).toBe("guardian@family.test");
    expect(account?.guardianConsent?.consentedAt).not.toBeNull();
    expect(account?.pendingGuardian?.email ?? null).toBeNull();
  });

  it("refuses consent flows an adult does not need", async () => {
    const session = await adultSeeker("adult-noconsent@x.test");
    const res = await request(app)
      .post("/api/v1/user/guardian-consent")
      .use(asSession("seeker", session))
      .send({ email: "guardian@family.test" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("GUARDIAN_NOT_REQUIRED");
  });

  it("refuses a second consent once one is on file", async () => {
    const session = await incompleteSeeker("minor-twice@x.test");
    await completeDob(session, "2010-01-01");
    await Seeker.updateOne(
      { email: "minor-twice@x.test" },
      { $set: { guardianConsent: { email: "first@family.test", consentedAt: new Date() } } },
    );
    const res = await request(app)
      .post("/api/v1/user/guardian-consent")
      .use(asSession("seeker", session))
      .send({ email: "second@family.test" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("GUARDIAN_ALREADY_CONSENTED");
  });

  it("answers no-pending and a wrong code with the uniform OTP_INVALID", async () => {
    const session = await incompleteSeeker("minor-wrong@x.test");
    await completeDob(session, "2010-01-01");

    const none = await request(app)
      .post("/api/v1/user/guardian-consent/confirm")
      .use(asSession("seeker", session))
      .send({ code: "123456" });
    expect(none.status).toBe(400);
    expect(none.body.code).toBe("OTP_INVALID");

    await request(app)
      .post("/api/v1/user/guardian-consent")
      .use(asSession("seeker", session))
      .send({ email: "guardian@family.test" });
    const code = await lastCodeFor("guardian@family.test");
    const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, "0");
    const res = await request(app)
      .post("/api/v1/user/guardian-consent/confirm")
      .use(asSession("seeker", session))
      .send({ code: wrong });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("OTP_INVALID");
  });

  it("cannot confirm one account with another account's consent code", async () => {
    // The digest is bound to the subject: the attacker's own valid code aimed
    // at the victim's confirm.
    const attacker = await incompleteSeeker("minor-attacker@x.test");
    await completeDob(attacker, "2010-01-01");
    const victim = await incompleteSeeker("minor-victim@x.test");
    await completeDob(victim, "2010-01-01");

    await request(app)
      .post("/api/v1/user/guardian-consent")
      .use(asSession("seeker", attacker))
      .send({ email: "attacker-guardian@family.test" });
    const code = await lastCodeFor("attacker-guardian@family.test");

    const res = await request(app)
      .post("/api/v1/user/guardian-consent/confirm")
      .use(asSession("seeker", victim))
      .send({ code });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("OTP_INVALID");
    const victimAccount = await Seeker.findOne({ email: "minor-victim@x.test" });
    expect(victimAccount?.guardianConsent?.consentedAt ?? null).toBeNull();
  });
});

describe("internship-only applications", () => {
  async function makeJob(jobType: string): Promise<string> {
    // A recruiter with an approved account and an open job of the given type.
    const { Recruiter } = await import("../../src/models/recruiter.model.js");
    const { Company } = await import("../../src/models/company.model.js");
    const { Job } = await import("../../src/models/job.model.js");
    const recruiter = await Recruiter.create({
      email: `owner-${jobType.toLowerCase()}@x.test`,
      fullName: "Job Owner",
      passwordHash: "x",
      emailVerifiedAt: new Date(),
      status: "active",
    });
    const company = await Company.create({
      name: `Consent Co ${jobType}`,
      userId: recruiter._id,
    });
    const job = await Job.create({
      title: `A ${jobType} role`,
      description: "Work.",
      requirements: [],
      salary: 5,
      experienceLevel: 0,
      location: "Remote",
      jobType,
      position: 1,
      company: company._id,
      created_by: recruiter._id,
    });
    return String(job._id);
  }

  it("refuses a minor's application to a non-internship role", async () => {
    const session = await incompleteSeeker("minor-apply@x.test");
    await completeDob(session, "2009-01-01");
    await Seeker.updateOne(
      { email: "minor-apply@x.test" },
      { $set: { guardianConsent: { email: "g@family.test", consentedAt: new Date() } } },
    );

    const jobId = await makeJob("Full-time");
    const res = await request(app)
      .post(`/api/v1/application/apply/${jobId}`)
      .use(asSession("seeker", session));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("MINOR_NON_INTERNSHIP");
  });

  it("accepts a minor's application to an internship", async () => {
    const session = await incompleteSeeker("minor-intern@x.test");
    await completeDob(session, "2009-01-01");
    await Seeker.updateOne(
      { email: "minor-intern@x.test" },
      { $set: { guardianConsent: { email: "g@family.test", consentedAt: new Date() } } },
    );

    const jobId = await makeJob("Internship");
    const res = await request(app)
      .post(`/api/v1/application/apply/${jobId}`)
      .use(asSession("seeker", session));
    expect(res.status).toBe(201);
  });

  it("an adult applies to anything, as before", async () => {
    const session = await adultSeeker("adult-apply@x.test");
    const jobId = await makeJob("Full-time");
    const res = await request(app)
      .post(`/api/v1/application/apply/${jobId}`)
      .use(asSession("seeker", session));
    expect(res.status).toBe(201);
  });
});

describe("recruiters stay 18+", () => {
  it("refuses a recruiter completion with a minor DOB, writing nothing", async () => {
    const session = await signedUpOn("recruiter", "minor-rec@x.test");
    // Clear the adult DOB `signedUpOn` set, so a stored value after the
    // refused request is unambiguously the request's own partial write.
    const { Recruiter } = await import("../../src/models/recruiter.model.js");
    await Recruiter.updateOne({ email: "minor-rec@x.test" }, { $set: { dob: null } });

    const res = await request(app)
      .post("/api/v1/user/profile/complete")
      .use(asSession("recruiter", session))
      .send({ dob: "2010-01-01" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("RECRUITER_AGE_MINIMUM");

    // Nothing was written: the refused body leaves no stored DOB behind.
    const account = await Recruiter.findOne({ email: "minor-rec@x.test" });
    expect(account?.dob ?? null).toBeNull();
  });

  it("accepts an adult recruiter DOB", async () => {
    const session = await signedUpOn("recruiter", "adult-rec@x.test");
    const res = await request(app)
      .post("/api/v1/user/profile/complete")
      .use(asSession("recruiter", session))
      .send({ dob: "1995-01-01" });
    expect(res.status).toBe(200);
    expect(res.body.profile.user.profileComplete).toBe(true);
  });
});

describe("budget isolation for guardian_consent", () => {
  it("does not touch the verify_email budget", async () => {
    const session = await incompleteSeeker("minor-budget@x.test");
    await completeDob(session, "2010-01-01");
    const { OtpBudget } = await import("../../src/models/otpBudget.model.js");
    const { chargeOtpAttempt } = await import("../../src/services/otp.service.js");

    // One consent failure on the books.
    await chargeOtpAttempt("seeker", new Types.ObjectId(session.id), "guardian_consent").catch(
      () => {},
    );
    const verify = await OtpBudget.findOne({
      subjectId: session.id,
      purpose: "verify_email",
    });
    expect(verify?.failures ?? 0).toBe(0);
    const consent = await OtpBudget.findOne({
      subjectId: session.id,
      purpose: "guardian_consent",
    });
    expect(consent?.failures).toBe(1);
  });
});
