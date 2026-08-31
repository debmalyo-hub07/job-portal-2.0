// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import proxy from "../proxy.js";

/**
 * The proxy is the load-bearing piece of the same-origin topology: every
 * browser API request and every session cookie crosses it. These tests pin
 * its forwarding contract and — the security-relevant half — the header
 * hygiene around the client-IP claim:
 *
 *   - a caller's own `x-cairn-*` headers never survive, whoever sent them
 *   - the claim is injected only when this function holds BOTH the shared
 *     secret and an address to name
 *   - a request it cannot forward (no valid origin) fails loudly rather than
 *     being passed somewhere arbitrary
 *   - the API is always asked for an UNCOMPRESSED response, because a
 *     compressed one comes back decoded with stale compression headers
 *     attached — a body/label mismatch every browser rejects
 *     (net::ERR_CONTENT_DECODING_FAILED) and curl never notices, which is
 *     how it reached production through a fully green probe suite.
 *
 * Runs in jsdom only because the suite's shared setup file needs a window;
 * everything this file exercises is Node's own Request/Response/fetch, which
 * is closer to the function's Vercel runtime than jsdom's approximations
 * would be if it reimplemented any of them.
 */
const CLIENT_IP_HEADER = "x-cairn-client-ip";
const PROXY_KEY_HEADER = "x-cairn-proxy-key";
const SECRET = "proxy-shared-secret-at-least-32-chars";

function pageRequest(path: string, init?: RequestInit): Request {
  return new Request(`https://web.example.test${path}`, init);
}

