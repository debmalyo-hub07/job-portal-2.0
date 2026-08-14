import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { Company } from "../src/models/company.model.js";
import { Job } from "../src/models/job.model.js";
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
});
