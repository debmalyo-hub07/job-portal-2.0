import { describe, expect, it } from "vitest";
import type { SessionUser } from "@jobportal/shared";
import {
  completePathFor,
  landingAfterAuth,
  loginDestination,
  profilePathFor,
  returnPathFor,
} from "@/lib/portalHome";

const user = (over: Partial<SessionUser>): SessionUser => ({
  id: "1",
  portal: "seeker",
  fullName: "A B",
  email: "a@b.co",
  emailVerified: true,
  avatarUrl: null,
  status: "active",
  profileComplete: true,
  hasPassword: true,
  isMinor: false,
  pendingEmailChange: null,
  ...over,
});

describe("completePathFor", () => {
  it("maps the two gated portals to their own paths", () => {
    // Two mounts, not one ?portal= path: a browser can hold a seeker AND a
    // recruiter session at once, and ProtectedRoute's portal is a route literal.
    expect(completePathFor("seeker")).toBe("/complete-profile");
    expect(completePathFor("recruiter")).toBe("/hire/complete-profile");
  });
});

describe("profilePathFor", () => {
  it("maps all three portals", () => {
    expect(profilePathFor("seeker")).toBe("/profile");
    expect(profilePathFor("recruiter")).toBe("/hire/profile");
    expect(profilePathFor("admin")).toBe("/admin/profile");
  });
});

describe("landingAfterAuth", () => {
  it("sends an incomplete session to the completion step", () => {
    expect(landingAfterAuth(user({ profileComplete: false }))).toBe("/complete-profile");
    expect(landingAfterAuth(user({ portal: "recruiter", profileComplete: false })))
      .toBe("/hire/complete-profile");
  });

  it("sends a complete session home", () => {
    expect(landingAfterAuth(user({}))).toBe("/jobs");
    expect(landingAfterAuth(user({ portal: "recruiter" }))).toBe("/hire/companies");
  });

  it("never sends an admin to a completion step", () => {
    // `isProfileComplete` returns true for admin unconditionally, so the
    // incomplete branch is unreachable — and `completePathFor` is typed to make
    // passing "admin" a compile error rather than a dead link. The explicit
    // portal check here covers a stale cached session that says otherwise.
    expect(landingAfterAuth(user({ portal: "admin", profileComplete: true })))
      .toBe("/admin/dashboard");
    expect(landingAfterAuth(user({ portal: "admin", profileComplete: false })))
      .toBe("/admin/dashboard");
  });
});

describe("returnPathFor", () => {
  it("allows the new profile and completion paths", () => {
    // It is an allowlist, so a new protected route not added here silently
    // loses its "return to where you were" after sign-in.
    expect(returnPathFor("recruiter", { from: "/hire/profile" })).toBe("/hire/profile");
    expect(returnPathFor("admin", { from: "/admin/profile" })).toBe("/admin/profile");
    expect(returnPathFor("seeker", { from: "/complete-profile" })).toBe("/complete-profile");
    expect(returnPathFor("recruiter", { from: "/hire/complete-profile" }))
      .toBe("/hire/complete-profile");
  });

  it("still refuses another portal's path and an open redirect", () => {
    expect(returnPathFor("seeker", { from: "/admin/profile" })).toBeNull();
    expect(returnPathFor("seeker", { from: "//evil.example" })).toBeNull();
    expect(returnPathFor("admin", { from: "/hire/profile" })).toBeNull();
  });
});

describe("loginDestination", () => {
  it("honours a saved path once identity is settled", () => {
    expect(loginDestination(user({}), { from: "/description/abc123" }))
      .toBe("/description/abc123");
  });

  it("puts the completion step ahead of a saved path", () => {
    // Otherwise the guard bounces them straight back here and the user sees the
    // app refusing to load the page they asked for.
    expect(loginDestination(user({ profileComplete: false }), { from: "/description/abc" }))
      .toBe("/complete-profile");
  });

  it("falls back to home when there is no saved path", () => {
    expect(loginDestination(user({}), null)).toBe("/jobs");
    expect(loginDestination(user({ portal: "admin" }), null)).toBe("/admin/dashboard");
  });
});
