import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FACTOR_KEYS } from "@jobportal/shared";
import { buildApp } from "../src/app.js";
import { Company } from "../src/models/company.model.js";
import { Job } from "../src/models/job.model.js";
import { Seeker } from "../src/models/seeker.model.js";
import { asSession, installCaptureMailer, signedUpOn } from "./auth/helpers.js";

const app = buildApp();

/**
 * The fit score on the wire.
 *
 * `scoreJobForSeeker` existed from 4A.3 with no call site outside its own unit
 * test, and `JobDto` had no field to carry a score — so the explainable matching
 * engine was unreachable from the product. These pin the three things that make
 * it safe to surface: it is attached only for a seeker, it is absent (not zero,
 * not guessed) for anyone else, and it does not change the order of the list.
 */
describe("fit on the job DTO", () => {
  let recruiter: Awaited<ReturnType<typeof signedUpOn>>;
  let companyId: string;

  beforeEach(async () => {
    installCaptureMailer();
    await Company.init();
    await Job.init();
    recruiter = await signedUpOn("recruiter", "hire@x.test");
    const company = await Company.create({ name: "Acme", userId: recruiter.id });
    companyId = String(company._id);
  });

  async function postedJob(over: Record<string, unknown> = {}) {
    return Job.create({
      title: "TypeScript Dev",
      description: "Build the portal",
      requirements: ["typescript", "node"],
      salary: 12,
      experienceLevel: 4,
      location: "Kolkata",
      jobType: "Full-time",
      position: 1,
      remote: true,
      company: companyId,
      created_by: recruiter.id,
      ...over,
    });
  }

  /**
   * `$set: { profile }` replaces the subdocument, so a field left out of
   * `profile` is genuinely absent — which is what "the seeker never answered"
   * looks like in the database.
   */
  async function seekerWithProfile(email: string, profile: Record<string, unknown>) {
    const session = await signedUpOn("seeker", email);
    await Seeker.findByIdAndUpdate(session.id, { $set: { profile } });
    return session;
  }

  const asSeeker = (access: string) => [`jp_seeker_at=${access}`];

  it("omits fit entirely for an anonymous visitor", async () => {
    await postedJob();
    const res = await request(app).get("/api/v1/job/get");
    expect(res.status).toBe(200);
    // Absent, not 0 and not null: an anonymous visitor has no profile to score
    // against, and a zero would render as "0% fit" — a claim about them that
    // nobody made.
    expect("fit" in res.body.items[0]).toBe(false);
  });

  it("attaches a scored breakdown for a signed-in seeker", async () => {
    await postedJob();
    const seeker = await seekerWithProfile("fit-list@x.test", {
      skills: ["typescript", "node"],
      experienceYears: 6,
      location: "Kolkata",
      salaryMin: 8,
      salaryMax: 20,
      openToRemote: true,
    });

    const res = await request(app).get("/api/v1/job/get").set("Cookie", asSeeker(seeker.access));

    expect(res.status).toBe(200);
    const fit = res.body.items[0].fit;
    // Every factor arrives, so the badge can explain a score rather than assert
    // one. A breakdown missing a factor is a score whose arithmetic cannot be
    // shown.
    expect(fit.factors.map((f: { key: string }) => f.key).sort()).toEqual([...FACTOR_KEYS].sort());
    expect(fit.score).toBe(100);
  });

  it("attaches fit on the single-job route too", async () => {
    const job = await postedJob();
    const seeker = await seekerWithProfile("fit-one@x.test", { skills: ["typescript"] });
    const res = await request(app)
      .get(`/api/v1/job/get/${job._id}`)
      .set("Cookie", asSeeker(seeker.access));
    expect(res.status).toBe(200);
    expect(res.body.job.fit.score).toBeGreaterThan(0);
  });

  /**
   * An unset field is not a zero.
   *
   * `remoteFit`, `salaryFit`, `experienceFit` and `locationFit` each return 1 for
   * an unknown — "the seeker never said, don't fault the job". A fresh profile
   * must therefore lose points on skills alone, not on four questions it was
   * never asked.
   */
  it("scores an unanswered field at its ceiling rather than zero", async () => {
    await postedJob();
    const seeker = await seekerWithProfile("fit-blank@x.test", { skills: [] });
    const res = await request(app).get("/api/v1/job/get").set("Cookie", asSeeker(seeker.access));

    const factors: Array<{ key: string; earned: number; max: number }> =
      res.body.items[0].fit.factors;
    for (const f of factors.filter((x) => x.key !== "skills")) {
      expect(f.earned, `${f.key} penalised a question the seeker never answered`).toBe(f.max);
    }
    expect(factors.find((f) => f.key === "skills")!.earned).toBe(0);
  });

  it("omits fit for a recruiter, and does not even look for their profile", async () => {
    await postedJob();
    const findById = vi.spyOn(Seeker, "findById");
    const res = await request(app)
      .get("/api/v1/job/get")
      .use(asSession("recruiter", recruiter));
    expect(res.status).toBe(200);
    // `optionalAuthenticate` resolves a recruiter here too, so this is the case
    // that would otherwise score a recruiter against their own listing.
    expect("fit" in res.body.items[0]).toBe(false);
    // Zero seeker reads is what pins the portal check in `fitViewer`. Dropping it
    // still yields no `fit` — a recruiter's id simply misses the seekers
    // collection — so the outcome alone cannot tell the two apart, and the
    // guarantee would rest on ObjectIds from two collections never colliding
    // rather than on the portal that was authenticated.
    expect(findById).not.toHaveBeenCalled();
    findById.mockRestore();
  });

  it("omits fit from the recruiter's own job list and from a fresh post", async () => {
    await postedJob();
    const owned = await request(app)
      .get("/api/v1/job/getadminjobs")
      .use(asSession("recruiter", recruiter));
    expect(owned.status).toBe(200);
    expect("fit" in owned.body.items[0]).toBe(false);

    const created = await request(app)
      .post("/api/v1/job/post")
      .use(asSession("recruiter", recruiter))
      .send({
        title: "Another",
        description: "Details of the role",
        requirements: "ts",
        salary: 9,
        experience: 1,
        location: "Pune",
        jobType: "Full-time",
        position: "1",
        companyId,
      });
    expect(created.status).toBe(201);
    expect("fit" in created.body.job).toBe(false);
  });

  /**
   * The badge explains; it does not reorder.
   *
   * `paginate` sorts and pages in Mongo, so a score computed after the query
   * ranks only the rows already on this page while presenting itself as ranking
   * everything — the defect already documented for `WorkspaceCompanies`. This
   * asserts the list still comes back newest-first, so a later change that sorts
   * by fit has to confront the pagination question rather than half-answer it.
   */
  it("leaves the ordering to createdAt, not to the score", async () => {
    await postedJob({ title: "Perfect match", requirements: ["typescript"] });
    const newer = await postedJob({ title: "Nothing in common", requirements: ["cobol"] });
    // Two creates can land in the same millisecond, which would make the sort
    // order — and therefore this test — a coin flip. `timestamps: false` stops
    // the update from clobbering the value it is setting.
    await Job.updateOne(
      { _id: newer._id },
      { $set: { createdAt: new Date(Date.now() + 60_000) } },
      { timestamps: false },
    );

    const seeker = await seekerWithProfile("fit-order@x.test", { skills: ["typescript"] });
    const res = await request(app).get("/api/v1/job/get").set("Cookie", asSeeker(seeker.access));

    expect(res.body.items[0].title).toBe("Nothing in common");
    expect(res.body.items[0].fit.score).toBeLessThan(res.body.items[1].fit.score);
  });

  it("reads the profile once per request, not once per job", async () => {
    for (let i = 0; i < 3; i++) await postedJob({ title: `Job ${i}` });
    const seeker = await seekerWithProfile("fit-n1@x.test", { skills: ["typescript"] });

    const findById = vi.spyOn(Seeker, "findById");
    const res = await request(app).get("/api/v1/job/get").set("Cookie", asSeeker(seeker.access));

    expect(res.body.items).toHaveLength(3);
    for (const item of res.body.items) expect(item.fit.factors).toHaveLength(FACTOR_KEYS.length);
    // Exactly two reads: one for the session in `optionalAuthenticate`, one for
    // the fit. The number is asserted rather than bounded because it is the
    // whole point — scoring inside `toJobDto` with its own lookup would make it
    // grow with the page size, 50 reads of a document that cannot change
    // mid-request.
    expect(findById.mock.calls.length).toBe(2);
    findById.mockRestore();
  });
});
