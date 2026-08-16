import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app.js";
import { cookieValue, installCaptureMailer, lastCodeFor } from "./helpers.js";
import { csrfCookieName } from "../../src/lib/cookies.js";
import { verifyCsrfToken } from "../../src/lib/csrfToken.js";

const app = buildApp();
beforeEach(installCaptureMailer);

/**
 * Every session-issuing response carries the CSRF token in its BODY, not only
 * as a cookie.
 *
 * The cookie is deliberately `httpOnly: false`, and the client read it back
 * with `document.cookie`. That works same-origin and silently does not work
 * cross-site: with the web app on `*.vercel.app` and the API on
 * `*.onrender.com`, Chrome stores the cookie and sends it, but withholds it
 * from `document.cookie`. Measured in a real browser against production:
 *
 *     cookies stored:  __Host-jp_admin_at, __Host-jp_admin_rt, __Host-jp_admin_csrf
 *     document.cookie: (empty)
 *
 * So the client sent no `X-CSRF-Token` and every mutation 403'd. It presented
 * as "the session logs itself out": reads are unaffected for the 15 minutes the
 * access token lives, then `/refresh` — a POST — 403s, and the interceptor only
 * recovers 401s, so the failure is terminal. Approving a recruiter, posting a
 * job and applying were all equally broken; the session was just the most
 * visible one.
 *
 * The token was already minted and returned by `issueSession()` and thrown
 * away by the controllers. Returning it is also strictly stronger than the
 * cookie read: a value held in a module variable is unreadable by any other
 * origin, whereas a non-httpOnly cookie is readable by every script on the page.
 *
 * These assert the body specifically. Asserting the cookie would have passed
 * throughout the entire outage.
 */
describe("session responses carry the CSRF token in the body", () => {
  it("login returns a token that verifies", async () => {
    const agent = request.agent(app);
    await agent.post("/api/v1/seeker/auth/register").send({
      fullName: "Body Token", email: "body@x.test", password: "correct horse battery staple",
    });
    await agent.post("/api/v1/seeker/auth/verify-email").send({
      email: "body@x.test", code: await lastCodeFor("body@x.test"),
    });

    const login = await agent.post("/api/v1/seeker/auth/login").send({
      email: "body@x.test", password: "correct horse battery staple",
    });
    expect(login.status).toBe(200);
    expect(typeof login.body.csrfToken).toBe("string");
    expect(verifyCsrfToken(login.body.csrfToken)).toBe(true);
  });

  it("verify-email returns a token", async () => {
    const agent = request.agent(app);
    await agent.post("/api/v1/seeker/auth/register").send({
      fullName: "Verify Token", email: "vt@x.test", password: "correct horse battery staple",
    });
    const verify = await agent.post("/api/v1/seeker/auth/verify-email").send({
      email: "vt@x.test", code: await lastCodeFor("vt@x.test"),
    });
    expect(verify.status).toBe(200);
    expect(verifyCsrfToken(verify.body.csrfToken)).toBe(true);
  });

  it("refresh returns the ROTATED token, not the one it was called with", async () => {
    // The refresh response sets a new CSRF cookie. A client that kept using the
    // old value would 403 on its next mutation — the same outage, one step later.
    const agent = request.agent(app);
    await agent.post("/api/v1/seeker/auth/register").send({
      fullName: "Rot Token", email: "rot@x.test", password: "correct horse battery staple",
    });
    const verify = await agent.post("/api/v1/seeker/auth/verify-email").send({
      email: "rot@x.test", code: await lastCodeFor("rot@x.test"),
    });
    const first = verify.body.csrfToken as string;

    const refreshed = await agent
      .post("/api/v1/seeker/auth/refresh")
      .set("X-CSRF-Token", first);
    expect(refreshed.status).toBe(200);
    expect(verifyCsrfToken(refreshed.body.csrfToken)).toBe(true);
    expect(refreshed.body.csrfToken).not.toBe(first);
    // And it must match what the cookie was just set to.
    expect(refreshed.body.csrfToken).toBe(cookieValue(refreshed, csrfCookieName("seeker")));
  });

  it("/me returns a token, because a page reload loses the in-memory copy", async () => {
    // The Google callback is a top-level redirect and every hard reload starts
    // with an empty module variable, so bootstrap must be able to re-arm the
    // client without performing a mutation first.
    const agent = request.agent(app);
    await agent.post("/api/v1/seeker/auth/register").send({
      fullName: "Me Token", email: "me@x.test", password: "correct horse battery staple",
    });
    await agent.post("/api/v1/seeker/auth/verify-email").send({
      email: "me@x.test", code: await lastCodeFor("me@x.test"),
    });

    const me = await agent.get("/api/v1/seeker/auth/me");
    expect(me.status).toBe(200);
    expect(verifyCsrfToken(me.body.csrfToken)).toBe(true);

    // And it is usable: a mutation authenticated with only that token succeeds.
    const out = await agent
      .post("/api/v1/seeker/auth/logout")
      .set("X-CSRF-Token", me.body.csrfToken);
    expect(out.status).toBe(200);
  });

  it("/me echoes the existing token rather than rotating it", async () => {
    // Rotating here was a real regression, caught by integration.test.ts: `/me`
    // runs on every bootstrap, so a fresh token invalidates the one any
    // in-flight request already carries — capture a token, call `/me`, and the
    // captured token 403s on the next mutation. Rotation belongs to `/refresh`,
    // which rotates the session itself.
    //
    // The server CAN read the cookie (`req.cookies`); only browser JS cannot.
    // That asymmetry is what makes echoing possible, and it is why the first
    // version of this handler minted unconditionally.
    const agent = request.agent(app);
    await agent.post("/api/v1/seeker/auth/register").send({
      fullName: "Echo Token", email: "echo@x.test", password: "correct horse battery staple",
    });
    const verify = await agent.post("/api/v1/seeker/auth/verify-email").send({
      email: "echo@x.test", code: await lastCodeFor("echo@x.test"),
    });
    const issued = verify.body.csrfToken as string;

    const first = await agent.get("/api/v1/seeker/auth/me");
    expect(first.body.csrfToken).toBe(issued);
    // And again — repeated bootstraps must not drift either.
    const second = await agent.get("/api/v1/seeker/auth/me");
    expect(second.body.csrfToken).toBe(issued);

    // The originally-issued token still authorises a mutation.
    const out = await agent.post("/api/v1/seeker/auth/logout").set("X-CSRF-Token", issued);
    expect(out.status).toBe(200);
  });

  it("never returns a token to an anonymous caller", async () => {
    // A token handed out before sign-in is a token an attacker can fetch.
    const anon = await request(app).get("/api/v1/seeker/auth/me");
    expect(anon.status).toBe(401);
    expect(anon.body.csrfToken).toBeUndefined();
  });
});
