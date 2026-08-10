import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";

import { appRoutes } from "@/routes/appRoutes";
import { renderAppAt } from "./helpers/renderRoute";

/**
 * The SPA fallback (see the rewrite files asserted below) makes this route
 * mandatory rather than nice to have. The host answers an unresolved path with
 * 200 and index.html, so the router receives a path it has no entry for — and
 * before this route existed it matched nothing and rendered nothing. A blank
 * white page is strictly worse than the host 404 it replaced.
 */
describe("the not-found route", () => {
  it("mounts a catch-all in the route table", () => {
    const paths = appRoutes.flatMap((r) => (r.children ?? []).map((c) => c.path));
    expect(paths).toContain("*");
  });

  // Under every prefix: `*` is the last-ranked match everywhere, and each of
  // these resolves a different portal signal through PortalScope.
  it.each(["/no-such-page", "/hire/no-such-page", "/admin/no-such-page"])(
    "renders the not-found page at %s",
    async (entry) => {
      renderAppAt(entry);
      expect(
        await screen.findByRole("heading", { level: 1, name: /page not found/i }),
      ).toBeInTheDocument();
    },
  );

  it("has exactly one h1 at an unmatched path", async () => {
    // Same rule seekerBoard.test.tsx enforces per route. A path that matches
    // nothing is still a route, and it still gets exactly one page title.
    renderAppAt("/no-such-page");
    await waitFor(() => expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1));
  });

  it("offers a way back to the board", async () => {
    renderAppAt("/no-such-page");
    expect(await screen.findByRole("link", { name: /browse open roles/i })).toHaveAttribute(
      "href",
      "/jobs",
    );
  });
});