/** Installs a fetch stub returning a trivial JSON response. */
function stubFetch(): ReturnType<typeof vi.fn> {
  const mock = vi.fn(
    async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

afterEach(() => {
  delete process.env.API_PROXY_ORIGIN;
  delete process.env.PROXY_SHARED_SECRET;
  vi.unstubAllGlobals();
});

describe("the /api proxy", () => {
  it("ignores paths outside /api, leaving them to the SPA's own routes", async () => {
    process.env.API_PROXY_ORIGIN = "https://api.example.test";
    stubFetch();

    const result = await proxy(pageRequest("/jobs?q=dev"));

    expect(result).toBeUndefined();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("answers 503 with a named code when no valid origin is configured", async () => {
    stubFetch();
    process.env.API_PROXY_ORIGIN = "";

    const response = (await proxy(pageRequest("/api/v1/job/get"))) as Response;

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: "API_PROXY_MISCONFIGURED",
    });
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it.each([
    ["plain HTTP", "http://api.example.test"],
    ["a path", "https://api.example.test/api"],
    ["a query", "https://api.example.test/?x=1"],
    ["credentials", "https://user:pass@api.example.test"],
  ])("refuses an origin carrying %s", async (_reason, origin) => {
    stubFetch();
    process.env.API_PROXY_ORIGIN = origin;

    const response = (await proxy(pageRequest("/api/v1/job/get"))) as Response;

    expect(response.status).toBe(503);
  });

  it("forwards the request verbatim: path, query, method, manual redirects", async () => {
    process.env.API_PROXY_ORIGIN = "https://api.example.test";
    const mock = stubFetch();

    await proxy(
      pageRequest("/api/v1/seeker/auth/google/start?portal=seeker", { method: "POST" }),
    );

    const [target, init] = mock.mock.calls[0] as [URL, RequestInit];
    expect(target.toString()).toBe(
      "https://api.example.test/api/v1/seeker/auth/google/start?portal=seeker",
    );
    expect(init.method).toBe("POST");
    // Manual so a 302 from the API reaches the BROWSER, which is what follows
    // it; an automatic follow would consume the redirect inside this function
    // and hand the page the wrong document.
    expect(init.redirect).toBe("manual");
  });

  it("asks the API for an uncompressed response, whatever the browser accepts", async () => {
    // Measured against production: forwarding the browser's Accept-Encoding
    // got the API's brotli response decoded by fetch but returned with the
    // compression-era Content-Encoding and Content-Length still attached, so
    // real browsers failed every API call with ERR_CONTENT_DECODING_FAILED
    // while curl — which never sends the header — saw clean JSON. The header
    // must be SET, not deleted: fetch re-adds `gzip, deflate` when it is
    // merely absent.
    process.env.API_PROXY_ORIGIN = "https://api.example.test";
    const mock = stubFetch();

    await proxy(
      pageRequest("/api/v1/job/get", {
        headers: { "accept-encoding": "gzip, deflate, br, zstd" },
      }),
    );

    const [, init] = mock.mock.calls[0] as [URL, RequestInit];
    expect((init.headers as Headers).get("accept-encoding")).toBe("identity");
  });

  it("deletes a caller-supplied client-IP claim and key before forwarding", async () => {
    process.env.API_PROXY_ORIGIN = "https://api.example.test";
    // No secret configured: nothing this function could add back.
    delete process.env.PROXY_SHARED_SECRET;
    const mock = stubFetch();

    await proxy(
      pageRequest("/api/v1/job/get", {
        headers: {
          [CLIENT_IP_HEADER]: "6.6.6.6",
          [PROXY_KEY_HEADER]: "forged-key",
        },
      }),
    );

    const [, init] = mock.mock.calls[0] as [URL, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get(CLIENT_IP_HEADER)).toBeNull();
    expect(headers.get(PROXY_KEY_HEADER)).toBeNull();
  });

  it("presents the browser's address with the key, from the head of the chain", async () => {
    process.env.API_PROXY_ORIGIN = "https://api.example.test";
    process.env.PROXY_SHARED_SECRET = SECRET;
    const mock = stubFetch();

    await proxy(
      pageRequest("/api/v1/seeker/auth/login", {
        method: "POST",
        headers: {
          // Edge-appended chain: the client first, infrastructure after.
          "x-forwarded-for": "198.51.100.9, 10.0.0.1",
          // A browser could send its own claim; it must not survive to compete
          // with the one this function derives.
          [CLIENT_IP_HEADER]: "6.6.6.6",
          [PROXY_KEY_HEADER]: "forged-key",
        },
      }),
    );

    const [, init] = mock.mock.calls[0] as [URL, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get(CLIENT_IP_HEADER)).toBe("198.51.100.9");
    expect(headers.get(PROXY_KEY_HEADER)).toBe(SECRET);
  });

  it("falls back to x-real-ip when the chain is absent", async () => {
    process.env.API_PROXY_ORIGIN = "https://api.example.test";
    process.env.PROXY_SHARED_SECRET = SECRET;
    const mock = stubFetch();

    await proxy(
      pageRequest("/api/v1/job/get", { headers: { "x-real-ip": "203.0.113.4" } }),
    );

    const [, init] = mock.mock.calls[0] as [URL, RequestInit];
    expect((init.headers as Headers).get(CLIENT_IP_HEADER)).toBe("203.0.113.4");
  });

  it("makes no claim when it holds no address to name, even with the key", async () => {
    process.env.API_PROXY_ORIGIN = "https://api.example.test";
    process.env.PROXY_SHARED_SECRET = SECRET;
    const mock = stubFetch();

    await proxy(pageRequest("/api/v1/job/get"));

    const [, init] = mock.mock.calls[0] as [URL, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get(CLIENT_IP_HEADER)).toBeNull();
    expect(headers.get(PROXY_KEY_HEADER)).toBeNull();
  });

  it("makes no claim without the shared secret, whatever the request says", async () => {
    process.env.API_PROXY_ORIGIN = "https://api.example.test";
    delete process.env.PROXY_SHARED_SECRET;
    const mock = stubFetch();

    await proxy(
      pageRequest("/api/v1/job/get", { headers: { "x-forwarded-for": "198.51.100.9" } }),
    );

    const [, init] = mock.mock.calls[0] as [URL, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get(CLIENT_IP_HEADER)).toBeNull();
    expect(headers.get(PROXY_KEY_HEADER)).toBeNull();
  });
});
