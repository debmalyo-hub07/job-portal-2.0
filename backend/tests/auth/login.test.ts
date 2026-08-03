import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { Portal } from "@jobportal/shared";
import { Seeker } from "../../src/models/seeker.model.js";
import {
  loginHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
  registerHandler,
  verifyEmailHandler,
} from "../../src/controllers/auth.controller.js";
import { authenticate } from "../../src/middleware/authenticate.js";
import { authTestApp, cookieValue, installCaptureMailer, lastCodeFor, setCookieNames } from "./helpers.js";

/**
 * No CSRF in this harness — the middleware has its own suite and the real
 * wiring is integration-tested in Task 10. `/me` is a probe standing in for any
 * authenticated route, so the access-token cutoff can be asserted end to end.
 */
const app: Express = authTestApp((portal, r) => {
  r.post("/register", registerHandler(portal));
  r.post("/verify-email", verifyEmailHandler(portal));
  r.post("/login", loginHandler(portal));
  r.post("/logout", logoutHandler(portal));
  r.post("/refresh", refreshHandler(portal));
  r.get("/me", authenticate(portal), meHandler(portal));
});

beforeEach(installCaptureMailer);

const post = (url: string, body: object) => request(app).post(url).send(body);

const PASSWORD = "correct horse battery staple";

async function registeredVerified(portal: Portal, email: string, password = PASSWORD) {
  const res = await post(`/api/v1/${portal}/auth/register`, {
    fullName: "Test Person",
    email,
    password,
  });
  expect(res.status).toBe(201);
  const code = await lastCodeFor(email);
  const verified = await post(`/api/v1/${portal}/auth/verify-email`, { email, code });
  expect(verified.status).toBe(200);
}

