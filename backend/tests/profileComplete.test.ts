import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { accountModel } from "../src/services/account.service.js";
import { asSession, installCaptureMailer, signedUpOn } from "./auth/helpers.js";

const app = buildApp();

/** `signedUpOn` sets a date of birth; this endpoint is about supplying one. */
async function incompleteSeeker(email: string) {
  const session = await signedUpOn("seeker", email);
  await accountModel("seeker").updateOne({ email }, { $set: { dob: null } });
  return session;
}

describe("POST /user/profile/complete", () => {
  beforeEach(() => installCaptureMailer());

  it("stores the date of birth and clears the gate", async () => {
    const email = "complete-ok@example.com";
    const session = await incompleteSeeker(email);
    const res = await request(app)
      .post("/api/v1/user/profile/complete")
      .use(asSession("seeker", session))
      .send({ dob: "1995-03-20", phone: "+919876543210", gender: "female" });

    expect(res.status).toBe(200);
    expect(res.body.profile.dob).toBe("1995-03-20");
    expect(res.body.profile.gender).toBe("female");
    expect(res.body.profile.phone).toBe("+919876543210");
    expect(res.body.profile.user.profileComplete).toBe(true);
  });

  it("stores the date at UTC midnight, not local midnight", async () => {
    const email = "complete-utc@example.com";
    const session = await incompleteSeeker(email);
    await request(app)
      .post("/api/v1/user/profile/complete")
      .use(asSession("seeker", session))
      .send({ dob: "1995-03-20" });

    const row = await accountModel("seeker").findOne({ email }).select("dob").lean();
    expect((row?.dob as Date).toISOString()).toBe("1995-03-20T00:00:00.000Z");
  });

  it("requires a date of birth", async () => {
    // The reason this endpoint exists instead of reusing /profile/update, whose
    // every field is optional: an empty body there would 200 and loop the user
    // back to the gate with no error to render.
    const session = await incompleteSeeker("complete-empty@example.com");
    const res = await request(app)
      .post("/api/v1/user/profile/complete")
      .use(asSession("seeker", session))
      .send({});
    expect(res.status).toBe(400);
  });

  it("refuses an under-age date of birth", async () => {
    const session = await incompleteSeeker("complete-minor@example.com");
    const res = await request(app)
      .post("/api/v1/user/profile/complete")
      .use(asSession("seeker", session))
      .send({ dob: "2015-01-01" });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("18 or over");
  });

  it("leaves the date of birth untouched when validation fails", async () => {
    // A partial write here would be the worst outcome: the gate opens on a
    // value the schema refused.
    const email = "complete-atomic@example.com";
    const session = await incompleteSeeker(email);
    await request(app)
      .post("/api/v1/user/profile/complete")
      .use(asSession("seeker", session))
      .send({ dob: "1995-03-20", phone: "9876543210" });

    const row = await accountModel("seeker").findOne({ email }).select("dob").lean();
    expect(row?.dob).toBeNull();
  });

  it("rejects an unknown field", async () => {
    const session = await incompleteSeeker("complete-strict@example.com");
    const res = await request(app)
      .post("/api/v1/user/profile/complete")
      .use(asSession("seeker", session))
      .send({ dob: "1995-03-20", isAdmin: true });
    expect(res.status).toBe(400);
  });

  it("works for a recruiter too", async () => {
    const email = "complete-rec@example.com";
    const session = await signedUpOn("recruiter", email);
    await accountModel("recruiter").updateOne({ email }, { $set: { dob: null } });
    const res = await request(app)
      .post("/api/v1/user/profile/complete")
      .use(asSession("recruiter", session))
      .send({ dob: "1990-01-15" });
    expect(res.status).toBe(200);
  });

  it("refuses an anonymous caller", async () => {
    const res = await request(app)
      .post("/api/v1/user/profile/complete")
      .send({ dob: "1995-03-20" });
    expect(res.status).toBe(401);
  });
});
