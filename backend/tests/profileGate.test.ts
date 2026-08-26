import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { requireProfileComplete } from "../src/middleware/requireProfileComplete.js";
import { errorHandler } from "../src/middleware/error.js";
import { buildApp } from "../src/app.js";
import { accountModel } from "../src/services/account.service.js";
import { asSession, installCaptureMailer, signedUpOn } from "./auth/helpers.js";

/** Mounts the gate behind a stub that plants whatever `req.auth` the case needs. */
function appWithAuth(auth: unknown) {
  const app = express();
  app.get(
    "/gated",
    (req, _res, next) => {
      if (auth) (req as { auth?: unknown }).auth = auth;
      next();
    },
    requireProfileComplete,
    (_req, res) => res.status(200).json({ ok: true }),
  );
  app.use(errorHandler);
  return app;
}

describe("requireProfileComplete", () => {
  it("passes a complete session through", async () => {
    const res = await request(
      appWithAuth({ id: "a", portal: "seeker", emailVerified: true, profileComplete: true }),
    ).get("/gated");
    expect(res.status).toBe(200);
  });

  it("refuses an incomplete session with 403 PROFILE_INCOMPLETE", async () => {
    const res = await request(
      appWithAuth({ id: "a", portal: "seeker", emailVerified: true, profileComplete: false }),
    ).get("/gated");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PROFILE_INCOMPLETE");
  });

  it("refuses a session missing the flag entirely rather than admitting it", async () => {
    // Fail-closed. An authenticator that forgot to set the field would hand us
    // undefined, and reading that as "complete" would silently disable the gate
    // on exactly the routes that mounted it.
    const res = await request(
      appWithAuth({ id: "a", portal: "seeker", emailVerified: true }),
    ).get("/gated");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PROFILE_INCOMPLETE");
  });

  it("answers 401 when there is no session at all", async () => {
    // Same shape as requireVerified: a missing session is an auth problem, not
    // an incomplete-profile problem, and must not be reported as one.
    const res = await request(appWithAuth(null)).get("/gated");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("SESSION_MISSING");
  });
});

/**
 * `signedUpOn` gives every account a date of birth, because dozens of unrelated
 * suites use it and would otherwise be asserting this gate by accident. The
 * suite that covers the gate is this one, so it clears the field back to null
 * itself — explicitly, per account, so each case says what state it is testing.
 */
async function withoutDob(portal: "seeker" | "recruiter", email: string): Promise<void> {
  await accountModel(portal).updateOne({ email }, { $set: { dob: null } });
}

describe("the gate on real routes", () => {
  const app = buildApp();
  beforeEach(() => installCaptureMailer());

  it("refuses an application from a seeker with no date of birth", async () => {
    const session = await signedUpOn("seeker", "gate-apply@example.com");
    await withoutDob("seeker", "gate-apply@example.com");
    const res = await request(app)
      .post("/api/v1/application/apply/6a8dbf44bd3d99c3e9416b2a")
      .use(asSession("seeker", session));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PROFILE_INCOMPLETE");
  });

  it("stops refusing once the date of birth is set", async () => {
    const session = await signedUpOn("seeker", "gate-apply-ok@example.com");
    const res = await request(app)
      .post("/api/v1/application/apply/6a8dbf44bd3d99c3e9416b2a")
      .use(asSession("seeker", session));
    // 404 for the nonexistent job — past the gate, which is the assertion.
    expect(res.status).not.toBe(403);
  });

  it("refuses a recruiter posting a job with no date of birth", async () => {
    const session = await signedUpOn("recruiter", "gate-post@example.com");
    await withoutDob("recruiter", "gate-post@example.com");
    const res = await request(app)
      .post("/api/v1/job/post")
      .use(asSession("recruiter", session))
      .send({ title: "T" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PROFILE_INCOMPLETE");
  });

  it("refuses a recruiter registering a company with no date of birth", async () => {
    const session = await signedUpOn("recruiter", "gate-company@example.com");
    await withoutDob("recruiter", "gate-company@example.com");
    const res = await request(app)
      .post("/api/v1/company/register")
      .use(asSession("recruiter", session))
      .send({ companyName: "C" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PROFILE_INCOMPLETE");
  });

  it("refuses an approved recruiter on approval grounds first", async () => {
    // Order inside the chain, asserted: a pending recruiter must hear about
    // approval, not about a birth date. Reversing the two middlewares would
    // send someone to fill in a form that was never what blocked them.
    const session = await signedUpOn("recruiter", "gate-pending@example.com", {
      approved: false,
    });
    await withoutDob("recruiter", "gate-pending@example.com");
    const res = await request(app)
      .post("/api/v1/job/post")
      .use(asSession("recruiter", session))
      .send({ title: "T" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("RECRUITER_PENDING_APPROVAL");
  });

  it("leaves the routes that clear the gate reachable", async () => {
    // The requireVerified trap, asserted rather than assumed: a gate that
    // blocks the fix is a lockout.
    const session = await signedUpOn("seeker", "gate-open@example.com");
    await withoutDob("seeker", "gate-open@example.com");
    const profile = await request(app)
      .get("/api/v1/user/profile")
      .use(asSession("seeker", session));
    expect(profile.status).toBe(200);
    const me = await request(app)
      .get("/api/v1/seeker/auth/me")
      .use(asSession("seeker", session));
    expect(me.status).toBe(200);
    expect(me.body.user.profileComplete).toBe(false);
  });

  it("leaves the public job board open to an incomplete session", async () => {
    const session = await signedUpOn("seeker", "gate-board@example.com");
    await withoutDob("seeker", "gate-board@example.com");
    const res = await request(app)
      .get("/api/v1/job/get")
      .use(asSession("seeker", session));
    expect(res.status).toBe(200);
  });

  it("leaves a seeker able to withdraw an application", async () => {
    // Withdrawing undoes something already done. Gating it would trap someone
    // in a commitment they made before the field existed.
    const session = await signedUpOn("seeker", "gate-withdraw@example.com");
    await withoutDob("seeker", "gate-withdraw@example.com");
    const res = await request(app)
      .post("/api/v1/application/6a8dbf44bd3d99c3e9416b2a/withdraw")
      .use(asSession("seeker", session));
    expect(res.status).not.toBe(403);
  });
});
