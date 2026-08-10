import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

/**
 * The client routes on the client. A static host knows nothing about the route
 * table, so it must serve index.html for any path it cannot resolve to a file —
 * otherwise every deep link, refresh and bookmark 404s and only `/` works.
 *
 * Measured before this shipped, against a fresh dist served naively: `/` → 200,
 * and /jobs, /hire/login, /admin/review/jobs, /profile and /browse all → 404.
 */
describe("SPA fallback config", () => {
  const FRONTEND = process.cwd();

  it("vercel.json rewrites every unresolved path to index.html", () => {
    const raw = readFileSync(join(FRONTEND, "vercel.json"), "utf8");
    // Malformed JSON is a deploy-time failure otherwise, and Vercel reports it
    // as a build error with no hint that the rewrite is the cause.
    const config = JSON.parse(raw) as { rewrites?: { source: string; destination: string }[] };
    expect(config.rewrites).toBeDefined();
    expect(config.rewrites).toContainEqual({ source: "/(.*)", destination: "/index.html" });
  });

  it("public/_redirects serves Netlify and Cloudflare with a 200, not a redirect", () => {
    // In public/ so Vite copies it into dist verbatim — no build step, and it
    // cannot drift from the output directory.
    const rule = readFileSync(join(FRONTEND, "public", "_redirects"), "utf8");
    const active = rule
      .split(/\r?\n/)
      .map((l) => l.trim().replace(/\s+/g, " "))
      .filter((l) => l && !l.startsWith("#"));

    expect(active).toContain("/* /index.html 200");
    // 200 is load-bearing. A 302 rewrites the address bar, and the client
    // router reads the original path off window.location — so a redirect
    // discards the route it was meant to preserve.
    expect(active.some((l) => /\b30[128]\b/.test(l))).toBe(false);
  });
});
