import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router";
import { render, screen, waitFor } from "@testing-library/react";
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

function renderSignup(portal: Exclude<Portal, "admin">) {
  return render(
    <Provider store={makeStore()}>
      <MemoryRouter>
        <Signup portal={portal} />
      </MemoryRouter>
    </Provider>,
  );
}

describe("Login", () => {
  beforeEach(() => vi.restoreAllMocks());
  // The transport tests below stub VITE_API_URL per test; never let one leak
  // into the next, where it would silently flip which start path every later
  // assertion exercises.
  afterEach(() => vi.unstubAllEnvs());

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

  /**
   * A sign-in page is one click from a session-creating request, and on a
   * free-tier host that request can meet an instance that has to boot first —
   * 30–60 seconds that read as a hang. The wake fires at VIEW time so the
   * click usually finds the instance already up, and keeps retrying until the
   * API answers, because the proxy gives up on a sleeping instance long before
   * the boot completes and one failed attempt does not repeat itself.
   */
  it("wakes the API when the login page is viewed, and stops once it answers", async () => {
    const get = vi.spyOn(apiClient, "get").mockResolvedValue({ data: {} } as never);
    renderLogin("seeker");
    await waitFor(() => expect(get).toHaveBeenCalledWith("/health"));
    // Give any stray retry timer room to fire and prove none does.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("keeps knocking at a sleeping API until it answers", async () => {
    vi.useFakeTimers();
    try {
      const get = vi
        .spyOn(apiClient, "get")
        .mockRejectedValueOnce(new Error("proxy gave up") as never)
        .mockRejectedValueOnce(new Error("proxy gave up") as never)
        .mockResolvedValue({ data: {} } as never);

      renderLogin("seeker");
      await vi.advanceTimersByTimeAsync(30_000);

      // First knock on mount, second at +12s, third at +24s — which answers.
      expect(get).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * Same-origin deployments (VITE_API_URL = "/api/v1") fetch the Google start
   * and navigate only once the consent URL is in hand, so the button — not the
   * host's cold-start page — owns the wait. Cross-site deployments keep the
   * navigation (the test above covers that path with the config's absolute
   * URL): the transaction cookie set on a fetched cross-site response would be
   * third-party, and the callback would arrive looking for it as a first
   * party and miss.
   */
  it("fetches the Google start when the API is same-origin, and navigates to the URL it answers", async () => {
    const url = "https://accounts.google.com/o/oauth2/v2/auth?client_id=abc";
    const post = vi
      .spyOn(apiClient, "post")
      .mockResolvedValue({ data: { success: true, url } } as never);
    vi.spyOn(apiClient, "get").mockResolvedValue({ data: {} } as never);
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign },
    });
    vi.stubEnv("VITE_API_URL", "/api/v1");

    renderLogin("seeker");
    await userEvent.click(screen.getByRole("button", { name: /continue with google/i }));

    expect(post).toHaveBeenCalledWith("/seeker/auth/google/start");
    const pending = screen.getByRole("button", { name: /taking you to google/i });
    expect(pending).toBeDisabled();
    await waitFor(() => expect(assign).toHaveBeenCalledWith(url));
  });

  it("refuses to navigate to a start URL that is not absolute https", async () => {
    // The URL comes from our API, but the navigation is top-level and the
    // value is server-controlled text; "//evil.test" or "javascript:" must
    // read as a failed start, never as somewhere to send the browser.
    vi.spyOn(apiClient, "post")
      .mockResolvedValue({ data: { success: true, url: "//evil.test/consent" } } as never);
    vi.spyOn(apiClient, "get").mockResolvedValue({ data: {} } as never);
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign },
    });
    vi.stubEnv("VITE_API_URL", "/api/v1");

    renderLogin("seeker");
    await userEvent.click(screen.getByRole("button", { name: /continue with google/i }));

    await screen.findByRole("alert");
    expect(assign).not.toHaveBeenCalled();
    // The failure is recoverable where the person is: the button takes clicks
    // again, and a retry goes through the same fetched start.
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeEnabled();
  });

  it("keeps the page and says what to do when the fetched start itself fails", async () => {
    vi.spyOn(apiClient, "post").mockRejectedValue(new Error("wake lost") as never);
    vi.spyOn(apiClient, "get").mockResolvedValue({ data: {} } as never);
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign },
    });
    vi.stubEnv("VITE_API_URL", "/api/v1");

    renderLogin("seeker");
    await userEvent.click(screen.getByRole("button", { name: /continue with google/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/couldn't reach google sign-in/i);
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeEnabled();
    expect(assign).not.toHaveBeenCalled();
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

  it.each(["seeker", "recruiter"] satisfies Array<Exclude<Portal, "admin">>)(
    "offers Google signup to a %s",
    (portal) => {
      renderSignup(portal);
      expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument();
    },
  );

  it("wakes the API when the signup page is viewed, and stops once it answers", async () => {
    // Same reason as the login screen: the register POST — or the fetched
    // Google start beside it — is the request most likely to meet a sleeping
    // instance.
    const get = vi.spyOn(apiClient, "get").mockResolvedValue({ data: {} } as never);
    renderSignup("seeker");
    await waitFor(() => expect(get).toHaveBeenCalledWith("/health"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(get).toHaveBeenCalledTimes(1);
  });
});
