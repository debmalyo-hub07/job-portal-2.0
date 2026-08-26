import { afterEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Portal, SessionUser } from "@jobportal/shared";

import { makeStore, renderAppAt } from "./helpers/renderRoute";
import {
  setBootstrapped,
  setPortalBootstrapped,
  setPortalSession,
  setUser,
} from "@/redux/authSlice";
import { homePathFor, returnPathFor } from "@/lib/portalHome";
import { apiClient } from "@/lib/apiClient";
import { setSingleJob } from "@/redux/jobSlice";

afterEach(() => vi.restoreAllMocks());

function sessionStore(portal: Portal) {
  const store = makeStore();
  const user: SessionUser = {
    id: `${portal}-1`,
    portal,
    fullName: `${portal} user`,
    email: `${portal}@example.test`,
    emailVerified: true,
    avatarUrl: null,
    profileComplete: true,
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
  it("keeps the public seeker landing page reachable while signed in", async () => {
    const view = renderAppAt("/", { store: sessionStore("seeker") });
    expect(
      await view.findByRole("heading", { level: 1, name: /work that fits your next move/i }),
    ).toBeInTheDocument();
    expect(view.pathname()).toBe("/");
  });

  it("sends a signed-in recruiter from /hire to the workspace", async () => {
    const view = renderAppAt("/hire", { store: sessionStore("recruiter") });
    await waitFor(() => expect(view.pathname()).toBe("/hire/companies"));
  });

  /**
   * `/hire` is the employer marketing page, not a login door.
   *
   * It redirected anonymous visitors to `/hire/login` for a phase, and because
   * `AuthLayout` points the wordmark and the Back link of every recruiter auth
   * screen at `/hire`, both controls became no-ops — the click navigated to
   * `/hire` and the redirect threw you back at the form you were leaving. The
   * portal read as though it were holding a session nobody had opened.
   */
  it("shows an anonymous visitor the employer landing page at /hire", async () => {
    const view = renderAppAt("/hire", { store: anonymousStore() });

    expect(
      await view.findByRole("heading", {
        level: 1,
        name: /build the team, without the hiring theatre/i,
      }),
    ).toBeInTheDocument();
    expect(view.pathname()).toBe("/hire");
  });

  it.each(["Back", "Cairn"])(
    "leaves /hire/login for the employer landing page via %s",
    async (control) => {
      const view = renderAppAt("/hire/login", { store: anonymousStore() });
      await userEvent.click(await view.findByRole("link", { name: new RegExp(control, "i") }));

      await waitFor(() => expect(view.pathname()).toBe("/hire"));
      expect(
        await view.findByRole("heading", { level: 1, name: /build the team/i }),
      ).toBeInTheDocument();
    },
  );

  /**
   * A seeker session is not a recruiter session. Someone signed in on the
   * candidate side who follows the footer's "Hire on Cairn" is an anonymous
   * visitor as far as this portal is concerned, and gets the pitch.
   */
  it("shows the employer landing page to a signed-in seeker", async () => {
    const view = renderAppAt("/hire", { store: sessionStore("seeker") });

    expect(
      await view.findByRole("heading", { level: 1, name: /build the team/i }),
    ).toBeInTheDocument();
    expect(view.pathname()).toBe("/hire");
  });

  it.each([
    ["/profile", "/login"],
    ["/hire/jobs", "/hire/login"],
    ["/admin/dashboard", "/admin/login"],
  ])("sends an anonymous visitor from %s to the matching sign-in", async (path, login) => {
    const view = renderAppAt(path, { store: anonymousStore() });
    await waitFor(() => expect(view.pathname()).toBe(login));
  });

  it.each([
    ["seeker", "/hire/jobs", "/hire/login"],
    ["seeker", "/admin/dashboard", "/admin/login"],
    ["recruiter", "/profile", "/login"],
    ["recruiter", "/admin/dashboard", "/admin/login"],
    ["admin", "/profile", "/login"],
    ["admin", "/hire/jobs", "/hire/login"],
  ] satisfies Array<[Portal, string, string]>) (
    "requires the destination portal when a signed-in %s opens %s",
    async (portal, path, expected) => {
      const view = renderAppAt(path, { store: sessionStore(portal) });
      await waitFor(() => expect(view.pathname()).toBe(expected));
    },
  );

  it("lets a signed-in seeker open recruiter signup", async () => {
    const view = renderAppAt("/hire/signup", { store: sessionStore("seeker") });

    expect(await view.findByRole("heading", { level: 1, name: /start hiring/i })).toBeInTheDocument();
    expect(view.pathname()).toBe("/hire/signup");
  });

  it("keeps seeker and recruiter sessions available at the same time", async () => {
    const store = makeStore();
    store.dispatch(
      setPortalSession({
        portal: "seeker",
        user: {
          id: "seeker-1",
          portal: "seeker",
          fullName: "Seeker user",
          email: "dual@example.test",
          emailVerified: true,
          avatarUrl: null,
          profileComplete: true,
          status: "active",
        },
      }),
    );
    store.dispatch(
      setPortalSession({
        portal: "recruiter",
        user: {
          id: "recruiter-1",
          portal: "recruiter",
          fullName: "Recruiter user",
          email: "dual@example.test",
          emailVerified: true,
          avatarUrl: null,
          profileComplete: true,
          status: "active",
        },
      }),
    );
    store.dispatch(setPortalBootstrapped({ portal: "seeker", value: true }));
    store.dispatch(setPortalBootstrapped({ portal: "recruiter", value: true }));

    const seeker = renderAppAt("/profile", { store });
    expect(await seeker.findByRole("button", { name: /account menu/i })).toBeInTheDocument();
    seeker.unmount();

    const recruiter = renderAppAt("/hire/companies", { store });
    expect(await recruiter.findByRole("button", { name: /new company/i })).toBeInTheDocument();
  });

  it("takes an anonymous applicant to seeker sign-in and preserves the job URL", async () => {
    const store = anonymousStore();
    const job = {
      id: "job-1",
      title: "Frontend Engineer",
      description: "Build the product.",
      requirements: ["TypeScript"],
      salary: 12,
      location: "Kolkata",
      jobType: "Full-time",
      position: 2,
      experienceLevel: 3,
      remote: false,
      createdAt: new Date().toISOString(),
      company: { id: "company-1", name: "Northvale", logoUrl: null },
    };
    store.dispatch(setSingleJob(job as never));
    vi.spyOn(apiClient, "get").mockResolvedValue({ data: { success: true, job } } as never);
    const post = vi.spyOn(apiClient, "post");

    const view = renderAppAt("/description/job-1", { store });
    await userEvent.click(await view.findByRole("button", { name: /apply for this role/i }));

    await waitFor(() => expect(view.pathname()).toBe("/login"));
    expect(post).not.toHaveBeenCalled();
    expect(await view.findByRole("link", { name: /create one/i })).toHaveAttribute(
      "href",
      "/signup",
    );
  });

  it("uses the job board as the signed-in seeker home", () => {
    expect(homePathFor("seeker")).toBe("/jobs");
  });

  it("returns only to a protected path owned by the portal", () => {
    expect(returnPathFor("recruiter", { from: "/hire/jobs/job-1/applicants?sort=fit" })).toBe(
      "/hire/jobs/job-1/applicants?sort=fit",
    );
    expect(returnPathFor("seeker", { from: "/admin/dashboard" })).toBeNull();
    expect(returnPathFor("seeker", { from: "/description/job-1?source=apply" })).toBe(
      "/description/job-1?source=apply",
    );
    expect(returnPathFor("admin", { from: "https://attacker.test" })).toBeNull();
  });
});
