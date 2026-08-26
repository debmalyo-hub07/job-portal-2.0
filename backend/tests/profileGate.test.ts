import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { requireProfileComplete } from "../src/middleware/requireProfileComplete.js";
import { errorHandler } from "../src/middleware/error.js";

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
