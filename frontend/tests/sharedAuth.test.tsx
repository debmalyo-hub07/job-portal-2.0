import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { toast } from "sonner";

import { makeStore } from "./helpers/renderRoute";
import VerifyEmail from "@/components/auth/VerifyEmail";
import ForgotPassword from "@/components/auth/ForgotPassword";
import ResetPassword from "@/components/auth/ResetPassword";
import LinkPending from "@/components/auth/LinkPending";
import AuthError from "@/components/auth/AuthError";
import ConfirmGoogleLink from "@/components/auth/ConfirmGoogleLink";
import { apiClient } from "@/lib/apiClient";

vi.mock("@/hooks/usePublicJobCount", () => ({
  usePublicJobCount: () => ({ count: null, ready: true }),
}));

afterEach(() => vi.restoreAllMocks());

function LocationProbe() {
  const { pathname } = useLocation();
  return <div data-testid="location" data-pathname={pathname} />;
}

function renderAt(ui: ReactElement, route: string) {
  return render(
    <Provider store={makeStore()}>
      <MemoryRouter initialEntries={[route]}>
        {ui}
        <LocationProbe />
      </MemoryRouter>
    </Provider>,
  );
}

describe("shared auth pages", () => {
  it("VerifyEmail renders no marketing navbar", () => {
    const { queryByRole } = renderAt(
      <VerifyEmail />,
      "/verify-email?portal=seeker&email=a@b.test",
    );
    expect(queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("VerifyEmail shows the address it is verifying", () => {
    const { getByText } = renderAt(
      <VerifyEmail />,
      "/verify-email?portal=seeker&email=a@b.test",
    );
    expect(getByText("a@b.test")).toBeInTheDocument();
  });

  it("renders no portal selector on any shared page", () => {
    const { container } = renderAt(<ForgotPassword />, "/forgot-password?portal=seeker");
    expect(container.querySelector('input[type="radio"]')).toBeNull();
  });

  it("ForgotPassword still reads the portal from the query param", () => {
    // These pages are reached by redirect from the OAuth callback, which targets
    // portal-neutral paths carrying ?portal=. The param stays load-bearing here
    // even though PortalScope ignores it.
    const { getByRole } = renderAt(<ForgotPassword />, "/forgot-password?portal=recruiter");
    expect(getByRole("button", { name: /send/i })).toBeInTheDocument();
  });

  it("ResetPassword points a recruiter back to the recruiter login", () => {
    // The inherited pages hardcoded /login, which drops a recruiter on the
    // seeker form where their credentials do not work.
    const { getByRole } = renderAt(
      <ResetPassword />,
      "/reset-password?portal=recruiter&email=a@b.test",
    );
    expect(getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/hire/login");
  });

  it("ConfirmGoogleLink points a recruiter back to the recruiter login", () => {
    const { getByRole } = renderAt(
      <ConfirmGoogleLink />,
      "/auth/confirm-google-link?portal=recruiter&token=t",
    );
    expect(getByRole("link", { name: /back to sign in/i })).toHaveAttribute(
      "href",
      "/hire/login",
    );
  });

  it("LinkPending renders without a portal in the URL", () => {
    // The backend redirects here with no ?portal=, so it falls back to seeker.
    const { getByRole } = renderAt(<LinkPending />, "/auth/link-pending");
    expect(getByRole("heading", { level: 1 })).toHaveTextContent(/check your email/i);
  });

  it("AuthError renders only the mapped message, never the raw code", () => {
    const { getByText, queryByText } = renderAt(
      <AuthError />,
      "/auth/error?code=<script>alert(1)</script>",
    );
    expect(getByText(/something went wrong/i)).toBeInTheDocument();
    expect(queryByText(/script/i)).not.toBeInTheDocument();
  });
});

/**
 * `?portal=` resolves through `portalSchema`, so all three portals survive it.
 *
 * `usePortalParam` was written when there were two portals and read
 * `=== "recruiter" ? "recruiter" : "seeker"`. 3A added the admin portal and did
 * not revisit it, so every `?portal=admin` link silently resolved to `seeker`
 * for the seven shared OAuth/OTP pages that read the param.
 *
 * It reached production. An admin clicking "Forgot password?" on /admin/login
 * posted to `/seeker/auth/forgot-password`, which found no seeker and answered
 * the deliberate uniform success — no error, no email, nothing in any log. The
 * anti-enumeration design that makes that endpoint safe is exactly what made
 * the bug invisible, and it blocked the only route into the admin console.
 *
 * These assert the posted URL rather than the rendered output: the portal is
 * only observable in where the request goes, which is what actually broke.
 */
describe("shared auth pages resolve every portal from ?portal=", () => {
  const cases = [
    ["seeker", "/seeker/auth/forgot-password"],
    ["recruiter", "/recruiter/auth/forgot-password"],
    ["admin", "/admin/auth/forgot-password"],
  ] as const;

  for (const [portal, endpoint] of cases) {
    it(`ForgotPassword posts to ${endpoint} for portal=${portal}`, async () => {
      const post = vi.spyOn(apiClient, "post").mockResolvedValue({ data: {} } as never);

      const { getByLabelText, getByRole } = renderAt(
        <ForgotPassword />,
        `/forgot-password?portal=${portal}`,
      );
      await userEvent.type(getByLabelText(/email/i), "a@b.test");
      await userEvent.click(getByRole("button", { name: /send reset code/i }));

      expect(post).toHaveBeenCalledWith(endpoint, { email: "a@b.test" });
      post.mockRestore();
    });
  }

  it("falls back to seeker for a portal that does not exist", async () => {
    // The value becomes a URL segment on the next request, so an invented or
    // hand-edited one must degrade rather than travel.
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ data: {} } as never);

    const { getByLabelText, getByRole } = renderAt(
      <ForgotPassword />,
      "/forgot-password?portal=../../admin",
    );
    await userEvent.type(getByLabelText(/email/i), "a@b.test");
    await userEvent.click(getByRole("button", { name: /send reset code/i }));

    expect(post).toHaveBeenCalledWith("/seeker/auth/forgot-password", expect.anything());
    post.mockRestore();
  });

  it("keeps the email form open when the OTP request is rate limited", async () => {
    vi.spyOn(apiClient, "post").mockRejectedValue({
      isAxiosError: true,
      message: "Request failed with status code 429",
      response: {
        status: 429,
        data: { code: "RATE_LIMITED", message: "Too many requests." },
      },
    });
    const errorToast = vi.spyOn(toast, "error").mockImplementation(() => "toast-id");

    const view = renderAt(<ForgotPassword />, "/forgot-password?portal=admin");
    await userEvent.type(view.getByLabelText(/email/i), "a@b.test");
    await userEvent.click(view.getByRole("button", { name: /send reset code/i }));

    await waitFor(() => {
      expect(errorToast).toHaveBeenCalledWith("Too many codes requested. Try again later.");
    });
    expect(view.getByTestId("location")).toHaveAttribute("data-pathname", "/forgot-password");
    expect(view.getByRole("button", { name: /send reset code/i })).toBeEnabled();
  });
});
