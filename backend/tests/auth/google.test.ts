import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import express, { Router, type Express } from "express";
import cookieParser from "cookie-parser";
import type { Portal } from "@jobportal/shared";
import { Seeker } from "../../src/models/seeker.model.js";
import { Recruiter } from "../../src/models/recruiter.model.js";
import { Admin } from "../../src/models/admin.model.js";
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

  it("creates a pending recruiter for a stranger instead of bypassing approval", async () => {
    const res = await completeFlow("recruiter");
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/auth/complete?portal=recruiter");

    const account = await Recruiter.findOne({ email: "g@x.test" }).select("+passwordHash");
    expect(account?.googleId).toBe("google-sub-1");
    expect(account?.emailVerifiedAt).not.toBeNull();
    expect(account?.passwordHash).toBeNull();
    expect(account?.status).toBe("pending");
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

  it("auto-links Google to a VERIFIED password account (branch 2b)", async () => {
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
    expect(res.headers.location).toContain("/auth/complete?portal=seeker");
    // Signed in immediately — no step-up required.
    expect(setCookieNames(res)).toEqual(
      expect.arrayContaining(["jp_seeker_at", "jp_seeker_rt"]),
    );

    const account = await Seeker.findOne({ email: "g@x.test" }).select("+passwordHash");
    expect(account?.googleId).toBe("google-sub-1");
    // Password is preserved — the account can still sign in with either method.
    expect(account?.passwordHash).not.toBeNull();
    // Any pending link is cleared.
    expect(account?.pendingGoogleLink?.googleId).toBeNull();
  });

  it("a second Google identity is a stranger once the first is linked", async () => {
    await post("/api/v1/seeker/auth/register", {
      fullName: "Owner",
      email: "g@x.test",
      password: "the owners password!",
    });
    await post("/api/v1/seeker/auth/verify-email", {
      email: "g@x.test",
      code: await lastCodeFor("g@x.test"),
    });

    // First link: google-sub-1.
    const first = await completeFlow("seeker");
    expect(first.headers.location).toContain("/auth/complete");
    expect((await Seeker.findOne({ email: "g@x.test" }))?.googleId).toBe("google-sub-1");

    // Second attempt with a DIFFERENT Google account: the account already has
    // googleId set, so branch 1 matches google-sub-1 and signs in. The second
    // sub does NOT overwrite — once linked, the sub is stable.
    const second = await completeFlow("seeker", { sub: "google-sub-2", email: "other@x.test" });
    // google-sub-2 is a stranger — it creates a new account (branch 3).
    expect(second.headers.location).toContain("/auth/complete");
    expect(await Seeker.countDocuments({})).toBe(2);
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

  it("refuses the admin portal even with a fully valid flow", async () => {
    // Defense in depth for the route-level gate: `buildAuthRouter` mounts no
    // Google routes for admin, but the real router once carried a comment
    // claiming the service would refuse admin creation "anyway" — stale since
    // recruiter creation was allowed, because the stranger branch writes
    // status "active" for every portal but recruiter. This test mounts the
    // handlers directly, simulating a future remount, and asserts the service
    // layer refuses on its own: no sign-in, no link-pending, and above all no
    // admin row — a stranger's Gmail must not mint the highest-privilege
    // account just because someone loosened the route guard.
    const adminApp: Express = express();
    adminApp.use(express.json());
    adminApp.use(cookieParser());
    const adminRouter = Router();
    adminRouter.get("/google", googleStartHandler("admin"));
    adminRouter.get("/google/callback", googleCallbackHandler("admin"));
    adminApp.use("/api/v1/admin/auth", adminRouter);

    installFakeGoogle();
    const start = await request(adminApp).get("/api/v1/admin/auth/google");
    expect(start.status).toBe(302);
    const txn = cookieValue(start, "jp_gtxn");
    const res = await request(adminApp)
      .get("/api/v1/admin/auth/google/callback")
      .query({ code: "fake-code", state: issued.state })
      .set("Cookie", [`jp_gtxn=${encodeURIComponent(txn ?? "")}`]);

    expect(res.headers.location).toContain("GOOGLE_AUTH_FAILED");
    expect(setCookieNames(res)).not.toEqual(expect.arrayContaining(["jp_admin_at"]));
    expect(await Admin.countDocuments({})).toBe(0);
  });
});

/** Google credentials follow the same portal and approval rules as passwords. */
describe("google creation and recruiter linking", () => {
  it("still creates a seeker for an unknown identity", async () => {
    const before = await Seeker.countDocuments({});
    const res = await completeFlow("seeker", {
      sub: "google-stranger-2",
      email: "stranger2@x.test",
    });
    expect(res.headers.location).toContain("/auth/complete?portal=seeker");
    expect(await Seeker.countDocuments({})).toBe(before + 1);
    // The registry row went with the account: the address is now taken
    // cross-portal, and the registry agrees with the collections.
    const created = await Seeker.findOne({ email: "stranger2@x.test" });
    const { EmailRegistry } = await import("../../src/models/emailRegistry.model.js");
    const row = await EmailRegistry.findOne({ subjectId: created?._id }).lean();
    expect(row?.email).toBe("stranger2@x.test");
    expect(row?.portal).toBe("seeker");
  });

  it("refuses a stranger whose address is held on another portal", async () => {
    // 2026-08-27: one address, one account. The recruiter below holds this
    // address, so Google cannot mint a seeker account on top of it — the
    // registry refuses before any row is written. The refusal is
    // distinguishable, though: the viewer proved mailbox control to Google,
    // and register() already tells anyone the same sentence with no proof at
    // all, so this hides nothing an attacker could not learn by attempting
    // registration. GOOGLE_AUTH_FAILED stays uniform for every other check.
    const { EmailRegistry } = await import("../../src/models/emailRegistry.model.js");
    await Recruiter.create({
      email: "held@x.test",
      fullName: "Holding Rec",
      googleId: null,
      passwordHash: "x",
      emailVerifiedAt: new Date(),
      status: "active",
    });
    await EmailRegistry.create({
      email: "held@x.test",
      portal: "recruiter",
      subjectId: (await Recruiter.findOne({ email: "held@x.test" }))!._id,
    });

    const before = await Seeker.countDocuments({});
    const res = await completeFlow("seeker", {
      sub: "google-stranger-held",
      email: "held@x.test",
    });

    expect(res.headers.location).toContain("EMAIL_TAKEN");
    expect(res.headers.location).toContain("portal=seeker");
    expect(setCookieNames(res)).not.toEqual(expect.arrayContaining(["jp_seeker_at"]));
    expect(await Seeker.countDocuments({})).toBe(before);
  });

  it("still signs in a recruiter whose googleId is already known", async () => {
    await Recruiter.create({
      email: "known@x.test",
      fullName: "Known Rec",
      googleId: "google-known-1",
      passwordHash: null,
      emailVerifiedAt: new Date(),
      status: "active",
    });

    const res = await completeFlow("recruiter", {
      sub: "google-known-1",
      email: "known@x.test",
    });
    expect(res.headers.location).toContain("/auth/complete?portal=recruiter");
    expect(setCookieNames(res)).toEqual(
      expect.arrayContaining(["jp_recruiter_at", "jp_recruiter_rt"]),
    );
  });

  it("still links Google to an existing passwordless recruiter (branch 2a)", async () => {
    const rec = await Recruiter.create({
      email: "nopass@x.test",
      fullName: "No Password Rec",
      googleId: null,
      passwordHash: null,
      emailVerifiedAt: new Date(),
      status: "active",
    });

    const res = await completeFlow("recruiter", {
      sub: "google-link-1",
      email: "nopass@x.test",
    });
    expect(res.headers.location).toContain("/auth/complete?portal=recruiter");
    expect((await Recruiter.findById(rec._id))?.googleId).toBe("google-link-1");
  });
});
