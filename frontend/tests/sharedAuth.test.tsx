import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import { render } from "@testing-library/react";
import { Provider } from "react-redux";

import { makeStore } from "./helpers/renderRoute";
import VerifyEmail from "@/components/auth/VerifyEmail";
import ForgotPassword from "@/components/auth/ForgotPassword";
import ResetPassword from "@/components/auth/ResetPassword";
import LinkPending from "@/components/auth/LinkPending";
import AuthError from "@/components/auth/AuthError";
import ConfirmGoogleLink from "@/components/auth/ConfirmGoogleLink";

vi.mock("@/hooks/usePublicJobCount", () => ({
  usePublicJobCount: () => ({ count: null, ready: true }),
}));

function renderAt(ui: ReactElement, route: string) {
  return render(
    <Provider store={makeStore()}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
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
