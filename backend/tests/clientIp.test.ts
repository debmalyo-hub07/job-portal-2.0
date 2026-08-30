import express, { type Express, type RequestHandler } from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * `trustedClientIp` exists because `app.set("trust proxy", 1)` cannot span two
 * hops, and the web origin's `/api` proxy is the second one. These tests pin
 * the contract that keeps a proxied deployment both honest and safe:
 *
 *   - a claim presented WITH the shared secret is believed, and only then
 *   - an absent secret, a wrong key, or a non-address claim changes nothing
 *   - the two headers are stripped on every path, honoured or not, so nothing
 *     downstream (the request logger above all) can mistake them for the
 *     client's own words.
 *
 * The middleware reads `env()` at request time and `env()` caches on first
 * read, so each test takes a fresh module registry and configures the secret
 * as present or absent before the first request it makes. That is the same
 * isolation vitest applies between files; here it is per test, on purpose.
 */
const CLIENT_IP_HEADER = "x-cairn-client-ip";
const PROXY_KEY_HEADER = "x-cairn-proxy-key";

const SECRET = "proxy-shared-secret-at-least-32-chars";

/** A fresh `trustedClientIp()` whose `env()` has not cached yet. */
async function freshMiddleware(withSecret: boolean): Promise<RequestHandler> {
  vi.resetModules();
  if (withSecret) process.env.PROXY_SHARED_SECRET = SECRET;
  else delete process.env.PROXY_SHARED_SECRET;
  const { trustedClientIp } = await import("../src/middleware/clientIp.js");
  return trustedClientIp() as RequestHandler;
}

/** An app that answers with exactly what the rest of the API would see. */
function appWith(middleware: RequestHandler): Express {
  const app = express();
  app.use(middleware);
  app.get("/ip", (req, res) => {
    res.json({
      ip: req.ip,
      leakedIp: req.headers[CLIENT_IP_HEADER] ?? null,
      leakedKey: req.headers[PROXY_KEY_HEADER] ?? null,
    });
  });
  return app;
}

/** The address a request with no claim at all resolves to, in this environment. */
async function unclaimedAddress(middleware: RequestHandler): Promise<string | null> {
  const res = await request(appWith(middleware)).get("/ip");
  return res.body.ip;
}

afterEach(() => {
  delete process.env.PROXY_SHARED_SECRET;
});

describe("trustedClientIp", () => {
  it("believes a keyed claim and restores the browser's address", async () => {
    const middleware = await freshMiddleware(true);
    const res = await request(appWith(middleware))
      .get("/ip")
      .set(CLIENT_IP_HEADER, "203.0.113.7")
      .set(PROXY_KEY_HEADER, SECRET);

    expect(res.body.ip).toBe("203.0.113.7");
    // Stripped even here: the claim was consumed, not passed along for a
    // logger or handler to re-read as fact.
    expect(res.body.leakedIp).toBeNull();
    expect(res.body.leakedKey).toBeNull();
  });

  it("believes an IPv6 claim too — isIP decides, not a regex", async () => {
    const middleware = await freshMiddleware(true);
    const res = await request(appWith(middleware))
      .get("/ip")
      .set(CLIENT_IP_HEADER, "2001:db8::1")
      .set(PROXY_KEY_HEADER, SECRET);

    expect(res.body.ip).toBe("2001:db8::1");
  });

  it("ignores a claim presented without the key", async () => {
    const middleware = await freshMiddleware(true);
    const baseline = await unclaimedAddress(middleware);
    const res = await request(appWith(middleware))
      .get("/ip")
      .set(CLIENT_IP_HEADER, "203.0.113.7");

    expect(res.body.ip).toBe(baseline);
    expect(res.body.leakedIp).toBeNull();
  });

  it("ignores a claim presented under a wrong key", async () => {
    const middleware = await freshMiddleware(true);
    const baseline = await unclaimedAddress(middleware);
    const res = await request(appWith(middleware))
      .get("/ip")
      .set(CLIENT_IP_HEADER, "203.0.113.7")
      .set(PROXY_KEY_HEADER, `${SECRET}-but-wrong`);

    expect(res.body.ip).toBe(baseline);
    expect(res.body.leakedIp).toBeNull();
    // A rejected claim still cannot hand its key to anything downstream.
    expect(res.body.leakedKey).toBeNull();
  });

  it("ignores a claim that is not an address, whatever the key", async () => {
    // req.ip reaches rate-limit keys, the request log and the session audit
    // row — a believed non-address is chosen text written into all three.
    const middleware = await freshMiddleware(true);
    const baseline = await unclaimedAddress(middleware);
    const res = await request(appWith(middleware))
      .get("/ip")
      .set(CLIENT_IP_HEADER, "definitely-not-an-ip")
      .set(PROXY_KEY_HEADER, SECRET);

    expect(res.body.ip).toBe(baseline);
    expect(res.body.leakedIp).toBeNull();
  });

  it("believes nothing while no secret is configured", async () => {
    // The pre-cutover default, and the state any environment left behind lands
    // in: with no secret on the API, even a correctly spelled key cannot
    // authenticate the claim, and req.ip keeps the address trust proxy derived.
    const middleware = await freshMiddleware(false);
    const baseline = await unclaimedAddress(middleware);
    const res = await request(appWith(middleware))
      .get("/ip")
      .set(CLIENT_IP_HEADER, "203.0.113.7")
      .set(PROXY_KEY_HEADER, SECRET);

    expect(res.body.ip).toBe(baseline);
    expect(res.body.leakedIp).toBeNull();
    expect(res.body.leakedKey).toBeNull();
  });
});
