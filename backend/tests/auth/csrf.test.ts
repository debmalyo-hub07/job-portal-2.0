import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { AppError } from "../../src/lib/AppError.js";
import { csrfCookieName } from "../../src/lib/cookies.js";
import { mintCsrfToken } from "../../src/lib/csrfToken.js";
import { csrfProtection } from "../../src/middleware/csrf.js";

function harness(): Express {
  const app = express();
  app.use(cookieParser());
  app.get("/x", csrfProtection, (_req, res) => res.json({ ok: true }));
  app.post("/x", csrfProtection, (_req, res) => res.json({ ok: true }));
  app.use((err: unknown, _q: express.Request, res: express.Response, _n: express.NextFunction) => {
    const status = err instanceof AppError ? err.statusCode : 500;
    const code = err instanceof AppError ? err.code : "INTERNAL";
    res.status(status).json({ code });
  });
  return app;
}

/**
 * Resolved lazily inside each test, NOT at module scope.
 *
 * `csrfCookieName()` calls `env()`, and at module-evaluation time
 * `tests/setup.ts` has not yet populated `process.env` — so a top-level
 * `const COOKIE = csrfCookieName()` throws during collection. Vitest reports
 * that as "no tests" rather than as a failure, which means the whole file
 * silently does nothing while the suite still reports green.
 */
function cookieName(): string {
  return csrfCookieName();
}

describe("csrfProtection", () => {
  it("lets safe methods through with no token at all", async () => {
    // GET/HEAD/OPTIONS cannot change state, and requiring a token on them would
    // break every plain navigation.
    expect((await request(harness()).get("/x")).status).toBe(200);
  });

  it("rejects an unsafe method with neither cookie nor header", async () => {
    const res = await request(harness()).post("/x");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CSRF_INVALID");
  });

  it("rejects cookie without header", async () => {
    const token = mintCsrfToken();
    const res = await request(harness()).post("/x").set("Cookie", [`${cookieName()}=${token}`]);
    expect(res.status).toBe(403);
  });

  it("rejects header without cookie", async () => {
    const res = await request(harness()).post("/x").set("X-CSRF-Token", mintCsrfToken());
    expect(res.status).toBe(403);
  });

  it("accepts a matching pair with a valid MAC", async () => {
    const token = mintCsrfToken();
    const res = await request(harness())
      .post("/x")
      .set("Cookie", [`${cookieName()}=${token}`])
      .set("X-CSRF-Token", token);
    expect(res.status).toBe(200);
  });

  it("rejects a matching pair whose MAC is forged", async () => {
    // THE case that separates this from plain double-submit. An attacker who can
    // write a cookie on the domain (an insecure sibling origin, a compromised
    // subdomain) can also send a matching header — plain double-submit accepts
    // that. Only the MAC stops it. If this passes, verifyCsrfToken is not being
    // called before the equality check.
    const forged = "attacker-chosen-nonce.attacker-chosen-mac";
    const res = await request(harness())
      .post("/x")
      .set("Cookie", [`${cookieName()}=${forged}`])
      .set("X-CSRF-Token", forged);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CSRF_INVALID");
  });

  it("rejects a valid cookie paired with a different valid token", async () => {
    // Both halves individually verify; they are not the same token. This is what
    // stops an attacker replaying a token harvested from their own session.
    const res = await request(harness())
      .post("/x")
      .set("Cookie", [`${cookieName()}=${mintCsrfToken()}`])
      .set("X-CSRF-Token", mintCsrfToken());
    expect(res.status).toBe(403);
  });

  it("rejects a token whose nonce was tampered after minting", async () => {
    const token = mintCsrfToken();
    const parts = token.split(".");
    const tampered = `${parts[0]}x.${parts[1]}`;
    const res = await request(harness())
      .post("/x")
      .set("Cookie", [`${cookieName()}=${tampered}`])
      .set("X-CSRF-Token", tampered);
    expect(res.status).toBe(403);
  });
});
