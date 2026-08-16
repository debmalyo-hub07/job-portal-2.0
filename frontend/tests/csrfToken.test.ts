import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient, setCsrfToken } from "@/lib/apiClient";

/**
 * The CSRF token travels in memory, never read back from `document.cookie`.
 *
 * The version this replaces called `readCsrfToken()`, which matched the cookie
 * out of `document.cookie`. That works same-origin and fails silently
 * cross-site: with the web app on `*.vercel.app` and the API on
 * `*.onrender.com`, the browser stores `__Host-jp_csrf` and sends it on
 * requests, but withholds it from `document.cookie` regardless of `httpOnly`.
 * Measured against production — three cookies stored, `document.cookie` empty.
 *
 * So every mutation went out with no `X-CSRF-Token` and answered 403. It looked
 * like the session logging itself out after a quarter of an hour: reads were
 * unaffected while the access token lived, then `/refresh` — a POST — 403'd, and
 * `apiClient` only recovers 401s, so there was no way back. Every write in the
 * app was equally broken; approving a recruiter and posting a job simply had
 * fewer people trying them.
 *
 * jsdom cannot reproduce the withholding — it has no notion of site boundaries
 * and happily returns whatever was assigned to `document.cookie`. So these
 * assert the *mechanism* that survives it: the header comes from the value the
 * server sent in the body, and it is still attached when the cookie jar is
 * empty. A test that seeded `document.cookie` and asserted the header would
 * have passed throughout the entire outage.
 */
describe("CSRF token handling", () => {
  beforeEach(() => {
    setCsrfToken("seeker", null);
    setCsrfToken("recruiter", null);
    setCsrfToken("admin", null);
    // Empty, exactly as a cross-site browser presents it.
    Object.defineProperty(document, "cookie", { value: "", writable: true, configurable: true });
  });

  afterEach(() => {
    setCsrfToken("seeker", null);
    setCsrfToken("recruiter", null);
    setCsrfToken("admin", null);
    vi.restoreAllMocks();
  });

  /** Runs the request interceptor without a network call. */
  async function headersFor(method: string, url = "/seeker/auth/logout") {
    const handlers = apiClient.interceptors.request as unknown as {
      handlers: { fulfilled: (c: unknown) => unknown }[];
    };
    let config: Record<string, unknown> = {
      method,
      url,
      headers: new (await import("axios")).AxiosHeaders(),
    };
    for (const h of handlers.handlers) {
      if (h?.fulfilled) config = (await h.fulfilled(config)) as Record<string, unknown>;
    }
    return config.headers as { get(name: string): unknown };
  }

  it("sends the in-memory token on a mutation, with document.cookie empty", async () => {
    // The whole bug in one assertion: no cookie is readable, and the header is
    // still present.
    setCsrfToken("seeker", "nonce.mac");
    expect(document.cookie).toBe("");
    expect((await headersFor("post")).get("X-CSRF-Token")).toBe("nonce.mac");
  });

  it("sends no token on a GET", async () => {
    // Safe methods carry no header; requiring one would break every navigation.
    setCsrfToken("seeker", "nonce.mac");
    expect((await headersFor("get")).get("X-CSRF-Token")).toBeUndefined();
  });

  it("sends nothing when no token has been received", async () => {
    // Anonymous. Attaching a stale or invented value would be worse than the 403.
    expect((await headersFor("post")).get("X-CSRF-Token")).toBeUndefined();
  });

  it("falls back to the cookie same-origin", async () => {
    // Local development proxies the API onto the dev server's origin, where the
    // cookie IS readable and a mutation can fire before bootstrap resolves.
    Object.defineProperty(document, "cookie", {
      value: "jp_seeker_csrf=from.cookie",
      writable: true,
      configurable: true,
    });
    expect((await headersFor("post")).get("X-CSRF-Token")).toBe("from.cookie");
  });

  it("prefers the in-memory token over the cookie", async () => {
    // After a rotation the cookie and the body agree, but memory is what the
    // server just issued. If these ever disagree, memory is the fresher one.
    Object.defineProperty(document, "cookie", {
      value: "jp_seeker_csrf=stale.cookie",
      writable: true,
      configurable: true,
    });
    setCsrfToken("seeker", "fresh.memory");
    expect((await headersFor("post")).get("X-CSRF-Token")).toBe("fresh.memory");
  });

  it("clearing the token stops sending the header", async () => {
    // Logout and session-loss both clear it. A token outliving its session is a
    // token attached to the next user's requests.
    setCsrfToken("seeker", "nonce.mac");
    setCsrfToken("seeker", null);
    expect((await headersFor("post")).get("X-CSRF-Token")).toBeUndefined();
  });

  it("never sends one portal's token to another portal", async () => {
    setCsrfToken("seeker", "seeker.nonce");
    setCsrfToken("recruiter", "recruiter.nonce");

    expect((await headersFor("post", "/seeker/auth/logout")).get("X-CSRF-Token")).toBe(
      "seeker.nonce",
    );
    expect((await headersFor("post", "/recruiter/auth/logout")).get("X-CSRF-Token")).toBe(
      "recruiter.nonce",
    );
  });
});
