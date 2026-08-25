import request from "supertest";
import mongoose from "mongoose";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { Company } from "../src/models/company.model.js";
import { Job } from "../src/models/job.model.js";
import { Recruiter } from "../src/models/recruiter.model.js";
import { asSession, installCaptureMailer, signedUpOn } from "./auth/helpers.js";

const app = buildApp();

async function recruiterWithCompany(email: string) {
  const session = await signedUpOn("recruiter", email);
  const res = await request(app)
    .post("/api/v1/company/register")
    .use(asSession("recruiter", session))
    .send({ name: `Co-${email}` });
  return { ...session, companyId: res.body.company.id as string };
}

function jobBody(companyId: string, title = "TypeScript Dev") {
  return {
    title,
    description: "Build the portal",
    requirements: "ts,node",
    salary: 10,
    experience: 2,
    location: "Remote",
    jobType: "Full-time",
    position: "2",
    companyId,
  };
}

describe("job routes", () => {
  let owner: Awaited<ReturnType<typeof recruiterWithCompany>>;
  let rival: Awaited<ReturnType<typeof recruiterWithCompany>>;

  beforeEach(async () => {
    installCaptureMailer();
    // autoIndex builds the {userId, name} index asynchronously; company
    // registration below would otherwise race the build.
    await Company.init();
    await Job.init();
    owner = await recruiterWithCompany("owner@example.com");
    rival = await recruiterWithCompany("rival@example.com");
  });

  it("posts a job against an owned company", async () => {
    const res = await request(app)
      .post("/api/v1/job/post")
      .use(asSession("recruiter", owner))
      .send(jobBody(owner.companyId));
    expect(res.status).toBe(201);
    expect(res.body.job.company.name).toBe("Co-owner@example.com");
    expect(res.body.job.requirements).toEqual(["ts", "node"]);
    expect(res.body.job._id).toBeUndefined();
    expect(res.body.job.__v).toBeUndefined();
    expect(res.body.job.created_by).toBeUndefined();
  });

  it("404s posting a job against someone else's company", async () => {
    const res = await request(app)
      .post("/api/v1/job/post")
      .use(asSession("recruiter", rival))
      .send(jobBody(owner.companyId));
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("COMPANY_NOT_FOUND");
  });

  it("404s posting a job against a company that does not exist", async () => {
    const res = await request(app)
      .post("/api/v1/job/post")
      .use(asSession("recruiter", owner))
      .send(jobBody("64b0c8f2a9d3e45f6a7b8c9d"));
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("COMPANY_NOT_FOUND");
  });

  it("rejects an invalid post body with 400 VALIDATION_ERROR", async () => {
    const res = await request(app)
      .post("/api/v1/job/post")
      .use(asSession("recruiter", owner))
      .send({ title: "x" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("public list is paginated and filters by escaped keyword", async () => {
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post("/api/v1/job/post")
        .use(asSession("recruiter", owner))
        .send(jobBody(owner.companyId, `Dev ${i}`));
    }
    const res = await request(app).get("/api/v1/job/get?limit=2&keyword=dev");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body).toMatchObject({ success: true, total: 3, page: 1, pages: 2 });

    const second = await request(app).get("/api/v1/job/get?limit=2&page=2&keyword=dev");
    expect(second.body.items).toHaveLength(1);
    expect(second.body.page).toBe(2);

    // Hostile regex input matches literally instead of exploding. `.*` is the
    // discriminator: unescaped it is a pattern matching all four jobs, escaped
    // it is a two-character literal present in exactly one title.
    await request(app)
      .post("/api/v1/job/post")
      .use(asSession("recruiter", owner))
      .send(jobBody(owner.companyId, "Literal .* match"));

    const wildcard = await request(app).get(`/api/v1/job/get?keyword=${encodeURIComponent(".*")}`);
    expect(wildcard.status).toBe(200);
    expect(wildcard.body.total).toBe(1);
    expect(wildcard.body.items[0].title).toBe("Literal .* match");

    // A catastrophically backtracking pattern is inert, not a 500 or a timeout.
    const hostile = await request(app).get(
      `/api/v1/job/get?keyword=${encodeURIComponent("(a+)+$")}`,
    );
    expect(hostile.status).toBe(200);
    expect(hostile.body.total).toBe(0);
    expect(hostile.body.items).toEqual([]);

    // An empty keyword lists everything rather than filtering on "".
    const all = await request(app).get("/api/v1/job/get");
    expect(all.body.total).toBe(4);
  });

  // ── 4B faceted search — the filter queries the field it names ────────────
  describe("faceted filters (4B)", () => {
    const post = (title: string, body: Record<string, unknown>) =>
      request(app)
        .post("/api/v1/job/post")
        .use(asSession("recruiter", owner))
        .send({
          title,
          description: "Build",
          requirements: "ts",
          salary: 10,
          experience: 2,
          location: "Berlin",
          jobType: "Full-time",
          position: "1",
          companyId: owner.companyId,
          ...body,
        });

    it("location filters the location field, not the title", async () => {
      await post("Bengaluru-only", { location: "Bengaluru" });
      await post("Mumbai-only", { location: "Mumbai" });
      const res = await request(app).get("/api/v1/job/get?location=Bengaluru");
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].title).toBe("Bengaluru-only");
    });

    it("multi-select ORs within a facet and ANDs across facets", async () => {
      const r1 = await post("fj", { location: "Bengaluru", jobType: "Full-time" });
      const r2 = await post("fk", { location: "Bengaluru", jobType: "Contract" });
      const r3 = await post("mk", { location: "Mumbai", jobType: "Contract" });
      expect([r1.status, r2.status, r3.status]).toEqual([201, 201, 201]);
      // location∈{Bengaluru,Mumbai} AND jobType=contract → fk AND mk both match.
      const res = await request(app).get(
        "/api/v1/job/get?location=Bengaluru,Mumbai&jobType=Contract",
      );
      expect(res.body.total).toBe(2);
      expect(res.body.items.map((i: { title: string }) => i.title).sort()).toEqual(["fk", "mk"]);

      const orRes = await request(app).get("/api/v1/job/get?jobType=Full-time,Contract");
      expect(orRes.body.total).toBe(3);
    });

    it("remote=true returns only remotely-flagged jobs, and doesn't match location text", async () => {
      await post("remote-flagged", { remote: "true", location: "Berlin" });
      await post("titled-remote", { location: "Berlin" }); // no flag: titled "remote" but office
      const res = await request(app).get("/api/v1/job/get?remote=true");
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].title).toBe("remote-flagged");
    });

    it("salaryMax and experienceMax bound", async () => {
      await post("cheap", { salary: 5 });
      await post("costly", { salary: 50 });
      const cheap = await request(app).get("/api/v1/job/get?salaryMax=10");
      expect(cheap.status).toBe(200);
      expect(cheap.body.success).toBe(true);
      expect(cheap.body.total).toBe(1);
      expect(cheap.body.items[0].title).toBe("cheap");
    });

    it("experienceMax bounds", async () => {
      await post("junior", { experience: 1 });
      await post("senior", { experience: 8 });
      const junior = await request(app).get("/api/v1/job/get?experienceMax=3");
      expect(junior.body.total).toBe(1);
      expect(junior.body.items[0].title).toBe("junior");
    });

    it("faces combine with keyword", async () => {
      await post("Type Lead", { location: "Berlin" });
      await post("Python Lead", { location: "Mumbai" });
      const res = await request(app).get("/api/v1/job/get?keyword=Lead&location=Berlin");
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].title).toBe("Type Lead");
    });

    it("filters by company name without sanitizeFilter rejecting ObjectIds", async () => {
      await post("Company role", {});
      const res = await request(app).get(
        `/api/v1/job/get?company=${encodeURIComponent("Co-owner@example.com")}`,
      );
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].company.name).toBe("Co-owner@example.com");
    });

    it("keyword reaches the company name, the location and the department", async () => {
      await post("Ledger work", { location: "Kolkata", department: "Finance & Accounting" });
      await post("Elsewhere", { location: "Berlin", department: "Engineering" });

      // The job row stores only a company ObjectId, so the employer name is
      // matched through a second query rather than on the job itself.
      const byCompany = await request(app).get("/api/v1/job/get?keyword=owner");
      expect(byCompany.body.total).toBe(2);

      const byLocation = await request(app).get("/api/v1/job/get?keyword=Kolkata");
      expect(byLocation.body.total).toBe(1);
      expect(byLocation.body.items[0].title).toBe("Ledger work");

      const byDepartment = await request(app).get(
        `/api/v1/job/get?keyword=${encodeURIComponent("Finance & Accounting")}`,
      );
      expect(byDepartment.body.total).toBe(1);
      expect(byDepartment.body.items[0].title).toBe("Ledger work");
    });

    it("ANDs the words of a multi-word keyword instead of demanding the phrase", async () => {
      await post("Senior Platform Engineer", { location: "Pune" });
      await post("Senior Analyst", { location: "Pune" });

      // "Engineer Senior" is neither job's phrasing; both words are present in
      // exactly one of them.
      const reordered = await request(app).get("/api/v1/job/get?keyword=Engineer%20Senior");
      expect(reordered.body.total).toBe(1);
      expect(reordered.body.items[0].title).toBe("Senior Platform Engineer");

      // A word matched by neither job removes the whole result, rather than
      // widening it the way an OR across tokens would.
      const absent = await request(app).get("/api/v1/job/get?keyword=Senior%20Nonexistent");
      expect(absent.body.total).toBe(0);
    });

    it("a facet with no matches returns an empty page, not a fallback to everything", async () => {
      await post("x-one", { location: "Bengaluru" });
      const res = await request(app).get("/api/v1/job/get?location=Nowhere");
      expect(res.body.total).toBe(0);
      expect(res.body.items).toEqual([]);
    });
  });

  it("GET /get/:id serves a DTO, 400s a malformed id and 404s an unknown one", async () => {
    const created = await request(app)
      .post("/api/v1/job/post")
      .use(asSession("recruiter", owner))
      .send(jobBody(owner.companyId));
    const id = created.body.job.id as string;

    const ok = await request(app).get(`/api/v1/job/get/${id}`);
    expect(ok.status).toBe(200);
    expect(ok.body.job).toMatchObject({ id, title: "TypeScript Dev" });
    expect(ok.body.job._id).toBeUndefined();

    expect((await request(app).get("/api/v1/job/get/nope")).status).toBe(400);
    const unknown = await request(app).get("/api/v1/job/get/64b0c8f2a9d3e45f6a7b8c9d");
    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe("JOB_NOT_FOUND");
  });

  it("getadminjobs matrix: anonymous 401, seeker 401, recruiter sees only own", async () => {
    await request(app)
      .post("/api/v1/job/post")
      .use(asSession("recruiter", owner))
      .send(jobBody(owner.companyId));
    expect((await request(app).get("/api/v1/job/getadminjobs")).status).toBe(401);
    const seeker = await signedUpOn("seeker", "s@example.com");
    expect(
      (
        await request(app)
          .get("/api/v1/job/getadminjobs")
          .set("Cookie", [`jp_seeker_at=${seeker.access}`])
      ).status,
    ).toBe(401);

    const theirs = await request(app)
      .get("/api/v1/job/getadminjobs")
      .use(asSession("recruiter", rival));
    expect(theirs.status).toBe(200);
    expect(theirs.body.items).toHaveLength(0);
    expect(theirs.body).toMatchObject({ total: 0, page: 1, pages: 0 });

    const mine = await request(app)
      .get("/api/v1/job/getadminjobs")
      .use(asSession("recruiter", owner));
    expect(mine.body.items).toHaveLength(1);
    expect(mine.body.items[0].title).toBe("TypeScript Dev");
  });

  it("rejects a jobType the seeker board cannot filter for", async () => {
    const res = await request(app)
      .post("/api/v1/job/post")
      .use(asSession("recruiter", owner))
      .send({ ...jobBody(owner.companyId), jobType: "Full Time" });
    // Free text was accepted, stored, and rendered on the job card while
    // FilterCard's exact-equality facet could never match it.
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("accepts every value the seeker facet offers", async () => {
    for (const type of ["Full-time", "Part-time", "Internship", "Contract"]) {
      const res = await request(app)
        .post("/api/v1/job/post")
        .use(asSession("recruiter", owner))
        .send({ ...jobBody(owner.companyId), jobType: type });
      expect(res.status).toBe(201);
      expect(res.body.job.jobType).toBe(type);
    }
  });
  /**
   * `postedBy` — the poster block on a public job page.
   *
   * Contact details are gated on an authenticated seeker because the job routes
   * are `optionalAuthenticate`: without the gate a crawler harvests every
   * recruiter's address and number off the board.
   */
  describe("postedBy", () => {
    async function postJob() {
      const res = await request(app)
        .post("/api/v1/job/post")
        .use(asSession("recruiter", owner))
        .send(jobBody(owner.companyId));
      return res.body.job.id as string;
    }

    it("names the poster publicly but withholds contact from an anonymous visitor", async () => {
      await Recruiter.updateOne({ _id: owner.id }, { $set: { designation: "Talent Lead" } });
      const id = await postJob();

      const res = await request(app).get(`/api/v1/job/get/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.job.postedBy.designation).toBe("Talent Lead");
      // The address must not travel to a caller without a session.
      expect(res.body.job.postedBy.email).toBeUndefined();
      expect(res.body.job.postedBy.phone).toBeUndefined();
      // The raw reference stays withheld regardless.
      expect(res.body.job.created_by).toBeUndefined();
    });

    it("releases contact details to an authenticated seeker", async () => {
      await Recruiter.updateOne({ _id: owner.id }, { $set: { phone: "+91 99999 00000" } });
      const id = await postJob();
      const seeker = await signedUpOn("seeker", "candidate@example.com");

      const res = await request(app)
        .get(`/api/v1/job/get/${id}`)
        .use(asSession("seeker", seeker));
      expect(res.status).toBe(200);
      expect(res.body.job.postedBy.email).toBe("owner@example.com");
      expect(res.body.job.postedBy.phone).toBe("+91 99999 00000");
    });

    it("is null when the posting recruiter no longer exists", async () => {
      const id = await postJob();
      // The 2026-08 account cleanup left the seeded catalogue owner-less on
      // purpose; such a job must render with no poster rather than 500.
      await Recruiter.deleteOne({ _id: owner.id });

      const res = await request(app).get(`/api/v1/job/get/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.job.postedBy).toBeNull();
    });

    it("carries the poster on the public list, not just the detail page", async () => {
      await postJob();
      const res = await request(app).get("/api/v1/job/get");
      expect(res.status).toBe(200);
      expect(res.body.items[0].postedBy.fullName).toBeTruthy();
      expect(res.body.items[0].postedBy.email).toBeUndefined();
    });
  });

  /**
   * The job lifecycle: correct a posting, close a filled role, delete a mistake.
   *
   * Before this the router said so in its own comment — "There are no job update
   * or delete routes to gate" — so a mistyped salary was permanent and a filled
   * role went on collecting applications forever.
   */
  describe("lifecycle", () => {
    async function postJob(title = "Lifecycle Dev") {
      const res = await request(app)
        .post("/api/v1/job/post")
        .use(asSession("recruiter", owner))
        .send(jobBody(owner.companyId, title));
      expect(res.status).toBe(201);
      return res.body.job.id as string;
    }

    const close = (id: string, session = owner, status = "closed") =>
      request(app)
        .post(`/api/v1/job/status/${id}/update`)
        .use(asSession("recruiter", session))
        .send({ status });

    it("posts a job as open", async () => {
      const id = await postJob();
      const res = await request(app).get(`/api/v1/job/get/${id}`);
      expect(res.body.job.status).toBe("open");
    });

    /**
     * The production-safety guarantee, and the reason the board filter is
     * `$ne: "closed"` rather than `status: "open"`.
     *
     * Mongo does not match a missing field against an equality, so the equality
     * form would have hidden every one of the 198 rows written before this field
     * existed — the entire public board, on deploy, silently. Inserted through
     * the raw collection because Mongoose applies the schema default on every
     * ordinary create and cannot produce this document.
     */
    it("lists a legacy job that has no status field at all", async () => {
      const id = await postJob("Legacy Row");
      await Job.collection.updateOne(
        { _id: new mongoose.Types.ObjectId(id) },
        { $unset: { status: "" } },
      );
      // The document really has no such field — if this assertion is wrong, the
      // ones below prove nothing.
      const raw = await Job.collection.findOne({ _id: new mongoose.Types.ObjectId(id) });
      expect(raw && "status" in raw).toBe(false);

      const res = await request(app).get("/api/v1/job/get");
      expect(res.status).toBe(200);
      expect(res.body.items.map((j: { title: string }) => j.title)).toContain("Legacy Row");
      // And it reads as open through the DTO, so the Apply control still renders.
      expect(res.body.items.find((j: { title: string }) => j.title === "Legacy Row").status).toBe(
        "open",
      );
    });

    it("updates the fields a recruiter may correct", async () => {
      const id = await postJob();
      const res = await request(app)
        .put(`/api/v1/job/update/${id}`)
        .use(asSession("recruiter", owner))
        .send({ title: "Senior TypeScript Dev", salary: 24, requirements: "ts, rust" });

      expect(res.status).toBe(200);
      expect(res.body.job.title).toBe("Senior TypeScript Dev");
      expect(res.body.job.salary).toBe(24);
      expect(res.body.job.requirements).toEqual(["ts", "rust"]);
      // Untouched fields survive a partial update.
      expect(res.body.job.location).toBe("Remote");
    });

    it("maps the request's experience field onto the stored experienceLevel", async () => {
      // The two names differ, exactly as they do on create. A mapping that was
      // missed here would accept the field and store nothing.
      const id = await postJob();
      const res = await request(app)
        .put(`/api/v1/job/update/${id}`)
        .use(asSession("recruiter", owner))
        .send({ experience: 7 });
      expect(res.status).toBe(200);
      expect(res.body.job.experienceLevel).toBe(7);
    });

    it("refuses to move a posting to another company", async () => {
      const id = await postJob();
      const res = await request(app)
        .put(`/api/v1/job/update/${id}`)
        .use(asSession("recruiter", owner))
        .send({ companyId: rival.companyId });
      // 400 from the strict schema, not a silent strip: a 200 with no change
      // would look like the posting had moved until the page reloaded.
      expect(res.status).toBe(400);
    });

    it("404s every write against a job the caller does not own", async () => {
      const id = await postJob();

      const update = await request(app)
        .put(`/api/v1/job/update/${id}`)
        .use(asSession("recruiter", rival))
        .send({ title: "Hijacked" });
      expect(update.status).toBe(404);
      expect(update.body.code).toBe("JOB_NOT_FOUND");

      expect((await close(id, rival)).status).toBe(404);

      const removed = await request(app)
        .delete(`/api/v1/job/delete/${id}`)
        .use(asSession("recruiter", rival));
      expect(removed.status).toBe(404);

      // And the job is untouched by any of it.
      const after = await request(app).get(`/api/v1/job/get/${id}`);
      expect(after.body.job.title).toBe("Lifecycle Dev");
      expect(after.body.job.status).toBe("open");
    });

    it("takes a closed role off the board but keeps its page reachable", async () => {
      const id = await postJob("Closing Soon");
      expect((await close(id)).status).toBe(200);

      const board = await request(app).get("/api/v1/job/get");
      expect(board.body.items.map((j: { title: string }) => j.title)).not.toContain("Closing Soon");

      // Still resolvable by id: a candidate who applied has this link in their
      // applied-jobs list, and 404ing it would break their own record.
      const detail = await request(app).get(`/api/v1/job/get/${id}`);
      expect(detail.status).toBe(200);
      expect(detail.body.job.status).toBe("closed");
    });

    it("keeps a closed role on the recruiter's own list", async () => {
      const id = await postJob("Mine Even When Closed");
      await close(id);
      const res = await request(app)
        .get("/api/v1/job/getadminjobs")
        .use(asSession("recruiter", owner));
      expect(res.body.items.map((j: { title: string }) => j.title)).toContain(
        "Mine Even When Closed",
      );
    });

    it("reopens a closed role", async () => {
      const id = await postJob("Reopened");
      await close(id);
      expect((await close(id, owner, "open")).status).toBe(200);

      const board = await request(app).get("/api/v1/job/get");
      expect(board.body.items.map((j: { title: string }) => j.title)).toContain("Reopened");
    });

    it("409s a status that is already set", async () => {
      // Not a successful no-op: that is how a double-submit hides.
      const id = await postJob();
      const res = await close(id, owner, "open");
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("STATUS_UNCHANGED");
    });

    it("400s a status outside the lifecycle enum", async () => {
      const id = await postJob();
      expect((await close(id, owner, "draft")).status).toBe(400);
    });

    it("refuses an application to a closed role", async () => {
      const id = await postJob("No Longer Hiring");
      await close(id);
      const seeker = await signedUpOn("seeker", "late@example.com");

      const res = await request(app)
        .post(`/api/v1/application/apply/${id}`)
        .use(asSession("seeker", seeker));
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("JOB_CLOSED");
    });

    /**
     * Closing must not freeze the pipeline.
     *
     * You close a role *because* you hired someone, and you still have to reject
     * everyone else. A guard on the applicant list would strand every remaining
     * candidate at whatever stage they had reached.
     */
    it("still lets the recruiter decide on applicants after closing", async () => {
      const id = await postJob("Filled");
      const seeker = await signedUpOn("seeker", "midpipeline@example.com");
      await request(app)
        .post(`/api/v1/application/apply/${id}`)
        .use(asSession("seeker", seeker));
      await close(id);

      const applicants = await request(app)
        .get(`/api/v1/application/${id}/applicants`)
        .use(asSession("recruiter", owner));
      expect(applicants.status).toBe(200);
      const applicationId = applicants.body.items[0].applicationId as string;

      const decided = await request(app)
        .post(`/api/v1/application/status/${applicationId}/update`)
        .use(asSession("recruiter", owner))
        .send({ status: "rejected" });
      expect(decided.status).toBe(200);
    });

    it("deletes a posting nobody applied to", async () => {
      const id = await postJob("Posted By Mistake");
      const res = await request(app)
        .delete(`/api/v1/job/delete/${id}`)
        .use(asSession("recruiter", owner));
      expect(res.status).toBe(200);
      expect((await request(app).get(`/api/v1/job/get/${id}`)).status).toBe(404);
    });

    it("refuses to delete a posting people applied to", async () => {
      const id = await postJob("Has History");
      const seeker = await signedUpOn("seeker", "applicant@example.com");
      await request(app)
        .post(`/api/v1/application/apply/${id}`)
        .use(asSession("seeker", seeker));

      const res = await request(app)
        .delete(`/api/v1/job/delete/${id}`)
        .use(asSession("recruiter", owner));
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("JOB_HAS_APPLICATIONS");
      // The candidate's record survives the refusal.
      expect((await request(app).get(`/api/v1/job/get/${id}`)).status).toBe(200);
    });

    it("refuses to delete a posting whose only applicant was rejected", async () => {
      // `active` is 0 here and `total` is 1. Gating delete on the active count
      // would erase a rejected candidate's record of having applied.
      const id = await postJob("Rejected Everyone");
      const seeker = await signedUpOn("seeker", "rejected@example.com");
      await request(app)
        .post(`/api/v1/application/apply/${id}`)
        .use(asSession("seeker", seeker));
      const applicants = await request(app)
        .get(`/api/v1/application/${id}/applicants`)
        .use(asSession("recruiter", owner));
      await request(app)
        .post(`/api/v1/application/status/${applicants.body.items[0].applicationId}/update`)
        .use(asSession("recruiter", owner))
        .send({ status: "rejected" });

      const res = await request(app)
        .delete(`/api/v1/job/delete/${id}`)
        .use(asSession("recruiter", owner));
      expect(res.status).toBe(409);
    });

    /**
     * Applicant counts, owner-only.
     *
     * The recruiter's list needs them to decide whether Delete is offered; the
     * public board must never carry them, because how many people applied to a
     * rival's role is competitive information.
     */
    it("counts applicants for the owner and never for the public", async () => {
      const id = await postJob("Counted");
      const first = await signedUpOn("seeker", "count1@example.com");
      const second = await signedUpOn("seeker", "count2@example.com");
      for (const seeker of [first, second]) {
        await request(app)
          .post(`/api/v1/application/apply/${id}`)
          .use(asSession("seeker", seeker));
      }
      const applicants = await request(app)
        .get(`/api/v1/application/${id}/applicants`)
        .use(asSession("recruiter", owner));
      await request(app)
        .post(`/api/v1/application/status/${applicants.body.items[0].applicationId}/update`)
        .use(asSession("recruiter", owner))
        .send({ status: "rejected" });

      const owned = await request(app)
        .get("/api/v1/job/getadminjobs")
        .use(asSession("recruiter", owner));
      const row = owned.body.items.find((j: { title: string }) => j.title === "Counted");
      // Two applied, one rejected — so one is still awaiting a decision.
      expect(row.applications).toEqual({ total: 2, active: 1 });

      const publicList = await request(app).get("/api/v1/job/get");
      expect(
        publicList.body.items.find((j: { title: string }) => j.title === "Counted").applications,
      ).toBeUndefined();
    });

    it("reports zero rather than nothing for an owned job with no applicants", async () => {
      // Absent would be indistinguishable from a public response, and the
      // workspace reads `total` to decide whether Delete is available.
      await postJob("Nobody Yet");
      const res = await request(app)
        .get("/api/v1/job/getadminjobs")
        .use(asSession("recruiter", owner));
      const row = res.body.items.find((j: { title: string }) => j.title === "Nobody Yet");
      expect(row.applications).toEqual({ total: 0, active: 0 });
    });
  });
});
