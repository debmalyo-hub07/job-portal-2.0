import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import { verifyTurnstile } from "../src/middleware/botProtection.js";
import { enforceHttps } from "../src/middleware/security.js";
import { errorHandler } from "../src/middleware/error.js";
import { signedUpOn, installCaptureMailer } from "./auth/helpers.js";

const app = buildApp();

describe("security hardening", () => {
  beforeEach(() => installCaptureMailer());

  it("requires CSRF for authenticated domain mutations", async () => {
    const recruiter = await signedUpOn("recruiter", "csrf-domain@example.com");

    const rejected = await request(app)
      .post("/api/v1/company/register")
      .set("Cookie", [`jp_recruiter_at=${recruiter.access}`])
      .send({ name: "No Token" });

    expect(rejected.status).toBe(403);
    expect(rejected.body.code).toBe("CSRF_INVALID");

    const accepted = await request(app)
      .post("/api/v1/company/register")
      .set("Cookie", [`jp_recruiter_at=${recruiter.access}`, `jp_csrf=${recruiter.csrf}`])
      .set("X-CSRF-Token", recruiter.csrf)
      .send({ name: "With Token" });

    expect(accepted.status).toBe(201);
  });

  it("fails closed when Turnstile rejects a token", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      verifyTurnstile("bad-token", "127.0.0.1", "server-secret", fetchMock),
    ).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledOnce();
    const body = fetchMock.mock.calls[0]?.[1]?.body;
    expect(String(body)).toContain("response=bad-token");
    expect(String(body)).toContain("secret=server-secret");
  });

  it("rejects a Turnstile token minted for another action", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ success: true, action: "seeker_login" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      verifyTurnstile(
        "valid-token",
        "127.0.0.1",
        "server-secret",
        fetchMock,
        "recruiter_login",
      ),
    ).resolves.toBe(false);
  });

  it("blocks plaintext requests when HTTPS enforcement is enabled", async () => {
    const guarded = express();
    guarded.set("trust proxy", 1);
    guarded.use(enforceHttps(true));
    guarded.get("/", (_req, res) => res.json({ ok: true }));
    guarded.use(errorHandler);

    const plaintext = await request(guarded).get("/");
    expect(plaintext.status).toBe(426);
    expect(plaintext.body.code).toBe("HTTPS_REQUIRED");

    await request(guarded).get("/").set("X-Forwarded-Proto", "https").expect(200);
  });
});
