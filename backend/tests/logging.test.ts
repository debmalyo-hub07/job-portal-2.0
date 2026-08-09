import express from "express";
import pino from "pino";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { AppError } from "../src/lib/AppError.js";
import { buildHttpLogger } from "../src/lib/httpLogger.js";
import { errorHandler } from "../src/middleware/error.js";
import { notFound } from "../src/middleware/notFound.js";
import { requestId } from "../src/middleware/requestId.js";

type Record_ = Record<string, unknown>;

/**
 * Builds an app wired exactly as `buildApp()` wires these pieces, but with a
 * logger writing into an array so the emitted records can be asserted on. The
 * test harness forces NODE_ENV=test, which makes the real logger silent —
 * capturing its output would otherwise be impossible.
 */
function appWithCapture(options: { logHttp?: "summary" | "all" | "off"; level?: string } = {}) {
  const records: Record_[] = [];
  const stream = {
    write(line: string) {
      records.push(JSON.parse(line) as Record_);
    },
  };
  const logger = pino({ level: options.level ?? "info" }, stream);

  const app = express();
  app.use(requestId);
  app.use(buildHttpLogger(logger, options.logHttp ?? "summary"));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.get("/ok", (_req, res) => {
    res.json({ success: true });
  });
  app.get("/app-error", () => {
    throw new AppError(403, "RECRUITER_PENDING_APPROVAL", "Awaiting approval");
  });
  app.get("/boom", () => {
    throw new Error("unhandled failure");
  });
  app.use(notFound);
  app.use(errorHandler);

  return { app, records };
}

describe("http request logging", () => {
  it("emits exactly one record per request", async () => {
    const { app, records } = appWithCapture();
    await request(app).get("/ok").expect(200);
    expect(records).toHaveLength(1);
  });

  it("serializes no request or response headers", async () => {
    // The regression guard. The default pino-http serializers dumped every
    // Helmet response header on every request — 44 lines for one call, which is
    // what made the dev log unreadable.
    const { app, records } = appWithCapture();
    await request(app).get("/ok").expect(200);

    const record = records[0] as { req?: Record_; res?: Record_ };
    expect(record.req).toBeDefined();
    expect(record.req).not.toHaveProperty("headers");
    expect(record.res).not.toHaveProperty("headers");
  });

  it("records method, url, status and a correlation id", async () => {
    const { app, records } = appWithCapture();
    await request(app).get("/ok").expect(200);

    const record = records[0] as { req: Record_; res: Record_ };
    expect(record.req.method).toBe("GET");
    expect(record.req.url).toBe("/ok");
    expect(record.res.statusCode).toBe(200);
    expect(String(record.req.id ?? "")).not.toBe("");
  });

  describe("log level follows status class", () => {
    it("logs a 2xx at info", async () => {
      const { app, records } = appWithCapture();
      await request(app).get("/ok").expect(200);
      expect(records[0]!.level).toBe(30);
    });

    it("logs a 4xx at warn", async () => {
      const { app, records } = appWithCapture();
      await request(app).get("/nope").expect(404);
      expect(records[0]!.level).toBe(40);
    });

    it("logs a 5xx at error", async () => {
      const { app, records } = appWithCapture();
      await request(app).get("/boom").expect(500);
      // The unhandled-error path also logs a stack trace; the request summary is
      // the record carrying a res, and it must be error level.
      const summary = records.find((r) => "res" in r) as { level: number };
      expect(summary.level).toBe(50);
    });
  });

  it("surfaces an AppError code on the request line", async () => {
    // errorHandler answers an AppError without logging it, so without this the
    // log shows a 403 and no indication of which rule refused.
    const { app, records } = appWithCapture();
    await request(app).get("/app-error").expect(403);

    const summary = records.find((r) => "res" in r) as Record_;
    expect(summary.errorCode).toBe("RECRUITER_PENDING_APPROVAL");
  });

  it("never emits a cookie value", async () => {
    // The assertion that matters most. A future serializer change that
    // reintroduces headers turns the log aggregator into a session-token store.
    const { app, records } = appWithCapture({ level: "debug" });
    await request(app)
      .get("/ok")
      .set("Cookie", ["jp_seeker_at=super-secret-token-value"])
      .expect(200);

    expect(JSON.stringify(records)).not.toContain("super-secret-token-value");
  });

  describe("health-check suppression", () => {
    it("skips /health under summary", async () => {
      const { app, records } = appWithCapture({ logHttp: "summary" });
      await request(app).get("/health").expect(200);
      expect(records).toHaveLength(0);
    });

    it("logs /health under all", async () => {
      const { app, records } = appWithCapture({ logHttp: "all" });
      await request(app).get("/health").expect(200);
      expect(records).toHaveLength(1);
    });

    it("logs nothing under off", async () => {
      const { app, records } = appWithCapture({ logHttp: "off" });
      await request(app).get("/ok").expect(200);
      expect(records).toHaveLength(0);
    });
  });

  it("app.ts wires the shared http logger rather than a bare pinoHttp", () => {
    // These tests compose the middleware the way app.ts does. That is only
    // meaningful if app.ts actually uses the same builder.
    const source = readFileSync(resolve(__dirname, "../src/app.ts"), "utf8");
    expect(source).toMatch(/buildHttpLogger/);
    expect(source).not.toMatch(/pinoHttp\(\{/);
  });
});
