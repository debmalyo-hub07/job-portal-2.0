import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError } from "axios";
import { UNDER_AGE_MESSAGE } from "@jobportal/shared";
import { describe, expect, it, vi } from "vitest";
import CompleteProfile from "@/components/identity/CompleteProfile";
import { apiClient } from "@/lib/apiClient";
import { getApiErrorMessage } from "@/lib/apiError";
import { setSingleJob } from "@/redux/jobSlice";
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

describe("the Apply button's 403", () => {
  /**
   * `/description/:id` is PUBLIC, so an incomplete seeker reaches Apply without
   * ever passing `RequireProfileComplete`. Every recruiter write lives inside the
   * guarded workspace, which is why this is the only call site that needs it — and
   * why the server-side gate is the one that actually matters.
   */
  it("sends an incomplete seeker to the completion step", async () => {
    const job = {
      id: "job-1",
      title: "Backend Engineer",
      description: "Work on the API.",
      requirements: [],
      salary: 12,
      location: "Kolkata",
      jobType: "Full-time",
      position: 1,
      status: "open",
      company: { id: "c1", name: "Acme", logo: null },
      created_by: null,
      createdAt: "2026-08-01T00:00:00.000Z",
      fit: null,
    };
    vi.spyOn(apiClient, "get").mockImplementation(((url: string) =>
      url.startsWith("/job/get")
        ? Promise.resolve({ data: { success: true, job } })
        : Promise.resolve({
            data: { success: true, items: [], total: 0, page: 1, pages: 1 },
          })) as never);
    // A real AxiosError: `getApiErrorCode` returns null for anything else, so a
    // hand-rolled `{ response: { data } }` would silently take the fallback path
    // and this test would pass against no implementation at all.
    const rejection = new AxiosError("Forbidden", "ERR_BAD_REQUEST", undefined, undefined, {
      status: 403,
      data: { success: false, code: "PROFILE_INCOMPLETE", message: "Add your date of birth." },
    } as never);
    vi.spyOn(apiClient, "post").mockRejectedValue(rejection);

    const store = makeStore();
    store.dispatch(setUser(seeker));
    store.dispatch(setSingleJob(job as never));
    // The real route table, so the assertion is the destination the user actually
    // lands on rather than a spy on `useNavigate`.
    const view = renderAppAt("/description/job-1", { store });

    await userEvent.click(await screen.findByRole("button", { name: /^apply/i }));
    await waitFor(() => expect(view.pathname()).toBe("/complete-profile"));
    vi.restoreAllMocks();
  });
});

/**
 * Every post-authentication redirect, asserted at the guard rather than the form.
 *
 * A real-browser check found `GuestRoute` sending a freshly signed-in seeker to
 * `/jobs` while Login was navigating to `/complete-profile` — the guard's redirect
 * fires the moment `setUser` lands, still mounted, and wins the race. The identity
 * step was reachable only by typing its URL, and every jsdom test passed.
 */
describe("every route that lands a signed-in session", () => {
  const store = (over: Partial<typeof seeker> = {}) => {
    const s = makeStore();
    s.dispatch(setUser({ ...seeker, ...over }));
    return s;
  };

  it("sends an incomplete seeker from the login screen to the completion step", () => {
    const view = renderAppAt("/login", { store: store() });
    expect(view.pathname()).toBe("/complete-profile");
  });

  it("sends an incomplete seeker from the signup screen to the completion step", () => {
    const view = renderAppAt("/signup", { store: store() });
    expect(view.pathname()).toBe("/complete-profile");
  });

  it("sends an incomplete recruiter from its own login screen to its own step", () => {
    const view = renderAppAt("/hire/login", {
      store: store({ portal: "recruiter" } as never),
    });
    expect(view.pathname()).toBe("/hire/complete-profile");
  });

  it("still sends a COMPLETE session to the portal home", () => {
    const view = renderAppAt("/login", { store: store({ profileComplete: true }) });
    expect(view.pathname()).toBe("/jobs");
  });

  it("never sends an admin to a completion step it has no route for", () => {
    const view = renderAppAt("/admin/login", {
      store: store({ portal: "admin", profileComplete: true } as never),
    });
    expect(view.pathname()).toBe("/admin/dashboard");
  });
});

describe("a validation refusal explains itself", () => {
  const validationError = (message: string) =>
    new AxiosError("Bad Request", "ERR_BAD_REQUEST", undefined, undefined, {
      status: 400,
      data: {
        success: false,
        code: "VALIDATION_ERROR",
        message: "Request validation failed.",
        details: [{ path: ["dob"], message }],
      },
    } as never);

  it("shows the schema's own sentence, not the generic envelope message", () => {
    // The under-18 refusal is the one on this platform that has to explain itself,
    // because it means "not yet" rather than "no". A real browser showed it as
    // "Request validation failed."
    expect(getApiErrorMessage(validationError(UNDER_AGE_MESSAGE))).toBe(UNDER_AGE_MESSAGE);
  });

  it("falls back to the envelope message when there are no details", () => {
    const bare = new AxiosError("Conflict", "ERR_BAD_REQUEST", undefined, undefined, {
      status: 409,
      data: { success: false, code: "EMAIL_TAKEN", message: "An account already exists." },
    } as never);
    expect(getApiErrorMessage(bare)).toBe("An account already exists.");
  });
});
