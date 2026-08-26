import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CompleteProfile from "@/components/identity/CompleteProfile";
import { setUser } from "@/redux/authSlice";
import { makeStore, renderAppAt, renderRoute } from "./helpers/renderRoute";

const seeker = {
  id: "1",
  portal: "seeker" as const,
  fullName: "A B",
  email: "a@b.co",
  emailVerified: true,
  avatarUrl: null,
  status: "active" as const,
  profileComplete: false,
};

function renderStep() {
  const store = makeStore();
  store.dispatch(setUser(seeker));
  return renderRoute(<CompleteProfile portal="seeker" />, {
    route: "/complete-profile",
    store,
  });
}

describe("the completion step", () => {
  it("asks for a date of birth, a phone and a gender", () => {
    renderStep();
    expect(screen.getByLabelText(/^date of birth/i)).toBeTruthy();
    expect(screen.getByLabelText(/^phone/i)).toBeTruthy();
    expect(screen.getByLabelText(/^gender/i)).toBeTruthy();
  });

  it("marks only the date of birth required", () => {
    renderStep();
    // `aria-required`, not the visible `*`: FormField marks the asterisk
    // `aria-hidden`, so it is deliberately absent from the accessible name.
    expect(screen.getByLabelText(/^date of birth/i)).toHaveAttribute("aria-required", "true");
    expect(screen.getByLabelText(/^phone/i)).not.toHaveAttribute("aria-required");
    expect(screen.getByLabelText(/^gender/i)).not.toHaveAttribute("aria-required");
  });

  it("offers every gender option including a way to decline", () => {
    renderStep();
    expect(screen.getByRole("option", { name: /prefer not to say/i })).toBeTruthy();
    expect(screen.getByRole("option", { name: /non-binary/i })).toBeTruthy();
  });

  it("says the platform is 18 and over", () => {
    renderStep();
    expect(screen.getByText(/18 or over/i)).toBeTruthy();
  });

  it("keeps a way off the page, so it is not a trap", () => {
    // RequireApproved's lesson: the Navbar stays so a blocked user can still
    // reach the account menu and sign out. Without it this is a page with no way
    // off it.
    renderStep();
    expect(screen.getByRole("navigation")).toBeTruthy();
  });
});

describe("the completion routes", () => {
  // One render per test: two `renderAppAt` calls in the same test leave two
  // location probes in the document and every lookup becomes ambiguous.
  it("mounts a seeker path", () => {
    const store = makeStore();
    store.dispatch(setUser(seeker));
    expect(renderAppAt("/complete-profile", { store }).pathname()).toBe("/complete-profile");
  });

  it("mounts a recruiter path", () => {
    const store = makeStore();
    store.dispatch(setUser({ ...seeker, portal: "recruiter" }));
    expect(renderAppAt("/hire/complete-profile", { store }).pathname())
      .toBe("/hire/complete-profile");
  });

  it("does not redirect away from the completion step itself", () => {
    // The guard must not wrap this route, or it redirects to itself forever.
    const store = makeStore();
    store.dispatch(setUser(seeker));
    const view = renderAppAt("/complete-profile", { store });
    expect(view.pathname()).toBe("/complete-profile");
  });

  it("still requires a session to reach it", () => {
    // Inside ProtectedRoute: it writes to the caller's own account, so an
    // anonymous visitor has nothing to complete.
    const view = renderAppAt("/complete-profile");
    expect(view.pathname()).not.toBe("/complete-profile");
  });
});

describe("the guard on gated subtrees", () => {
  it("redirects an incomplete seeker off the profile page", () => {
    // Assert the destination page RENDERED, not the URL: useAuthBootstrap sits
    // above the router, so redirect chains resolve differently in jsdom.
    const store = makeStore();
    store.dispatch(setUser(seeker));
    renderAppAt("/profile", { store });
    expect(screen.getByText(/a few details before you start/i)).toBeTruthy();
  });

  it("lets a complete seeker through to the profile page", () => {
    const store = makeStore();
    store.dispatch(setUser({ ...seeker, profileComplete: true }));
    renderAppAt("/profile", { store });
    expect(screen.queryByText(/a few details before you start/i)).toBeNull();
  });

  it("redirects an incomplete recruiter off the workspace", () => {
    const store = makeStore();
    store.dispatch(setUser({ ...seeker, portal: "recruiter" }));
    renderAppAt("/hire/jobs", { store });
    expect(screen.getByText(/a few details before you start/i)).toBeTruthy();
  });

  it("leaves the public board open to an incomplete session", () => {
    const store = makeStore();
    store.dispatch(setUser(seeker));
    const view = renderAppAt("/jobs", { store });
    expect(view.pathname()).toBe("/jobs");
  });
});
