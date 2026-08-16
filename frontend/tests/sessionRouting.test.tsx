import { describe, expect, it } from "vitest";
import { waitFor } from "@testing-library/react";
import type { Portal, SessionUser } from "@jobportal/shared";

import { makeStore, renderAppAt } from "./helpers/renderRoute";
import { setBootstrapped, setUser } from "@/redux/authSlice";
import { homePathFor, returnPathFor } from "@/lib/portalHome";

function sessionStore(portal: Portal) {
  const store = makeStore();
  const user: SessionUser = {
    id: `${portal}-1`,
    portal,
    fullName: `${portal} user`,
    email: `${portal}@example.test`,
    emailVerified: true,
    avatarUrl: null,
    status: "active",
  };
  store.dispatch(setUser(user));
  store.dispatch(setBootstrapped(true));
  return store;
}

function anonymousStore() {
  const store = makeStore();
  store.dispatch(setBootstrapped(true));
  return store;
}

describe("portal route isolation", () => {
  it.each([
    ["/profile", "/login"],
    ["/hire/jobs", "/hire/login"],
    ["/admin/dashboard", "/admin/login"],
  ])("sends an anonymous visitor from %s to the matching sign-in", async (path, login) => {
    const view = renderAppAt(path, { store: anonymousStore() });
    await waitFor(() => expect(view.pathname()).toBe(login));
  });

  it.each([
    ["seeker", "/hire/jobs", "/jobs"],
    ["seeker", "/admin/dashboard", "/jobs"],
    ["recruiter", "/profile", "/hire/companies"],
    ["recruiter", "/admin/dashboard", "/hire/companies"],
    ["admin", "/profile", "/admin/dashboard"],
    ["admin", "/hire/jobs", "/admin/dashboard"],
  ] satisfies Array<[Portal, string, string]>) (
    "keeps a signed-in %s inside its own portal when opening %s",
    async (portal, path, expected) => {
      const view = renderAppAt(path, { store: sessionStore(portal) });
      await waitFor(() => expect(view.pathname()).toBe(expected));
    },
  );

  it("uses the job board as the signed-in seeker home", () => {
    expect(homePathFor("seeker")).toBe("/jobs");
  });

  it("returns only to a protected path owned by the portal", () => {
    expect(returnPathFor("recruiter", { from: "/hire/jobs/job-1/applicants?sort=fit" })).toBe(
      "/hire/jobs/job-1/applicants?sort=fit",
    );
    expect(returnPathFor("seeker", { from: "/admin/dashboard" })).toBeNull();
    expect(returnPathFor("admin", { from: "https://attacker.test" })).toBeNull();
  });
});
