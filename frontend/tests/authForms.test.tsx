import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";

import { makeStore } from "./helpers/renderRoute";
import Login from "@/components/auth/Login";
import { apiClient } from "@/lib/apiClient";

vi.mock("@/hooks/usePublicJobCount", () => ({
  usePublicJobCount: () => ({ count: null, ready: true }),
}));

function renderLogin(portal: "seeker" | "recruiter") {
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
    await userEvent.type(screen.getByLabelText(/password/i), "password12345");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(post).toHaveBeenCalledWith("/seeker/auth/login", expect.anything());
  });

  it("posts to the recruiter endpoint when mounted as recruiter", async () => {
    const post = vi
      .spyOn(apiClient, "post")
      .mockResolvedValue({ data: { user: { id: "1", portal: "recruiter" } } } as never);

    renderLogin("recruiter");
    await userEvent.type(screen.getByLabelText(/email/i), "a@b.test");
    await userEvent.type(screen.getByLabelText(/password/i), "password12345");
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
