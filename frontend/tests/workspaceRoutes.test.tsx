import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation, useRoutes } from "react-router";

import { appRoutes } from "@/routes/appRoutes";
import { portalForPath } from "@/lib/portalRoutes";
import { makeQueryClient, makeStore } from "./helpers/renderRoute";
import { setUser } from "@/redux/authSlice";

/**
 * Anchored to the vitest root rather than `import.meta.url`: under the vite
 * transform that URL is not drive-qualified on Windows, so the first version of
 * this scan resolved to `D:\src` and never read a single file.
 */
const SRC = join(process.cwd(), "src");

/**
 * The route table is the one place allowed to name a pre-3A workspace path: a
 * redirect cannot rewrite a URL without naming it. Everywhere else a /admin
 * workspace literal is a dead link.
 */
const ROUTE_TABLE = join("routes", "appRoutes.tsx");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

/**
 * The recruiter workspace moved from /admin/* to /hire/* in Phase 3A, because
 * /admin now resolves to the ADMIN portal.
 *
 * This is a source scan rather than a render assertion on purpose: a leftover
 * `navigate("/admin/companies")` still compiles and still typechecks. It fails
 * only at runtime, as a dead link that lands an authenticated recruiter on a
 * route that no longer exists. Nothing but reading the source catches it — and
 * a grep for `"/admin` misses the template-literal call sites entirely, which
 * is how three of them survived the first pass.
 */
describe("no stale workspace links", () => {
  const files = sourceFiles(SRC);

  // A scan that reads nothing passes every assertion below. Fail loudly instead.
  it("actually reads the source tree", () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files.map((f) => relative(SRC, f))).toContain(ROUTE_TABLE);
  });

  it.each(["companies", "jobs"])("no /admin/%s literal survives in src", (segment) => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(SRC, file);
      if (rel === ROUTE_TABLE) continue;
      readFileSync(file, "utf8")
        .split(/\r?\n/)
        .forEach((line, i) => {
          if (line.includes(`/admin/${segment}`)) {
            offenders.push(`${rel.split(sep).join("/")}:${i + 1}  ${line.trim()}`);
          }
        });
    }
    expect(offenders).toEqual([]);
  });
});

describe("workspace route table", () => {
  const paths = appRoutes.flatMap((r) => (r.children ?? []).map((c) => c.path)).filter(Boolean);

  it.each([
    "/hire/companies",
    "/hire/companies/create",
    "/hire/companies/:id",
    "/hire/jobs",
    "/hire/jobs/create",
    "/hire/jobs/:id/applicants",
  ])("mounts %s", (p) => {
    expect(paths).toContain(p);
  });

  it("every workspace path resolves to the recruiter portal", () => {
    for (const p of paths.filter((x) => x?.startsWith("/hire"))) {
      expect(portalForPath(p!.replace(/:\w+/g, "1"))).toBe("recruiter");
    }
  });

  /**
   * /admin is the admin portal's own prefix now, so it does mount the admin
   * sign-in and its front door. What it must never mount is a workspace page:
   * that would render recruiter UI under the admin signal colour. The only
   * workspace paths allowed here are the two that redirect back out to /hire.
   */
  it("mounts no workspace page under /admin", () => {
    const workspacePaths = paths.filter(
      (p) => p?.startsWith("/admin/companies") || p?.startsWith("/admin/jobs"),
    );
    expect(workspacePaths).toEqual(["/admin/companies/*", "/admin/jobs/*"]);
  });
});

function RouteTable() {
  return useRoutes(appRoutes);
}

function Probe() {
  const { pathname, search } = useLocation();
  return <div data-testid="loc" data-pathname={pathname} data-search={search} />;
}

/**
 * `useRoutes` under a plain MemoryRouter rather than `createMemoryRouter`: the
 * data router builds a `Request` per navigation, and jsdom's `AbortSignal` is
 * not the one undici type-checks against, so every redirect throws before it
 * resolves. The route table is the same object either way.
 */
function recruiterStore() {
  const store = makeStore();
  store.dispatch(
    setUser({
      id: "recruiter-1",
      portal: "recruiter",
      fullName: "Recruiter",
      email: "recruiter@example.test",
      emailVerified: true,
      avatarUrl: null,
      // The account is authenticated, so the destination guard accepts it, and
      // pending status stops at RequireApproved rather than rendering a whole
      // workspace page this test has no data for. RequireApproved does its own
      // reading now — it polls /me so an approval clears the gate without a
      // reload — so the render below supplies a QueryClient.
      status: "pending",
    }),
  );
  return store;
}

function renderTableAt(entry: string, store = makeStore()) {
  const view = render(
    <Provider store={store}>
      {/* The app mounts one of these at its root, so every guard and page below
          can read server state. This test used to render without it, which held
          only while no guard fetched anything. */}
      <QueryClientProvider client={makeQueryClient()}>
        <MemoryRouter initialEntries={[entry]}>
          <RouteTable />
          <Probe />
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>,
  );
  const loc = () => view.getByTestId("loc");
  return { pathname: () => loc().getAttribute("data-pathname"), search: () => loc().getAttribute("data-search") };
}

/**
 * Behavioural, not structural: a redirect that names the right target but is
 * mounted at a path that never matches is invisible to a table assertion.
 */
describe("pre-3A workspace URLs redirect", () => {
  it.each([
    ["/admin/companies", "/hire/companies"],
    ["/admin/companies/create", "/hire/companies/create"],
    ["/admin/companies/c123", "/hire/companies/c123"],
    ["/admin/jobs", "/hire/jobs"],
    ["/admin/jobs/create", "/hire/jobs/create"],
    ["/admin/jobs/j456/applicants", "/hire/jobs/j456/applicants"],
  ])("%s → %s", async (from, to) => {
    const at = renderTableAt(from, recruiterStore());
    await waitFor(() => expect(at.pathname()).toBe(to));
  });

  it("carries the query string across", async () => {
    const at = renderTableAt("/admin/jobs?page=2", recruiterStore());
    await waitFor(() => expect(at.pathname()).toBe("/hire/jobs"));
    expect(at.search()).toBe("?page=2");
  });
});
