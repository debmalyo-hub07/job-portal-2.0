import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { render } from "@testing-library/react";

import type { Portal } from "@jobportal/shared";

import { AuthLayout } from "@/components/auth/AuthLayout";

vi.mock("@/hooks/usePublicJobCount", () => ({
  usePublicJobCount: () => ({ count: null, ready: true }),
}));

function renderAuth(portal: Portal) {
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

  it.each([
    ["seeker", "/"],
    ["recruiter", "/hire"],
  ] satisfies Array<[Portal, string]>)(
    "points a %s back at its portal's public home",
    (portal, home) => {
      const { getByRole } = renderAuth(portal);
      expect(getByRole("link", { name: /back/i })).toHaveAttribute("href", home);
    },
  );

  /**
   * Admin has no public home, so it gets no Back link and an unlinked wordmark.
   *
   * `/admin` resolves to the sign-in when there is no session, so pointing these
   * two controls at it made both no-ops: click either one on `/admin/login` and
   * the redirect returned you to the page you were leaving. The recruiter portal
   * had the same defect and was fixed by giving `/hire` its landing page back;
   * the console has no marketing page to restore and will not get one, so here
   * the honest answer is to render no control at all rather than one that lies.
   *
   * Nothing is stranded: every shared auth screen carries its own link to
   * `copy.loginHref`, and `/admin/login` is a URL you arrive at by typing it.
   */
  it("offers an admin no Back link, having nowhere public to go", () => {
    const { queryByRole } = renderAuth("admin");
    expect(queryByRole("link", { name: /back/i })).not.toBeInTheDocument();
  });

  it("renders the admin wordmark as text rather than a link", () => {
    const { queryByRole, getByText } = renderAuth("admin");
    expect(getByText("Cairn")).toBeInTheDocument();
    expect(queryByRole("link", { name: /cairn/i })).not.toBeInTheDocument();
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

  /**
   * The motion tier the panel's field needs. `--motion-ambient-amplitude` is
   * resolved through the layout's `data-motion` ancestor chain — without the
   * attribute no tier is set, the property reads as unparseable, and the
   * admin panel's field would never paint. jsdom reads inline custom
   * properties on computed style (see motionTiers.ts for why the values are
   * inline at all), so the indirection is assertable here, not just in the
   * visual suite.
   */
  it("runs the ambient motion tier", () => {
    const { container } = renderAuth("admin");
    const layout = container.querySelector(".auth-layout") as HTMLElement;
    expect(layout).toHaveAttribute("data-motion", "ambient");
    // The tier's vars are declared, so an Atmosphere on this surface reads a
    // number rather than the empty string.
    expect(getComputedStyle(layout).getPropertyValue("--motion-ambient-amplitude")).toContain(
      "var(--motion-ambient)",
    );
  });

  /**
   * The admin panel's face is the Atmosphere field, not a photograph. The
   * seeker hero used to stand in for it — one photo doing four jobs across
   * the app — which left the rose portal wearing the candidates' picture.
   * What each portal's panel carries is the identity claim; assert both
   * halves so a regression in either direction is caught.
   */
  it.each([
    ["seeker", "img"],
    ["recruiter", "img"],
    ["admin", "canvas"],
  ] satisfies Array<[Portal, "img" | "canvas"]>)(
    "the %s panel carries a %s and nothing of the other kind",
    (portal, medium) => {
      const { container } = renderAuth(portal);
      const panel = container.querySelector(".auth-visual") as HTMLElement;
      expect(panel, "the PortalPanel aside must render").not.toBeNull();
      expect(panel.querySelector(medium)).not.toBeNull();
      const other = medium === "img" ? "canvas" : "img";
      expect(panel.querySelector(other)).toBeNull();
    },
  );
});
