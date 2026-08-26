import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";

import type { Portal } from "@jobportal/shared";

import { makeStore } from "./helpers/renderRoute";
import Login from "@/components/auth/Login";
import Signup from "@/components/auth/Signup";
import { AUTH_COPY } from "@/components/auth/authCopy";
import { apiClient } from "@/lib/apiClient";

vi.mock("@/hooks/usePublicJobCount", () => ({
  usePublicJobCount: () => ({ count: null, ready: true }),
}));

function renderLogin(portal: Portal) {
  return render(
    <Provider store={makeStore()}>
      <MemoryRouter>
        <div data-portal={portal}>
          <Login portal={portal} />
        </div>
      </MemoryRouter>
    </Provider>,
  );
}

describe("Login", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("has no portal selector", () => {
    // Regression, bug 1. The native radio was unstylable (Chrome's
    // accent-color, immune to theme and portal) and let the posted endpoint
    // disagree with the signal colour PortalScope resolved from the URL.
    const { container } = renderLogin("seeker");
    expect(container.querySelector('input[type="radio"]')).toBeNull();
  });

  it("posts to the seeker endpoint when mounted as seeker", async () => {
    const post = vi
      .spyOn(apiClient, "post")
      .mockResolvedValue({ data: { user: { id: "1", portal: "seeker" } } } as never);

    renderLogin("seeker");
    await userEvent.type(screen.getByLabelText(/email/i), "a@b.test");
    await userEvent.type(screen.getByLabelText(/password/i, { selector: "input" }), "password12345");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(post).toHaveBeenCalledWith("/seeker/auth/login", expect.anything());
  });

  it("posts to the recruiter endpoint when mounted as recruiter", async () => {
    const post = vi
      .spyOn(apiClient, "post")
      .mockResolvedValue({ data: { user: { id: "1", portal: "recruiter" } } } as never);

    renderLogin("recruiter");
    await userEvent.type(screen.getByLabelText(/email/i), "a@b.test");
    await userEvent.type(screen.getByLabelText(/password/i, { selector: "input" }), "password12345");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(post).toHaveBeenCalledWith("/recruiter/auth/login", expect.anything());
  });

  it("points forgot-password at its own portal", () => {
    renderLogin("recruiter");
    expect(screen.getByRole("link", { name: /forgot/i })).toHaveAttribute(
      "href",
      "/forgot-password?portal=recruiter",
    );
  });

  it("points signup at its own portal", () => {
    renderLogin("recruiter");
    expect(screen.getByRole("link", { name: /create one/i })).toHaveAttribute(
      "href",
      "/hire/signup",
    );
  });

  it.each(["seeker", "recruiter"] satisfies Portal[])(
    "offers Google sign-in to a %s",
    (portal) => {
      renderLogin(portal);
      expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument();
    },
  );

  /**
   * `buildAuthRouter` mounts the Google routes only when `portal !== "admin"` —
   * "the routes do not exist rather than existing and refusing". The button was
   * rendered unconditionally, so the console door showed a control that navigated
   * to `/admin/auth/google` and got a 404. Verified against the running API:
   * seeker and recruiter answer 302, admin answers 404.
   */
  it("offers an admin no Google sign-in, the API mounting no route for it", () => {
    renderLogin("admin");
    expect(screen.queryByRole("button", { name: /continue with google/i })).not.toBeInTheDocument();
  });

  it("names each portal's own Google start endpoint, and none for admin", () => {
    expect(AUTH_COPY.seeker.googleStartPath).toBe("/seeker/auth/google");
    expect(AUTH_COPY.recruiter.googleStartPath).toBe("/recruiter/auth/google");
    expect(AUTH_COPY.admin.googleStartPath).toBeNull();
  });

  it("marks Google sign-in with Google's own logo", () => {
    renderLogin("seeker");
    const button = screen.getByRole("button", { name: /continue with google/i });
    // The mark is what makes the control recognisable; without it the button read
    // as a second submit under the first.
    expect(button.querySelector("svg")).not.toBeNull();
  });

  /**
   * `location.assign` is a full top-level navigation, so the page stays put until
   * Google answers. With no feedback the button looked inert for the length of
   * that round trip, which reads as a failed click and invites a second one.
   */
  it("shows Google sign-in as pending once clicked, and stops taking clicks", async () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign },
    });

    renderLogin("seeker");
    await userEvent.click(screen.getByRole("button", { name: /continue with google/i }));

    expect(assign).toHaveBeenCalledWith("http://localhost:8000/api/v1/seeker/auth/google");
    const pending = screen.getByRole("button", { name: /taking you to google/i });
    expect(pending).toBeDisabled();

    await userEvent.click(pending);
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it("renders exactly one signal-filled primary action", () => {
    // Regression, bug 2: the form's primary was --ink while the navbar's was
    // the portal signal, so the page's main action did not match the app's.
    const { container } = renderLogin("seeker");
    const signalButtons = container.querySelectorAll(
      '[data-slot="button"][data-variant="signal"]',
    );
    expect(signalButtons).toHaveLength(1);
  });
});

describe("Signup", () => {
  it("does not ask for a phone number", () => {
    // It moved to the completion step, which is the one place both a password
    // and a Google registration pass through.
    render(
      <Provider store={makeStore()}>
        <MemoryRouter>
          <Signup portal="seeker" />
        </MemoryRouter>
      </Provider>,
    );
    expect(screen.queryByLabelText(/^phone/i)).toBeNull();
  });
});
