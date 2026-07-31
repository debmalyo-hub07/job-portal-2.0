import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { errorHandler } from "../src/middleware/error.js";
import { rateLimit } from "../src/middleware/rateLimit.js";
import { InMemoryRateLimitStore } from "../src/lib/rateLimitStore.js";

function appWithLimit(max: number): express.Express {
  const app = express();
  app.get(
    "/limited",
    rateLimit({ windowMs: 60_000, max, store: new InMemoryRateLimitStore() }),
    (_req, res) => {
      res.json({ ok: true });
    },
  );
  app.use(errorHandler);
  return app;
}

describe("rateLimit", () => {
  it("allows requests up to the limit", async () => {
    const app = appWithLimit(3);
    for (let i = 0; i < 3; i += 1) {
      expect((await request(app).get("/limited")).status).toBe(200);
    }
  });

  it("returns 429 once the limit is exceeded", async () => {
    const app = appWithLimit(2);
    await request(app).get("/limited");
    await request(app).get("/limited");
    const res = await request(app).get("/limited");

    expect(res.status).toBe(429);
    expect(res.body.code).toBe("RATE_LIMITED");
  });

  it("sets a Retry-After header on rejection", async () => {
    const app = appWithLimit(1);
    await request(app).get("/limited");
    const res = await request(app).get("/limited");

    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
  });
});

describe("InMemoryRateLimitStore", () => {
  it("starts a fresh window after expiry", async () => {
    const store = new InMemoryRateLimitStore();
    const first = await store.increment("k", 20);
    expect(first.count).toBe(1);

    await new Promise((resolve) => setTimeout(resolve, 30));

    const second = await store.increment("k", 20);
    expect(second.count).toBe(1);
  });
});
