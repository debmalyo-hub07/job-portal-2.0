import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { Company } from "../src/models/company.model.js";
import { Job } from "../src/models/job.model.js";
import { installCaptureMailer, signedUpOn } from "./auth/helpers.js";

const app = buildApp();

async function recruiterWithCompany(email: string) {
  const session = await signedUpOn("recruiter", email);
  const res = await request(app)
    .post("/api/v1/company/register")
    .set("Cookie", [`jp_recruiter_at=${session.access}`])
    .send({ name: `Co-${email}` });
  return { ...session, companyId: res.body.company.id as string };
}

describe("GET /job/getadminjobs", () => {
  let owner: Awaited<ReturnType<typeof recruiterWithCompany>>;
  let rival: Awaited<ReturnType<typeof recruiterWithCompany>>;

  const post = (
    who: { access: string; companyId: string },
    title: string,
    description = "Build the portal",
  ) =>
    request(app)
      .post("/api/v1/job/post")
      .set("Cookie", [`jp_recruiter_at=${who.access}`])
      .send({
        title,
        description,
        requirements: "ts",
        salary: 10,
        experience: 2,
        location: "Pune",
        jobType: "Full-time",
        position: "1",
        companyId: who.companyId,
      });

  const list = (access: string, qs = "") =>
    request(app)
      .get(`/api/v1/job/getadminjobs${qs}`)
      .set("Cookie", [`jp_recruiter_at=${access}`]);

  beforeEach(async () => {
    installCaptureMailer();
    await Company.init();
    await Job.init();
    owner = await recruiterWithCompany("owner@example.com");
    rival = await recruiterWithCompany("rival@example.com");
  });

  it("narrows the owned set by a title keyword", async () => {
    await post(owner, "React Engineer");
    await post(owner, "Go Engineer");
    const res = await list(owner.access, "?keyword=react");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].title).toBe("React Engineer");
  });

  it("matches the description too", async () => {
    await post(owner, "Engineer One", "We use Kubernetes heavily");
    await post(owner, "Engineer Two", "Plain web work");
    const res = await list(owner.access, "?keyword=kubernetes");
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].title).toBe("Engineer One");
  });

  it("returns an empty set rather than everything when nothing matches", async () => {
    await post(owner, "React Engineer");
    const res = await list(owner.access, "?keyword=cobol");
    expect(res.body.total).toBe(0);
    expect(res.body.items).toEqual([]);
  });

  it("treats a regex metacharacter as a literal", async () => {
    // The escapeRegex assertion. Unescaped, `.*` is a pattern matching both
    // jobs; escaped it is a two-character literal in exactly one title. This is
    // the test that fails open if the escapeRegex call is ever dropped.
    await post(owner, "Literal .* match");
    await post(owner, "Ordinary title");
    const res = await list(owner.access, `?keyword=${encodeURIComponent(".*")}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].title).toBe("Literal .* match");
  });

  it("is inert against a catastrophically backtracking pattern", async () => {
    await post(owner, "Ordinary title");
    const res = await list(owner.access, `?keyword=${encodeURIComponent("(a+)+$")}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  it("never widens past ownership", async () => {
    // The keyword matches the rival's job. Ownership must still exclude it —
    // a keyword can only ever narrow a set the caller already owns.
    await post(rival, "React Engineer");
    await post(owner, "Go Engineer");
    const res = await list(owner.access, "?keyword=react");
    expect(res.body.total).toBe(0);
  });

  it("lists everything for an empty keyword", async () => {
    await post(owner, "One");
    await post(owner, "Two");
    const res = await list(owner.access);
    expect(res.body.total).toBe(2);
  });

  it("keeps the pagination envelope while filtering", async () => {
    for (let i = 0; i < 3; i++) await post(owner, `React ${i}`);
    const res = await list(owner.access, "?keyword=react&limit=2");
    expect(res.body).toMatchObject({ success: true, total: 3, page: 1, pages: 2 });
    expect(res.body.items).toHaveLength(2);

    const second = await list(owner.access, "?keyword=react&limit=2&page=2");
    expect(second.body.items).toHaveLength(1);
    expect(second.body.page).toBe(2);
  });

  describe("authorization matrix", () => {
    it("401s an anonymous caller", async () => {
      const res = await request(app).get("/api/v1/job/getadminjobs?keyword=react");
      expect(res.status).toBe(401);
    });

    it("401s a seeker", async () => {
      const seeker = await signedUpOn("seeker", "seeker@example.com");
      const res = await request(app)
        .get("/api/v1/job/getadminjobs?keyword=react")
        .set("Cookie", [`jp_seeker_at=${seeker.access}`]);
      expect(res.status).toBe(401);
    });

    it("gives an unrelated recruiter their own empty set, not a 403", async () => {
      await post(owner, "React Engineer");
      const res = await list(rival.access, "?keyword=react");
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(0);
    });

    it("gives the owner their own rows", async () => {
      await post(owner, "React Engineer");
      const res = await list(owner.access, "?keyword=react");
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
    });
  });
});
