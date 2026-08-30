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

  it("proxies API requests on the web origin before the SPA fallback", () => {
    const raw = readFileSync(join(FRONTEND, "vercel.json"), "utf8");
    const config = JSON.parse(raw) as {
      proxy?: { entrypoint?: string; matcher?: string };
    };

    expect(config.proxy).toEqual({ entrypoint: "proxy.js", matcher: "/api/:path*" });

    const proxy = readFileSync(join(FRONTEND, "proxy.js"), "utf8");
    expect(proxy).toMatch(/process\.env\.API_PROXY_ORIGIN/);
    expect(proxy).toMatch(/redirect:\s*["']manual["']/);
  });

  it("vercel.json sends browser security headers without blocking Turnstile", () => {
    const raw = readFileSync(join(FRONTEND, "vercel.json"), "utf8");
    const config = JSON.parse(raw) as {
      headers?: { source: string; headers: { key: string; value: string }[] }[];
    };
    const headers = new Map(config.headers?.[0]?.headers.map(({ key, value }) => [key, value]));

    expect(headers.get("Strict-Transport-Security")).toMatch(/max-age=/);
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(headers.get("Content-Security-Policy")).toContain(
      "script-src 'self' https://challenges.cloudflare.com",
    );
    expect(headers.get("Content-Security-Policy")).toContain(
      "frame-src https://challenges.cloudflare.com",
    );
    expect(headers.get("Content-Security-Policy")).toContain(
      "img-src 'self' data: blob: https://res.cloudinary.com https://*.googleusercontent.com",
    );
  });

  /**
   * The directive that took production down, and the one this file did not look
   * at. It asserted script-src, frame-src and img-src, so tightening connect-src
   * was invisible here.
   *
   * `connect-src` was narrowed to `'self'` on the assumption that browser
   * traffic had moved to the same-origin /api proxy. It had not — the deployed
   * bundle still called the API host directly, so every XHR was refused before
   * it left the page. Measured in Chromium against production: the job board
   * painted its shell, its filters and no data, `GET /api/v1/job/get` failed
   * with `:: csp`, and sign-in could not reach the API at all. On every device,
   * which is what distinguished it from the cross-site cookie bug underneath.
   *
   * The cutover (2026-08-31) completed the move: the deployed bundle calls
   * `/api/v1` on the web origin, so the API host is no longer a connect-src
   * destination — and must not become one again. A policy that re-admits it
   * would let a future bundle call the API directly, putting the session
   * cookie back in the third-party context mobile browsers drop. The
   * deployment runbook's cutover section holds the order everything moved in.
   */
  it("permits XHR only to the web origin the deployed bundle calls", () => {
    const raw = readFileSync(join(FRONTEND, "vercel.json"), "utf8");
    const config = JSON.parse(raw) as {
      headers?: { source: string; headers: { key: string; value: string }[] }[];
    };
    const csp = new Map(
      config.headers?.[0]?.headers.map(({ key, value }) => [key, value]),
    ).get("Content-Security-Policy");

    // Read the directive rather than the whole policy: `toContain` on the
    // policy string would also pass on an origin allowed under img-src or
    // script-src, which does not let a single XHR through.
    const connect = /connect-src ([^;]*)/.exec(csp ?? "")?.[1] ?? "";
    expect(connect).not.toBe("");
    expect(connect).toContain("'self'");
    expect(connect).toContain("https://challenges.cloudflare.com");
    expect(connect).not.toContain("onrender.com");
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

/**
 * `VITE_API_URL` is required to *build*, not merely to run, and getting that
 * wrong produced two failures that both looked like success.
 *
 * The value is inlined as a literal, so with it unset Rolldown proves
 * apiClient's import-time throw always fires, treats everything downstream as
 * unreachable, and tree-shakes the entire application away. That build exits 0
 * and emits a well-formed 275 kB bundle — against a real 874 kB — with a
 * correct hashed filename, no route, no page, and a blank screen with a clean
 * console. It is precisely what a host serves when nobody set its environment
 * variables.
 *
 * The same missing value took the test suite down a different way: ten suites
 * died during collection, having run no test. That was green locally for a week
 * because `.env.local` is gitignored and every developer had one.
 */
describe("the build cannot silently produce an empty bundle", () => {
  const FRONTEND = process.cwd();

  it("vite.config.js fails the build when VITE_API_URL is missing", () => {
    const config = readFileSync(join(FRONTEND, "vite.config.js"), "utf8");
    // Scoped to the plugin's registration rather than the file at large: the
    // comment above it names the variable too, so a source-wide match would
    // pass on a config whose guard had been deleted but documented.
    expect(config).toMatch(/plugins:\s*\[\s*requireApiUrl\(\)/);
    expect(config).toMatch(/apply:\s*["']build["']/);
  });

  it("the suite supplies its own value rather than depending on .env.local", () => {
    // The fix for the ten dead suites. `.env.local` is gitignored, so a test run
    // that needs one is green for whoever wrote it and red on every fresh
    // checkout — which is exactly how this reached main.
    const config = readFileSync(join(FRONTEND, "vitest.config.ts"), "utf8");
    expect(config).toMatch(/env:\s*\{[^}]*VITE_API_URL/);
    expect(import.meta.env.VITE_API_URL).toBeTruthy();
  });

  it("CI builds the web app with the variable set", () => {
    // Without this the guard above turns a silently-hollow bundle into a red
    // build — better, but still a broken pipeline.
    const ci = readFileSync(join(FRONTEND, "..", ".github", "workflows", "ci.yml"), "utf8");
    expect(ci).toMatch(/VITE_API_URL:/);
    expect(ci).toMatch(/VITE_TURNSTILE_SITE_KEY:/);
  });

  it("CD asserts the built bundle actually contains routes", () => {
    // The pre-existing check grepped index.html for a hashed chunk name, which
    // the hollow bundle satisfies — it has one. Only the bundle's contents
    // distinguish the two, so that is what CD has to look at.
    const cd = readFileSync(join(FRONTEND, "..", ".github", "workflows", "cd.yml"), "utf8");
    expect(cd).toMatch(/tree-shaken away/);
    expect(cd).toMatch(/hire\/login/);
  });
});
