import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { Portal } from "@jobportal/shared";
import { Seeker } from "../../src/models/seeker.model.js";
import {
  resetGoogleOAuth,
  setGoogleOAuth,
  type GoogleIdentity,
} from "../../src/lib/googleOAuth.js";
import {
  confirmGoogleLinkHandler,
  googleCallbackHandler,
  googleStartHandler,
  loginHandler,
  registerHandler,
  verifyEmailHandler,
} from "../../src/controllers/auth.controller.js";
import {
  authTestApp,
  cookieValue,
  installCaptureMailer,
  lastCodeFor,
  linkTokenFor,
  outbox,
  setCookieNames,
} from "./helpers.js";

const app: Express = authTestApp((portal, r) => {
  r.post("/register", registerHandler(portal));
  r.post("/verify-email", verifyEmailHandler(portal));
  r.post("/login", loginHandler(portal));
  r.get("/google", googleStartHandler(portal));
  r.get("/google/callback", googleCallbackHandler(portal));
  r.post("/google/confirm-link", confirmGoogleLinkHandler(portal));
});

beforeEach(installCaptureMailer);
afterEach(resetGoogleOAuth);

const post = (url: string, body: object) => request(app).post(url).send(body);

let issued: { state: string; nonce: string } = { state: "", nonce: "" };

const IDENTITY: GoogleIdentity = {
  sub: "google-sub-1",
  email: "g@x.test",
  emailVerified: true,
  fullName: "G User",
  avatarUrl: null,
  nonce: null,
};

function installFakeGoogle(overrides: Partial<GoogleIdentity> = {}): void {
  setGoogleOAuth({
    authUrl({ state, nonce }) {
      issued = { state, nonce };
      return `https://accounts.google.example/consent?state=${state}`;
    },
    async exchange() {
      // Echo the txn's nonce unless a test overrides it to simulate replay.
      return { ...IDENTITY, nonce: issued.nonce, ...overrides };
    },
  });
}

/**
 * Start + callback with a well-behaved browser. Returns the callback response.
 *
 * MUST be awaited before the next call: `issued` is module state written by the
 * fake authUrl, so two flows in flight at once would read each other's state and
 * nonce. The plan's failure-matrix case built an array of un-awaited
 * completeFlow() calls, which starts them all concurrently and races exactly
 * that — the loop below awaits each in turn instead.
 */
async function completeFlow(
  portal: Portal,
  overrides: Partial<GoogleIdentity> = {},
  mangle?: { state?: string; dropCookie?: boolean },
) {
  installFakeGoogle(overrides);
  const start = await request(app).get(`/api/v1/${portal}/auth/google`);
  expect(start.status).toBe(302);
  const txn = cookieValue(start, "jp_gtxn");
  let call = request(app)
    .get(`/api/v1/${portal}/auth/google/callback`)
    .query({ code: "fake-code", state: mangle?.state ?? issued.state });
  if (!mangle?.dropCookie) {
    call = call.set("Cookie", [`jp_gtxn=${encodeURIComponent(txn ?? "")}`]);
  }
  return call;
}

