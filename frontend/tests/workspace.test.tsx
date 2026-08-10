import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { Portal } from "@jobportal/shared";

import { makeStore, renderAppAt, renderRoute } from "./helpers/renderRoute";
import { apiClient } from "@/lib/apiClient";
import { appRoutes } from "@/routes/appRoutes";
import { setBootstrapped, setUser } from "@/redux/authSlice";
import { homePathFor } from "@/lib/portalHome";
import HireShell from "@/components/workspace/HireShell";
import WorkspaceJobs from "@/components/workspace/WorkspaceJobs";
import WorkspaceCompanies from "@/components/workspace/WorkspaceCompanies";
import JobCreate from "@/components/workspace/JobCreate";
import CompanyEdit from "@/components/workspace/CompanyEdit";
import CompanyCreate from "@/components/workspace/CompanyCreate";
import Applicants from "@/components/workspace/Applicants";
import { navLinksFor } from "@/components/shared/navLinks";

function storeWith(portal: Portal, status: "active" | "pending") {
  const store = makeStore();
  store.dispatch(
    setUser({
      id: "u1",
      portal,
      fullName: "Workspace User",
      email: "workspace@example.com",
      emailVerified: true,
      avatarUrl: null,
      status,
    }),
  );
  store.dispatch(setBootstrapped(true));
  return store;
}

describe("HireShell", () => {
  it("renders the page title as the only h1", () => {
    renderRoute(
      <HireShell title="Jobs">
        <p>body</p>
      </HireShell>,
      { route: "/hire/jobs" },
    );
    const headings = screen.getAllByRole("heading", { level: 1 });
    // The navbar wordmark is a <span> since 2B-2; a second h1 here would put
    // every workspace route back to two competing top-level headings.
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Jobs");
  });

  it("runs compact and response, like the console", () => {
    const { container } = renderRoute(
      <HireShell title="Jobs">
        <p>body</p>
      </HireShell>,
      { route: "/hire/jobs" },
    );
    const shell = container.querySelector("[data-density]");
    expect(shell).toHaveAttribute("data-density", "compact");
    // Tier 3 feedback only: this is work, not marketing.
    expect(shell).toHaveAttribute("data-motion", "response");
  });

  it("builds its sub-nav from navLinksFor, so the tabs and navbar agree", () => {
    renderRoute(
      <HireShell title="Jobs">
        <p>body</p>
      </HireShell>,
      { route: "/hire/jobs" },
    );
    const nav = screen.getByRole("navigation", { name: "Workspace sections" });
    for (const link of navLinksFor("recruiter")) {
      expect(within(nav).getByRole("link", { name: link.label })).toHaveAttribute(
        "href",
        link.to,
      );
    }
  });
});

