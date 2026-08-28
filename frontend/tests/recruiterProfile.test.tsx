import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { profileUpdateBodySchema } from "@jobportal/shared";
import RecruiterProfile from "@/components/workspace/RecruiterProfile";
import { makeStore, renderAppAt, renderRoute } from "./helpers/renderRoute";
import { setUser } from "@/redux/authSlice";

const render = () => renderRoute(<RecruiterProfile />, { route: "/hire/profile" });

describe("recruiter profile", () => {
  it("renders inside the hiring workspace shell", () => {
    render();
    expect(screen.getByText(/hiring workspace/i)).toBeTruthy();
  });

  it("offers a designation field, the byline nothing could write", () => {
    render();
    expect(screen.getByLabelText(/^designation/i)).toBeTruthy();
  });

  it("explains that the designation is public", () => {
    // It is rendered as the poster's byline on every job detail page, and a
    // recruiter typing into a box deserves to know that.
    render();
    expect(screen.getByText(/shown on every role you post/i)).toBeTruthy();
  });

  it("does not offer email as an editable field", () => {
    render();
    expect(screen.queryByLabelText(/^email/i)).toBeNull();
  });

  it("carries the identity fields too", () => {
    render();
    expect(screen.getByLabelText(/^date of birth/i)).toBeTruthy();
    expect(screen.getByLabelText(/^gender/i)).toBeTruthy();
    expect(screen.getByLabelText(/^phone/i)).toBeTruthy();
  });
});

/**
 * The recruiter half of the guard `profile.test.tsx` carries for the seeker: the
 * update endpoint serves both portals, so every field in its schema must have a
 * control on one of the two pages. `designation` is excluded there and belongs
 * here — without this pair, it has coverage on neither.
 */
describe("the recruiter page covers the recruiter-only fields", () => {
  const SEEKER_ONLY = [
    "bio",
    "skills",
    "experienceYears",
    "location",
    "salaryMin",
    "salaryMax",
    "openToRemote",
  ];
  const FIELDS = Object.keys(profileUpdateBodySchema.shape).filter(
    (f) => !SEEKER_ONLY.includes(f),
  );

  it.each(FIELDS)("renders a labelled control for %s", (field) => {
    render();
    const el = document.body.querySelector<HTMLElement>(`[name="${field}"]`);
    expect(el, `no control on the recruiter profile posts \`${field}\``).not.toBeNull();
    expect(el!.id).not.toBe("");
    expect(document.body.querySelector(`label[for="${el!.id}"]`)).not.toBeNull();
  });
});

describe("who can reach the recruiter profile", () => {
  const recruiter = (status: "pending" | "active") => {
    const store = makeStore();
    store.dispatch(
      setUser({
        id: "r1",
        portal: "recruiter",
        fullName: "Rec",
        email: "r@example.com",
        emailVerified: true,
        avatarUrl: null,
        status,
        profileComplete: true,
        hasPassword: true,
        isMinor: false,
        pendingEmailChange: null,
      }),
    );
    return store;
  };

  it("is reachable by a PENDING recruiter", () => {
    // The whole point of the approval panel. `RequireApproved` replaces the
    // workspace with a notice, so mounting this under it would hide the one page
    // that explains a pending account from the only person who needs it. The API
    // agrees: the profile pair carries no approval gate.
    const view = renderAppAt("/hire/profile", { store: recruiter("pending") });
    expect(view.pathname()).toBe("/hire/profile");
    expect(screen.getByRole("heading", { name: /your account/i, level: 1 })).toBeTruthy();
    expect(screen.getByText(/awaiting approval/i)).toBeTruthy();
  });

  it("is reachable by an approved recruiter", () => {
    const view = renderAppAt("/hire/profile", { store: recruiter("active") });
    expect(view.pathname()).toBe("/hire/profile");
    expect(document.querySelectorAll("body > div header > nav")).toHaveLength(1);
  });

  it("is not reachable without a session", () => {
    const view = renderAppAt("/hire/profile");
    expect(view.pathname()).not.toBe("/hire/profile");
  });
});