describe("google oauth", () => {
  it("creates a verified account for a stranger and signs them in (branch 3)", async () => {
    const res = await completeFlow("seeker");
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/auth/complete?portal=seeker");
    expect(setCookieNames(res)).toEqual(
      expect.arrayContaining(["jp_seeker_at", "jp_seeker_rt"]),
    );
    const account = await Seeker.findOne({ email: "g@x.test" }).select("+passwordHash");
    expect(account?.googleId).toBe("google-sub-1");
    expect(account?.emailVerifiedAt).not.toBeNull();
    expect(account?.passwordHash).toBeNull();
  });

  it("signs a known googleId straight in without touching email matching (branch 1)", async () => {
    await completeFlow("seeker");
    // Same sub, DIFFERENT email — the account keys on sub, so this is the same
    // person whose Google email changed, not a new account.
    const res = await completeFlow("seeker", { email: "renamed@x.test" });
    expect(res.headers.location).toContain("/auth/complete");
    expect(await Seeker.countDocuments({})).toBe(1);
  });

  it("links a passwordless local account in place (branch 2a)", async () => {
    await Seeker.create({
      email: "g@x.test",
      fullName: "Pre",
      passwordHash: null,
      emailVerifiedAt: new Date(),
    });
    await completeFlow("seeker");
    const account = await Seeker.findOne({ email: "g@x.test" });
    expect(account?.googleId).toBe("google-sub-1");
    expect(await Seeker.countDocuments({})).toBe(1); // linked, not duplicated
  });

  it("takes over an unverified password account IN PLACE, keeping _id (branch 2c)", async () => {
    // The attacker's plant: victim's address, attacker's password, never verified.
    await post("/api/v1/seeker/auth/register", {
      fullName: "Attacker",
      email: "g@x.test",
      password: "attacker knows this one",
    });
    const planted = await Seeker.findOne({ email: "g@x.test" });

    const res = await completeFlow("seeker");
    expect(res.headers.location).toContain("/auth/complete");

    const account = await Seeker.findOne({ email: "g@x.test" }).select("+passwordHash");
    expect(String(account?._id)).toBe(String(planted?._id)); // takeover, not recreate
    expect(account?.passwordHash).toBeNull(); // the plant is dead
    expect(account?.emailVerifiedAt).not.toBeNull();
    // The attacker's password no longer opens anything.
    const login = await post("/api/v1/seeker/auth/login", {
      email: "g@x.test",
      password: "attacker knows this one",
    });
    expect(login.status).toBe(401);
    // And the owner was told what happened. Matched on the template's real
    // subject, "Your account is now linked to Google" — the plan asserted
    // /sign-in method changed/i, which is the H1 in the BODY of
    // renderAccountClaimedEmail and appears in no subject line, so that
    // assertion could never have passed.
    expect(outbox.some((m) => m.to === "g@x.test" && /linked to google/i.test(m.subject))).toBe(
      true,
    );
  });

  it("requires mailbox step-up for a VERIFIED password account (branch 2b)", async () => {
    await post("/api/v1/seeker/auth/register", {
      fullName: "Owner",
      email: "g@x.test",
      password: "the owners password!",
    });
    await post("/api/v1/seeker/auth/verify-email", {
      email: "g@x.test",
      code: await lastCodeFor("g@x.test"),
    });

    const res = await completeFlow("seeker");
    expect(res.headers.location).toContain("/auth/link-pending");
    // NOT signed in.
    expect(setCookieNames(res)).not.toEqual(expect.arrayContaining(["jp_seeker_at"]));

    const account = await Seeker.findOne({ email: "g@x.test" });
    expect(account?.googleId).toBeNull(); // not linked yet
    expect(account?.pendingGoogleLink?.googleId).toBe("google-sub-1");

    // The mailed link activates it.
    const token = linkTokenFor("g@x.test", /link/i);
    const confirm = await post("/api/v1/seeker/auth/google/confirm-link", { token });
    expect(confirm.status).toBe(200);
    expect((await Seeker.findOne({ email: "g@x.test" }))?.googleId).toBe("google-sub-1");

    // And now branch 1 signs them in.
    const again = await completeFlow("seeker");
    expect(again.headers.location).toContain("/auth/complete");
  });

  it("invalidates an older confirmation mail when a newer attempt supersedes it", async () => {
    await post("/api/v1/seeker/auth/register", {
      fullName: "Owner",
      email: "g@x.test",
      password: "the owners password!",
    });
    await post("/api/v1/seeker/auth/verify-email", {
      email: "g@x.test",
      code: await lastCodeFor("g@x.test"),
    });

    // Mail A, for google-sub-1.
    const first = await completeFlow("seeker");
    expect(first.headers.location).toContain("/auth/link-pending");

    // Mail B, for a DIFFERENT Google account. The fresh pending record
    // overwrites the old one, which is what kills A.
    const second = await completeFlow("seeker", { sub: "google-sub-2" });
    expect(second.headers.location).toContain("/auth/link-pending");

    // The OLDEST link mail, not the newest — linkTokenFor takes the most
    // recent, which is mail B, and the point of this test is that A is dead.
    const mailA = outbox.filter((m) => /link/i.test(m.subject))[0];
    expect(mailA).toBeDefined();
    const rawA = /token=([^\s&]+)/.exec(mailA?.text ?? "")?.[1];
    expect(rawA).toBeDefined();
    const confirmA = await post("/api/v1/seeker/auth/google/confirm-link", {
      token: decodeURIComponent(rawA ?? ""),
    });
    expect(confirmA.status).toBe(400);
    expect(confirmA.body.code).toBe("GOOGLE_LINK_INVALID");

    // B still works, so the invalidation is targeted rather than total.
    const tokenB = linkTokenFor("g@x.test", /link/i);
    const confirmB = await post("/api/v1/seeker/auth/google/confirm-link", { token: tokenB });
    expect(confirmB.status).toBe(200);
    expect((await Seeker.findOne({ email: "g@x.test" }))?.googleId).toBe("google-sub-2");
  });

  it("kills the flow on state mismatch, nonce mismatch, unverified email, or a missing cookie", async () => {
    const attempts: Array<() => Promise<unknown>> = [
      () => completeFlow("seeker", {}, { state: "attacker-state" }), // login CSRF
      () => completeFlow("seeker", { nonce: "replayed-nonce" }), // token replay
      () => completeFlow("seeker", { emailVerified: false }), // unattested mailbox
      () => completeFlow("seeker", {}, { dropCookie: true }), // no transaction
    ];
    for (const attempt of attempts) {
      const res = (await attempt()) as Awaited<ReturnType<typeof completeFlow>>;
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain("GOOGLE_AUTH_FAILED");
      expect(setCookieNames(res)).not.toEqual(expect.arrayContaining(["jp_seeker_at"]));
    }
    expect(await Seeker.countDocuments({})).toBe(0);
  });

  it("refuses a seeker transaction presented to the recruiter callback", async () => {
    installFakeGoogle();
    const start = await request(app).get("/api/v1/seeker/auth/google");
    const txn = cookieValue(start, "jp_gtxn");
    const res = await request(app)
      .get("/api/v1/recruiter/auth/google/callback")
      .query({ code: "fake-code", state: issued.state })
      .set("Cookie", [`jp_gtxn=${encodeURIComponent(txn ?? "")}`]);
    expect(res.headers.location).toContain("GOOGLE_AUTH_FAILED");
  });
});
