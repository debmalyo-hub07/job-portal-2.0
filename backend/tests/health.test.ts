import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("GET /health", () => {
  it("reports ok with a connected database", async () => {
    const res = await request(buildApp()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.db).toBe("connected");
    expect(typeof res.body.uptime).toBe("number");
  });

  it("also serves the check under /api/v1, where the browser can reach it", async () => {
    // The bare /health sits outside the /api/* prefix the web origin's proxy
    // forwards, so it is unreachable from a browser in the same-origin
    // topology. The sign-in pages wake a sleeping instance through this mount.
    const res = await request(buildApp()).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.db).toBe("connected");
  });
});

describe("unknown routes", () => {
  it("returns a 404 envelope rather than Express HTML", async () => {
    const res = await request(buildApp()).get("/api/v1/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe("NOT_FOUND");
  });
});
