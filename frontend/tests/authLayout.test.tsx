import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render } from "@testing-library/react";

import { AuthLayout } from "@/components/auth/AuthLayout";

vi.mock("@/hooks/usePublicJobCount", () => ({
  usePublicJobCount: () => ({ count: null, ready: true }),
}));

function renderAuth(portal: "seeker" | "recruiter") {
  return render(
    <MemoryRouter>
      <div data-portal={portal}>
        <AuthLayout portal={portal} title="Welcome back">
          <button>Continue</button>
        </AuthLayout>
      </div>
    </MemoryRouter>,
  );
}

describe("AuthLayout", () => {
  it("renders its title as the h1", () => {
    const { getByRole } = renderAuth("seeker");
    expect(getByRole("heading", { level: 1 })).toHaveTextContent("Welcome back");
  });

  it("renders the form children", () => {
    const { getByRole } = renderAuth("seeker");
    expect(getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  it("links a seeker to the recruiter world", () => {
    const { getByRole } = renderAuth("seeker");
    expect(getByRole("link", { name: /hiring/i })).toHaveAttribute("href", "/hire");
  });

  it("links a recruiter to the seeker world", () => {
    const { getByRole } = renderAuth("recruiter");
    expect(getByRole("link", { name: /browse jobs/i })).toHaveAttribute("href", "/");
  });

  it("renders no marketing navbar", () => {
    // Auth is a full-height split; the wordmark lives in the form column.
    const { queryByRole } = renderAuth("seeker");
    expect(queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("renders no portal selector", () => {
    // Regression, bug 1: the portal is a route literal, so no control picks it.
    const { container } = renderAuth("seeker");
    expect(container.querySelector('input[type="radio"]')).toBeNull();
  });
});