describe("login", () => {
  it("returns one uniform failure for unknown email, wrong password, and Google-only accounts", async () => {
    await registeredVerified("seeker", "known@x.test");
    await Seeker.create({
      email: "google-only@x.test",
      fullName: "G Only",
      passwordHash: null,
      emailVerifiedAt: new Date(),
    });

    const cases = [
      { email: "unknown@x.test", password: "whatever whatever" },
      { email: "known@x.test", password: "wrong wrong wrong" },
      { email: "google-only@x.test", password: "wrong wrong wrong" },
    ];
    const bodies: string[] = [];
    for (const c of cases) {
      const res = await post("/api/v1/seeker/auth/login", c);
      expect(res.status).toBe(401);
      bodies.push(JSON.stringify({ code: res.body.code, message: res.body.message }));
    }
    expect(new Set(bodies).size).toBe(1); // byte-identical
  });

  it("burns comparable time on the absent branch (no fast path for unknown emails)", async () => {
    await registeredVerified("seeker", "timing@x.test");

    /** Median of three, to take the edge off scheduler noise. */
    const sample = async (email: string): Promise<number> => {
      const runs: number[] = [];
      for (let i = 0; i < 3; i += 1) {
        const t0 = performance.now();
        await post("/api/v1/seeker/auth/login", { email, password: "wrong wrong wrong" });
        runs.push(performance.now() - t0);
      }
      runs.sort((a, b) => a - b);
      return runs[1] ?? 0;
    };

    // Compared against the present branch rather than an absolute floor.
    //
    // The plan asserted `absentMs > 20`, which a database round-trip and
    // Express overhead clear on their own — that assertion stays GREEN when
    // `burnPasswordTime` is deleted, so it never tested the burn at all
    // (confirmed by mutation). The real property is relative: an unknown
    // address must not be materially faster than a known one with a wrong
    // password, because that difference is the enumeration oracle.
    //
    // Present runs first so the lazily-built dummy hash is charged to the
    // absent branch, which biases against a false pass.
    const present = await sample("timing@x.test");
    const absent = await sample("absent@x.test");
    expect(absent).toBeGreaterThan(present * 0.5);
  });

  it("gives EMAIL_NOT_VERIFIED only for a CORRECT password on an unverified account", async () => {
    await post("/api/v1/seeker/auth/register", {
      fullName: "Unverified",
      email: "unv@x.test",
      password: PASSWORD,
    });
    const wrong = await post("/api/v1/seeker/auth/login", {
      email: "unv@x.test",
      password: "wrong wrong wrong",
    });
    expect(wrong.status).toBe(401);
    expect(wrong.body.code).toBe("INVALID_CREDENTIALS"); // no free existence oracle

    const right = await post("/api/v1/seeker/auth/login", {
      email: "unv@x.test",
      password: PASSWORD,
    });
    expect(right.status).toBe(403);
    expect(right.body.code).toBe("EMAIL_NOT_VERIFIED");
    expect(setCookieNames(right)).toEqual([]); // and still no session
  });

  it("locks after LOGIN_LOCK_THRESHOLD failures and hides the lock behind the uniform error", async () => {
    await registeredVerified("seeker", "lock@x.test");
    for (let i = 0; i < 5; i += 1) {
      await post("/api/v1/seeker/auth/login", {
        email: "lock@x.test",
        password: "wrong wrong wrong",
      });
    }
    // Locked now: even the CORRECT password gets the uniform rejection.
    const during = await post("/api/v1/seeker/auth/login", {
      email: "lock@x.test",
      password: PASSWORD,
    });
    expect(during.status).toBe(401);
    expect(during.body.code).toBe("INVALID_CREDENTIALS");

    // Expire the lock manually, then succeed and confirm counters cleared.
    await Seeker.updateOne(
      { email: "lock@x.test" },
      { $set: { lockedUntil: new Date(Date.now() - 1000) } },
    );
    const after = await post("/api/v1/seeker/auth/login", {
      email: "lock@x.test",
      password: PASSWORD,
    });
    expect(after.status).toBe(200);
    const account = await Seeker.findOne({ email: "lock@x.test" });
    expect(account?.failedLoginCount).toBe(0);
    expect(account?.lockedUntil).toBeNull();
  });

  it("caps the lock so it cannot be weaponised into a permanent lockout", async () => {
    // Not in the plan, which ships no test for the cap while calling it
    // load-bearing. Uncapped, anyone who knows an address can hold that account
    // shut forever with wrong passwords — a denial-of-service primitive handed
    // to unauthenticated callers.
    await registeredVerified("seeker", "cap@x.test");

    // A live lock deliberately does NOT increment the counter, so the previous
    // lock has to be expired before the next failure can advance it.
    for (let i = 0; i < 12; i += 1) {
      if (i > 0) {
        await Seeker.updateOne({ email: "cap@x.test" }, { $set: { lockedUntil: null } });
      }
      await post("/api/v1/seeker/auth/login", {
        email: "cap@x.test",
        password: "wrong wrong wrong",
      });
    }

    const account = await Seeker.findOne({ email: "cap@x.test" });
    expect(account?.failedLoginCount).toBe(12);
    const lockMs = (account?.lockedUntil?.getTime() ?? 0) - Date.now();
    expect(lockMs).toBeGreaterThan(0); // still locked
    // 2 ** (12 - 5) = 128 minutes without the cap; LOGIN_LOCK_MAX_MINUTES holds
    // it at 15. The slack absorbs the elapsed time of the loop above.
    expect(lockMs).toBeLessThanOrEqual(15 * 60_000 + 5_000);
  });

  it("transparently upgrades a migrated bcrypt hash on successful login", async () => {
    const bcrypt = (await import("bcryptjs")).default;
    await Seeker.create({
      email: "legacy@x.test",
      fullName: "Legacy User",
      passwordHash: await bcrypt.hash("hunter2hunter2", 10),
      emailVerifiedAt: new Date(),
    });
    const res = await post("/api/v1/seeker/auth/login", {
      email: "legacy@x.test",
      password: "hunter2hunter2",
    });
    expect(res.status).toBe(200);
    const account = await Seeker.findOne({ email: "legacy@x.test" }).select("+passwordHash");
    expect(account?.passwordHash).toMatch(/^\$argon2id\$/);
    // And the upgraded hash still verifies on the next login.
    const again = await post("/api/v1/seeker/auth/login", {
      email: "legacy@x.test",
      password: "hunter2hunter2",
    });
    expect(again.status).toBe(200);
  });

  it("logout revokes the refresh family and clears cookies with matching attributes", async () => {
    await registeredVerified("seeker", "out@x.test");
    const login = await post("/api/v1/seeker/auth/login", {
      email: "out@x.test",
      password: PASSWORD,
    });
    const refresh = cookieValue(login, "jp_seeker_rt");
    expect(refresh).toBeDefined();

    const out = await request(app)
      .post("/api/v1/seeker/auth/logout")
      .set("Cookie", [`jp_seeker_rt=${encodeURIComponent(refresh ?? "")}`]);
    expect(out.status).toBe(200);
    // Cleared cookies carry the same path and flags they were set with.
    const cleared = (out.headers["set-cookie"] as unknown as string[]).find((h) =>
      h.startsWith("jp_seeker_at="),
    );
    expect(cleared).toContain("Path=/");
    // The family is dead: the old refresh token no longer rotates.
    const rotate = await request(app)
      .post("/api/v1/seeker/auth/refresh")
      .set("Cookie", [`jp_seeker_rt=${encodeURIComponent(refresh ?? "")}`]);
    expect(rotate.status).toBe(401);
  });
});
