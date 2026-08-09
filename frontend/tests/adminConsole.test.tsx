import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { Portal } from "@jobportal/shared";

import { makeStore, renderAppAt } from "./helpers/renderRoute";
import { appRoutes } from "@/routes/appRoutes";
import { setBootstrapped, setUser } from "@/redux/authSlice";
import { homePathFor } from "@/lib/portalHome";
import { navLinksFor } from "@/components/shared/navLinks";

const paths = appRoutes.flatMap((r) => (r.children ?? []).map((c) => c.path)).filter(Boolean);

function storeWith(portal: Portal) {
  const store = makeStore();
  store.dispatch(
    setUser({
      id: "u1",
      portal,
      fullName: "Console User",
      email: "console@example.com",
      emailVerified: true,
      avatarUrl: null,
      status: "active",
    }),
  );
  store.dispatch(setBootstrapped(true));
  return store;
}

/**
 * The console's route table.
 *
 * 3A shipped the admin portal's backend — the collection, the auth router,
 * `seed:admin` and the two approval endpoints — and no page that called any of
 * it. These assert the pages exist and that the portal gate is on every one.
 */
describe("admin console routes", () => {
  const CONSOLE_PATHS = [
    "/admin/dashboard",
    "/admin/recruiters",
    "/admin/review/jobs",
    "/admin/review/companies",
  ];

  for (const path of CONSOLE_PATHS) {
    it(`mounts ${path}`, () => {
      expect(paths).toContain(path);
    });
  }

  it("resolves the admin portal on every console path", async () => {
    for (const path of CONSOLE_PATHS) {
      const { container, unmount } = renderAppAt(path, { store: storeWith("admin") });
      await waitFor(() =>
        expect(container.querySelector("[data-portal]")?.getAttribute("data-portal")).toBe(
          "admin",
        ),
      );
      unmount();
    }
  });

  /**
   * The gate that matters. A seeker reaching a moderation table would be
   * reading every recruiter's email address.
   *
   * Each wrong portal ends at its OWN home, not merely off the console:
   * `ProtectedRoute` sends them to "/", and `Home` forwards anyone who is not a
   * seeker onward. Asserting the resting place rather than the first hop is what
   * catches a bounce that lands somewhere the user cannot use.
   */
  it("bounces a seeker off every console path", async () => {
    for (const path of CONSOLE_PATHS) {
      const view = renderAppAt(path, { store: storeWith("seeker") });
      await waitFor(() => expect(view.pathname()).toBe("/"));
      view.unmount();
    }
  });

  it("bounces a recruiter off every console path to their own workspace", async () => {
    for (const path of CONSOLE_PATHS) {
      const view = renderAppAt(path, { store: storeWith("recruiter") });
      await waitFor(() => expect(view.pathname()).toBe(homePathFor("recruiter")));
      view.unmount();
    }
  });

  it("bounces an anonymous visitor off every console path", async () => {
    for (const path of CONSOLE_PATHS) {
      const store = makeStore();
      store.dispatch(setBootstrapped(true));
      const view = renderAppAt(path, { store });
      await waitFor(() => expect(view.pathname()).toBe("/"));
      view.unmount();
    }
  });

  /**
   * The console deliberately does NOT take `/admin/jobs` or `/admin/companies`:
   * those prefixes still belong to the pre-3A recruiter workspace redirects, so
   * a recruiter's old bookmark keeps resolving to /hire. Moderation lives under
   * `/admin/review/*` instead.
   */
  it("leaves the pre-3A workspace redirects intact", async () => {
    const cases = [
      ["/admin/jobs/create", "/hire/jobs/create"],
      ["/admin/jobs", "/hire/jobs"],
      ["/admin/companies", "/hire/companies"],
    ] as const;

    for (const [from, to] of cases) {
      const view = renderAppAt(from, { store: storeWith("recruiter") });
      await waitFor(() => expect(view.pathname()).toBe(to));
      view.unmount();
    }
  });
});

/**
 * The post-login destination.
 *
 * `Login.tsx` sent every non-recruiter to "/", so a successfully signed-in
 * admin landed on the seeker job board. That was documented as a known gap
 * through 3A because there was no console page to land on.
 */
describe("post-login destination", () => {
  it("sends an admin to the console, not the seeker board", () => {
    expect(homePathFor("admin")).toBe("/admin/dashboard");
  });

  it("still sends a recruiter to their workspace and a seeker to the board", () => {
    expect(homePathFor("recruiter")).toBe("/hire/companies");
    expect(homePathFor("seeker")).toBe("/");
  });

  it("points at a path the route table actually mounts", () => {
    // A redirect to a route that does not exist renders nothing at all, which
    // is the failure mode this whole phase existed to remove.
    expect(paths).toContain(homePathFor("admin"));
    expect(paths).toContain(homePathFor("recruiter"));
  });
});

describe("admin navigation", () => {
  it("links only to console paths the route table mounts", () => {
    const links = navLinksFor("admin");
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(paths).toContain(link.to);
    }
  });

  it("renders the console sections for a signed-in admin", async () => {
    renderAppAt("/admin/dashboard", { store: storeWith("admin") });
    const nav = await screen.findByRole("navigation", { name: /admin sections/i });
    for (const link of navLinksFor("admin")) {
      expect(nav).toHaveTextContent(link.label);
    }
  });
});
