import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { Recruiter } from "../../src/models/recruiter.model.js";
import { Seeker } from "../../src/models/seeker.model.js";
import { installCaptureMailer, lastCodeFor, cookieValue } from "./helpers.js";

const app = buildApp();
const PASSWORD = "correct horse battery staple";

async function registerAndVerify(portal: "recruiter" | "seeker", email: string): Promise<void> {
  await request(app)
    .post(`/api/v1/${portal}/auth/register`)
    .send({ fullName: "Pending Rec", email, password: PASSWORD });
  const code = await lastCodeFor(email);
  await request(app).post(`/api/v1/${portal}/auth/verify-email`).send({ email, code });
}

/**
 * Identity and authorization are separate layers. A pending recruiter must be
 * able to authenticate and reach /me — otherwise there is nowhere to tell them
 * why they are blocked — while `requireApproved` refuses the work itself.
 *
 * The suspended cases are the load-bearing half: relaxing these five gates in
 * the permissive direction would admit suspended accounts on every portal at
 * once, so each gate gets a suspended case of its own.
 */
describe("pending recruiters", () => {
  beforeEach(() => installCaptureMailer());

  it("can log in while pending", async () => {
    await registerAndVerify("recruiter", "pending@example.com");
    const res = await request(app)
      .post("/api/v1/recruiter/auth/login")
      .send({ email: "pending@example.com", password: PASSWORD })
      .expect(200);
    expect(cookieValue(res, "jp_recruiter_at")).toBeTruthy();
  });

  it("passes authenticate and reaches /me while pending", async () => {
    await registerAndVerify("recruiter", "pending2@example.com");
    const login = await request(app)
      .post("/api/v1/recruiter/auth/login")
      .send({ email: "pending2@example.com", password: PASSWORD });
    const access = cookieValue(login, "jp_recruiter_at")!;

    await request(app)
      .get("/api/v1/recruiter/auth/me")
      .set("Cookie", [`jp_recruiter_at=${access}`])
      .expect(200);
  });

  it("a suspended account still cannot log in", async () => {
    await registerAndVerify("recruiter", "susp@example.com");
    await Recruiter.updateOne({ email: "susp@example.com" }, { $set: { status: "suspended" } });
    await request(app)
      .post("/api/v1/recruiter/auth/login")
      .send({ email: "susp@example.com", password: PASSWORD })
      .expect(401);
  });

  it("a suspended account's existing token is refused by authenticate", async () => {
    await registerAndVerify("recruiter", "susp2@example.com");
    const login = await request(app)
      .post("/api/v1/recruiter/auth/login")
      .send({ email: "susp2@example.com", password: PASSWORD });
    const access = cookieValue(login, "jp_recruiter_at")!;

    await Recruiter.updateOne({ email: "susp2@example.com" }, { $set: { status: "suspended" } });

    await request(app)
      .get("/api/v1/recruiter/auth/me")
      .set("Cookie", [`jp_recruiter_at=${access}`])
      .expect(401);
  });

  // resolveSession backs authenticateAny/optionalAuthenticate, which are what
  // the public job board uses. A suspended seeker must not resolve there either.
  it("a suspended seeker is not resolved by the optional-auth path", async () => {
    await registerAndVerify("seeker", "susp3@example.com");
    const login = await request(app)
      .post("/api/v1/seeker/auth/login")
      .send({ email: "susp3@example.com", password: PASSWORD });
    const access = cookieValue(login, "jp_seeker_at")!;

    await Seeker.updateOne({ email: "susp3@example.com" }, { $set: { status: "suspended" } });

    await request(app)
      .get("/api/v1/seeker/auth/me")
      .set("Cookie", [`jp_seeker_at=${access}`])
      .expect(401);
  });
});