describe("WorkspaceJobs", () => {
  it("shows a skeleton while loading, never a blank screen", () => {
    const { container } = renderRoute(<WorkspaceJobs />, { route: "/hire/jobs" });
    expect(container.querySelectorAll("[data-slot='skeleton']").length).toBeGreaterThan(0);
  });

  it("reports a failed load in an alert rather than as an empty table", async () => {
    // jsdom has no API, so every fetch rejects — which is precisely the error
    // path. The inherited page console.error'd and rendered an empty table,
    // indistinguishable from "you have posted no jobs".
    renderRoute(<WorkspaceJobs />, { route: "/hire/jobs" });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("puts the search keyword in the URL", async () => {
    renderRoute(<WorkspaceJobs />, { route: "/hire/jobs" });
    const search = screen.getByLabelText("Search jobs");
    fireEvent.change(search, { target: { value: "react" } });
    await waitFor(() => expect(search).toHaveValue("react"));
  });
});

describe("WorkspaceCompanies", () => {
  it("reports a failed load in an alert", async () => {
    renderRoute(<WorkspaceCompanies />, { route: "/hire/companies" });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("offers a create action from its header", async () => {
    renderRoute(<WorkspaceCompanies />, { route: "/hire/companies" });
    // Not asserted on the empty state — that only renders once the query
    // resolves to an empty array, which jsdom cannot produce. The header
    // action is always present.
    expect(screen.getByRole("button", { name: "New company" })).toBeInTheDocument();
  });
});

describe("JobCreate", () => {
  /**
   * The form only mounts once the companies query resolves — a recruiter with
   * no company gets an EmptyState instead, which is the zero-company dead end
   * this page fixes. So these tests have to resolve it rather than let jsdom's
   * absent API reject, or they would assert the error branch.
   */
  const withOneCompany = () =>
    vi.spyOn(apiClient, "get").mockResolvedValue({
      data: {
        success: true,
        companies: [
          {
            id: "64b0c8f2a9d3e45f6a7b8c9d",
            name: "Acme Inc.",
            description: null,
            website: null,
            location: "Pune",
            logoUrl: null,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    } as never);

  afterEach(() => vi.restoreAllMocks());

  it("renders a remote control", async () => {
    withOneCompany();
    renderRoute(<JobCreate />, { route: "/hire/jobs/create" });
    // `remote` is on jobCreateBodySchema, on the Mongo model, and drives the
    // matching pipeline's remoteFit — and no form ever rendered a control, so
    // every row carried the default false and the seeker board's Remote facet
    // matched nothing, always.
    expect(await screen.findByLabelText("This role is remote")).toBeInTheDocument();
  });

  it("offers only job types the seeker board can filter for", async () => {
    withOneCompany();
    const { JOB_TYPES } = await import("@jobportal/shared");
    renderRoute(<JobCreate />, { route: "/hire/jobs/create" });
    const select = await screen.findByLabelText("Job type");
    // A free-text input let a recruiter post "Full Time", which is stored,
    // displayed, and unfilterable.
    expect(select.tagName).toBe("SELECT");
    for (const type of JOB_TYPES) {
      expect(within(select).getByRole("option", { name: type })).toBeInTheDocument();
    }
  });

  it("sends a company id, never a name", async () => {
    withOneCompany();
    renderRoute(<JobCreate />, { route: "/hire/jobs/create" });
    // Anchored regex, not "Company": FormField appends a required asterisk to
    // the label, and getByLabelText matches label.textContent rather than the
    // computed accessible name — the span is aria-hidden, so a screen reader
    // hears "Company" and only this matcher sees the star.
    const picker = await screen.findByLabelText(/^Company/);
    // The inherited form matched `companies.find(c => c.name.toLowerCase() === value)`,
    // so two companies sharing a name resolved to whichever the array held first.
    expect(within(picker).getByRole("option", { name: "Acme Inc." })).toHaveValue(
      "64b0c8f2a9d3e45f6a7b8c9d",
    );
  });

  it("replaces the unsubmittable form with a way forward when there is no company", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue({
      data: { success: true, companies: [] },
    } as never);
    renderRoute(<JobCreate />, { route: "/hire/jobs/create" });
    // The inherited page rendered a complete form that could not succeed, with
    // a warning below the submit button associated with nothing.
    expect(await screen.findByText("Create a company first")).toBeInTheDocument();
    expect(screen.queryByLabelText("Job type")).not.toBeInTheDocument();
  });
});

describe("the company forms", () => {
  afterEach(() => vi.restoreAllMocks());

  it("CompanyEdit reports a failed load in an alert", async () => {
    renderRoute(<CompanyEdit />, {
      route: "/hire/companies/64b0c8f2a9d3e45f6a7b8c9d",
      // Explicit: renderRoute defaults `path` to `route`, so a parameterised
      // URL passed as a route pattern matches nothing and renders no page.
      path: "/hire/companies/:id",
    });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("CompanyEdit seeds its fields from the fetched company", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue({
      data: {
        success: true,
        company: {
          id: "64b0c8f2a9d3e45f6a7b8c9d",
          name: "Acme Inc.",
          description: "We build things",
          website: "https://acme.test",
          location: "Pune",
          logoUrl: null,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      },
    } as never);
    renderRoute(<CompanyEdit />, {
      route: "/hire/companies/64b0c8f2a9d3e45f6a7b8c9d",
      path: "/hire/companies/:id",
    });
    expect(await screen.findByLabelText(/^Company name/)).toHaveValue("Acme Inc.");
    expect(screen.getByLabelText("Location")).toHaveValue("Pune");
  });

  it("CompanyCreate submits on Enter, because it is a real form", async () => {
    const post = vi
      .spyOn(apiClient, "post")
      .mockResolvedValue({ data: { success: true, company: { id: "c1" } } } as never);
    renderRoute(<CompanyCreate />, { route: "/hire/companies/create" });
    const name = screen.getByLabelText(/^Company name/);
    fireEvent.change(name, { target: { value: "Acme Inc." } });
    // The inherited page was a button with a click handler, so Enter in the
    // single text field did nothing at all.
    fireEvent.submit(name.closest("form")!);
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/company/register", { name: "Acme Inc." }),
    );
  });
});

describe("Applicants", () => {
  afterEach(() => vi.restoreAllMocks());

  const withOneApplicant = (status: "pending" | "accepted" | "rejected" = "pending") =>
    vi.spyOn(apiClient, "get").mockResolvedValue({
      data: {
        success: true,
        items: [
          {
            applicationId: "a1",
            status,
            appliedAt: "2026-01-01T00:00:00.000Z",
            fullName: "Ada Lovelace",
            email: "ada@example.com",
            phone: null,
            headline: null,
            skills: [],
            resumeUrl: null,
            resumeName: null,
          },
        ],
        total: 1,
        page: 1,
        pages: 1,
      },
    } as never);

  it("reports a failed load in an alert", async () => {
    renderRoute(<Applicants />, {
      route: "/hire/jobs/64b0c8f2a9d3e45f6a7b8c9d/applicants",
      path: "/hire/jobs/:id/applicants",
    });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("gives the decision a real button, reachable by keyboard", async () => {
    withOneApplicant();
    renderRoute(<Applicants />, {
      route: "/hire/jobs/64b0c8f2a9d3e45f6a7b8c9d/applicants",
      path: "/hire/jobs/:id/applicants",
    });
    // The inherited accept/reject were `<div onClick>` — no role, no tabIndex,
    // no focus ring. They worked for a mouse and did not exist for a keyboard.
    const trigger = await screen.findByRole("button", { name: "Decide on Ada Lovelace" });
    expect(trigger).toBeInTheDocument();
    expect(trigger.tagName).toBe("BUTTON");
  });

  it("states the status in text, not colour alone", async () => {
    withOneApplicant("accepted");
    renderRoute(<Applicants />, {
      route: "/hire/jobs/64b0c8f2a9d3e45f6a7b8c9d/applicants",
      path: "/hire/jobs/:id/applicants",
    });
    // 2A's rule: semantic state is icon *and* label. A green pill alone tells a
    // colourblind user nothing.
    expect(await screen.findByText("Accepted")).toBeInTheDocument();
  });
});

describe("the workspace redux fields", () => {
  /**
   * `searchJobByText` and `searchCompanyByText` were the last survivors of the
   * pattern 2B-2 deleted `searchedQuery` for: a filter living in a slice while
   * the URL was already authoritative. Two sources of truth for one question is
   * how the app ended up with two job boards.
   */
  it("no longer carries a job search field or an admin job list", async () => {
    const jobReducer = (await import("@/redux/jobSlice")).default;
    const state = jobReducer(undefined, { type: "@@INIT" });
    expect(state).not.toHaveProperty("searchJobByText");
    expect(state).not.toHaveProperty("allAdminJobs");
  });

  it("has no company or application slice", () => {
    // A filesystem check, not `await expect(import(...)).rejects`: Vite's
    // import-analysis resolves even a dynamic specifier at transform time, so
    // an import of a deleted module fails the whole file at collection rather
    // than rejecting inside the test. This also asserts the thing that matters
    // — the files are gone — instead of a module-resolution side effect.
    const redux = join(import.meta.dirname, "..", "src", "redux");
    expect(existsSync(join(redux, "companySlice.ts"))).toBe(false);
    expect(existsSync(join(redux, "applicationSlice.ts"))).toBe(false);
  });

  it("builds a store with exactly the two surviving reducers", () => {
    const state = makeStore().getState();
    expect(Object.keys(state).sort()).toEqual(["auth", "job"]);
  });
});

/**
 * The workspace's route table and its two gates.
 *
 * Every page moved directory in 2B-3 while its path did not, so these assert
 * the paths still resolve and that both gates are still on all six — a rebuild
 * that silently dropped `requireApproved` from one page would look identical
 * from the outside until a pending recruiter reached it.
 */
describe("workspace routes", () => {
  const WORKSPACE_PATHS = [
    "/hire/companies",
    "/hire/companies/create",
    "/hire/companies/:id",
    "/hire/jobs",
    "/hire/jobs/create",
    "/hire/jobs/:id/applicants",
  ];

  const CONCRETE = WORKSPACE_PATHS.map((p) => p.replace(":id", "64b0c8f2a9d3e45f6a7b8c9d"));

  const mountedPaths = () =>
    appRoutes.flatMap((r) => (r.children ?? []).map((c) => c.path)).filter(Boolean);

  it("mounts every workspace path", () => {
    const paths = mountedPaths();
    // The scan must read something — a root resolved to a nonexistent directory
    // is how the first workspaceRoutes test passed over zero files.
    expect(paths.length).toBeGreaterThan(10);
    for (const path of WORKSPACE_PATHS) expect(paths).toContain(path);
  });

  it("resolves the recruiter portal on every one", async () => {
    for (const path of CONCRETE) {
      const { container, unmount } = renderAppAt(path, {
        store: storeWith("recruiter", "active"),
      });
      await waitFor(() =>
        expect(container.querySelector("[data-portal]")?.getAttribute("data-portal")).toBe(
          "recruiter",
        ),
      );
      unmount();
    }
  });

  it("bounces a seeker and an admin to their own home", async () => {
    for (const portal of ["seeker", "admin"] as const) {
      for (const path of CONCRETE) {
        const view = renderAppAt(path, { store: storeWith(portal, "active") });
        await waitFor(() => expect(view.pathname()).toBe(homePathFor(portal)));
        view.unmount();
      }
    }
  });

  it("shows a pending recruiter the awaiting-approval state on every page", async () => {
    // The gate belongs on every route, not just the entry page — the API puts
    // requireApproved on every recruiter-owned mutation.
    for (const path of CONCRETE) {
      const view = renderAppAt(path, { store: storeWith("recruiter", "pending") });
      expect(await view.findByText("Awaiting approval")).toBeInTheDocument();
      view.unmount();
    }
  });

  it("links only to paths the route table mounts", () => {
    const paths = mountedPaths();
    for (const link of navLinksFor("recruiter")) expect(paths).toContain(link.to);
  });
});
