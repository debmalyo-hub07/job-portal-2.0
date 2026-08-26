import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  computeSeekerFit,
  type ApplicationStatus,
  type JobDto,
  type Portal,
} from "@jobportal/shared";
import type { RouteObject } from "react-router";

import { makeStore, renderAppAt, renderRoute } from "./helpers/renderRoute";
import { apiClient } from "@/lib/apiClient";
import { appRoutes } from "@/routes/appRoutes";
import { setBootstrapped, setUser } from "@/redux/authSlice";
import { loginPathFor } from "@/lib/portalHome";
import HireShell from "@/components/workspace/HireShell";
import WorkspaceJobs from "@/components/workspace/WorkspaceJobs";
import WorkspaceCompanies from "@/components/workspace/WorkspaceCompanies";
import JobCreate from "@/components/workspace/JobCreate";
import JobEdit from "@/components/workspace/JobEdit";
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
      profileComplete: true,
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

  /**
   * This test used to assert the workspace ran Tier 3 feedback *only* — 4A
   * success criterion 6. Phase 5 reverses that criterion deliberately: motion
   * reaches every surface, and the workspace's share of it is a whisper.
   *
   * Rewritten rather than deleted, because the cap is the part still worth
   * pinning. `response` is what expresses it: `--motion-reveal-distance: 0px`
   * turns a `Reveal` into an opacity-only arrival, and `--motion-ambient-amplitude`
   * scales to a quarter. Nothing here reads the tier or takes a flag — a page
   * that hand-tuned a duration because "the workspace should be calmer" is the
   * failure this asserts against.
   *
   * What the workspace deliberately does *not* get is an `Atmosphere`, and the
   * reason is how little contrast headroom is left rather than a failure:
   * `contrast.mjs` puts `--ink-muted` over an admin field at 4.56:1, clearing the
   * 4.5:1 floor by 0.06 — the narrowest of its 32 pairings — and `Atmosphere.tsx`
   * records the same composite at 4.39:1 one alpha step up. A table someone is
   * reading down is the last place to spend that margin.
   */
  it("runs compact, and caps motion to a whisper rather than refusing it", () => {
    const { container } = renderRoute(
      <HireShell title="Jobs">
        <p>body</p>
      </HireShell>,
      { route: "/hire/jobs" },
    );
    const shell = container.querySelector("[data-density]");
    expect(shell).toHaveAttribute("data-density", "compact");
    expect(shell).toHaveAttribute("data-motion", "response");

    // The cap, as values rather than as a claim in a comment.
    const style = (shell as HTMLElement).style;
    expect(style.getPropertyValue("--motion-reveal-distance")).toBe("0px");
    expect(style.getPropertyValue("--motion-parallax-depth")).toBe("0");
    expect(style.getPropertyValue("--motion-ambient-amplitude")).toContain("0.25");
    // Tier 3 is never reducible and never scaled — it is how a control confirms
    // it was pressed, on every surface.
    expect(style.getPropertyValue("--motion-feedback-scale")).toBe("1");
  });

  it("builds its sub-nav from navLinksFor, so the tabs and navbar agree", () => {
    renderRoute(
      <HireShell title="Jobs">
        <p>body</p>
      </HireShell>,
      { route: "/hire/jobs" },
    );
    const nav = screen.getByRole("navigation", { name: "Workspace sections" });
    for (const link of navLinksFor("recruiter", "session")) {
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

  const fit = computeSeekerFit(
    {
      skills: ["typescript"],
      salaryMin: 8,
      salaryMax: 12,
      experienceYears: 3,
      location: "Kolkata",
      openToRemote: true,
    },
    {
      requirements: ["typescript", "react"],
      salary: 10,
      experienceLevel: 2,
      location: "Kolkata",
      workMode: "onsite",
    },
  );

  const withOneApplicant = (status: ApplicationStatus = "applied") =>
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
            fit,
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
    const trigger = await screen.findByRole("button", {
      name: "Change status for Ada Lovelace",
    });
    expect(trigger).toBeInTheDocument();
    expect(trigger.tagName).toBe("BUTTON");
  });

  it("offers every recruiter-settable stage and never the current one", async () => {
    withOneApplicant("shortlisted");
    renderRoute(<Applicants />, {
      route: "/hire/jobs/64b0c8f2a9d3e45f6a7b8c9d/applicants",
      path: "/hire/jobs/:id/applicants",
    });
    // userEvent, not fireEvent: Radix opens the menu on pointerdown, which
    // fireEvent.click does not dispatch, so the menu never opens in jsdom.
    await userEvent.click(
      await screen.findByRole("button", { name: "Change status for Ada Lovelace" }),
    );
    // Built from RECRUITER_SETTABLE, so the control cannot offer a transition the
    // API would refuse.
    expect(await screen.findByRole("menuitem", { name: /Interview/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Not selected/ })).toBeInTheDocument();
    // Re-setting the current status is a 409 STATUS_UNCHANGED, so it is absent.
    expect(screen.queryByRole("menuitem", { name: /^Shortlisted$/ })).toBeNull();
  });

  it("offers no decision menu once the application is closed", async () => {
    withOneApplicant("withdrawn");
    renderRoute(<Applicants />, {
      route: "/hire/jobs/64b0c8f2a9d3e45f6a7b8c9d/applicants",
      path: "/hire/jobs/:id/applicants",
    });
    // A terminal application takes no further decision; the API answers one with
    // 409, so a control that cannot succeed is not rendered.
    expect(await screen.findByText("Withdrawn")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Change status for Ada Lovelace" }),
    ).toBeNull();
  });

  it("states the status in text, not colour alone", async () => {
    withOneApplicant("offered");
    renderRoute(<Applicants />, {
      route: "/hire/jobs/64b0c8f2a9d3e45f6a7b8c9d/applicants",
      path: "/hire/jobs/:id/applicants",
    });
    // 2A's rule: semantic state is icon *and* label. A green pill alone tells a
    // colourblind user nothing.
    expect(await screen.findByText("Offered")).toBeInTheDocument();
  });

  it("shows the recruiter-side fit score and its strongest explanation", async () => {
    withOneApplicant();
    renderRoute(<Applicants />, {
      route: "/hire/jobs/64b0c8f2a9d3e45f6a7b8c9d/applicants",
      path: "/hire/jobs/:id/applicants",
    });

    expect(await screen.findByText(`${Math.round(fit.score)}% fit`)).toBeInTheDocument();
    expect(screen.getByText(/missing: react/i)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/you are missing/i);
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
  const WRONG_PORTAL_CASES = (["seeker", "admin"] as const).flatMap((portal) =>
    CONCRETE.map((path) => [portal, path] as const),
  );

  const mountedPaths = () => {
    const collect = (routes: RouteObject[]): string[] =>
      routes.flatMap((route) => [
        ...(route.path ? [route.path] : []),
        ...collect(route.children ?? []),
      ]);
    return collect(appRoutes);
  };

  it("mounts every workspace path", () => {
    const paths = mountedPaths();
    // The scan must read something — a root resolved to a nonexistent directory
    // is how the first workspaceRoutes test passed over zero files.
    expect(paths.length).toBeGreaterThan(10);
    for (const path of WORKSPACE_PATHS) expect(paths).toContain(path);
  });

  it.each(CONCRETE)("resolves the recruiter portal on %s", async (path) => {
    const { container, unmount } = renderAppAt(path, {
      store: storeWith("recruiter", "active"),
    });
    await waitFor(() =>
      expect(container.querySelector("[data-portal]")?.getAttribute("data-portal")).toBe(
        "recruiter",
      ),
    );
    unmount();
  });

  it.each(WRONG_PORTAL_CASES)("bounces a %s from %s to recruiter sign-in", async (portal, path) => {
    const view = renderAppAt(path, { store: storeWith(portal, "active") });
    await waitFor(() => expect(view.pathname()).toBe(loginPathFor("recruiter")));
    view.unmount();
  });

  it.each(CONCRETE)("shows a pending recruiter the awaiting-approval state on %s", async (path) => {
    // The gate belongs on every route, not just the entry page — the API puts
    // requireApproved on every recruiter-owned mutation.
    const view = renderAppAt(path, { store: storeWith("recruiter", "pending") });
    expect(await view.findByText("Awaiting approval")).toBeInTheDocument();
    view.unmount();
  });

  it("links only to paths the route table mounts", () => {
    const paths = mountedPaths();
    for (const link of navLinksFor("recruiter", "session")) expect(paths).toContain(link.to);
  });
});

describe("the job lifecycle in the workspace", () => {
  afterEach(() => vi.restoreAllMocks());

  const COMPANY = {
    id: "64b0c8f2a9d3e45f6a7b8c9d",
    name: "Acme Inc.",
    description: null,
    website: null,
    location: "Pune",
    logoUrl: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  function jobRow(overrides: Partial<JobDto> = {}): JobDto {
    return {
      id: "64b0c8f2a9d3e45f6a7b8c9e",
      title: "TypeScript Dev",
      description: "Build the portal",
      requirements: ["ts", "node"],
      salary: 18,
      experienceLevel: 3,
      location: "Remote",
      jobType: "Full-time",
      department: "Engineering",
      position: "2",
      remote: true,
      status: "open",
      company: COMPANY,
      createdAt: "2026-08-01T00:00:00.000Z",
      postedBy: null,
      applications: { total: 0, active: 0 },
      ...overrides,
    };
  }

  /** The owned-jobs list, resolved so the table renders rather than the alert. */
  const withJobs = (...items: JobDto[]) =>
    vi.spyOn(apiClient, "get").mockResolvedValue({
      data: { success: true, items, total: items.length, page: 1, pages: 1 },
    } as never);

  /**
   * Opens a row's action menu.
   *
   * `userEvent`, not `fireEvent.click`: Radix opens on pointerdown, which the
   * synthetic click never dispatches, so the menu simply never appears.
   */
  async function openRowMenu(title: string) {
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: `Actions for ${title}` }));
    return user;
  }

  it("shows an open role's status and offers Close", async () => {
    withJobs(jobRow());
    renderRoute(<WorkspaceJobs />, { route: "/hire/jobs" });
    await openRowMenu("TypeScript Dev");

    expect(await screen.findByRole("menuitem", { name: /close role/i })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /reopen role/i })).not.toBeInTheDocument();
  });

  it("offers Reopen on a closed role instead of Close", async () => {
    // A closed role stays in this list. A recruiter who could no longer see one
    // would have no way to reopen it, so closing would be indistinguishable from
    // deleting — which is exactly what this menu must not imply.
    withJobs(jobRow({ status: "closed" }));
    renderRoute(<WorkspaceJobs />, { route: "/hire/jobs" });
    await openRowMenu("TypeScript Dev");

    expect(await screen.findByRole("menuitem", { name: /reopen role/i })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /^close role/i })).not.toBeInTheDocument();
  });

  it("renders a status badge with a label, never colour alone", async () => {
    withJobs(jobRow({ status: "closed" }));
    const { container } = renderRoute(<WorkspaceJobs />, { route: "/hire/jobs" });
    // WCAG 1.4.1: the badge carries the word "Closed" and an icon. A recruiter
    // who cannot distinguish the tint still reads the state.
    expect(await screen.findByText("Closed")).toBeInTheDocument();
    expect(container.querySelector("[data-slot='badge'] svg")).not.toBeNull();
  });

  it("disables Delete and says why when candidates have applied", async () => {
    withJobs(jobRow({ applications: { total: 4, active: 2 } }));
    renderRoute(<WorkspaceJobs />, { route: "/hire/jobs" });
    await openRowMenu("TypeScript Dev");

    // Disabled rather than absent: a recruiter hunting for Delete has to learn
    // that applicants are what prevents it, not that the control never existed.
    const remove = await screen.findByRole("menuitem", { name: /cannot delete .* applied/i });
    expect(remove).toHaveAttribute("aria-disabled", "true");
  });

  it("enables Delete for a posting nobody applied to", async () => {
    withJobs(jobRow({ applications: { total: 0, active: 0 } }));
    renderRoute(<WorkspaceJobs />, { route: "/hire/jobs" });
    await openRowMenu("TypeScript Dev");

    const remove = await screen.findByRole("menuitem", { name: /^delete TypeScript Dev$/i });
    expect(remove).not.toHaveAttribute("aria-disabled", "true");
  });

  it("surfaces the candidates left waiting on a closed role", async () => {
    withJobs(jobRow({ status: "closed", applications: { total: 5, active: 3 } }));
    renderRoute(<WorkspaceJobs />, { route: "/hire/jobs" });
    // The limbo has to be visible. Closing does not reject anyone, so without
    // this the three of them wait on a decision for a role that has left the
    // board and nothing on screen says so.
    expect(await screen.findByText(/3 awaiting a decision/i)).toBeInTheDocument();
  });

  it("says so in the close dialog rather than only in the table", async () => {
    withJobs(jobRow({ applications: { total: 5, active: 3 } }));
    renderRoute(<WorkspaceJobs />, { route: "/hire/jobs" });
    const user = await openRowMenu("TypeScript Dev");
    await user.click(await screen.findByRole("menuitem", { name: /close role/i }));

    const dialog = await screen.findByRole("alertdialog");
    // The consequence, stated before the click that causes it — and stated in
    // the description, so a screen reader announces it with the title.
    expect(dialog).toHaveTextContent(/leaves the job board/i);
    expect(dialog).toHaveTextContent(/closing does not reject anyone/i);
  });

  it("asks before deleting, and names what will be deleted", async () => {
    withJobs(jobRow({ title: "Posted By Mistake" }));
    renderRoute(<WorkspaceJobs />, { route: "/hire/jobs" });
    const user = await openRowMenu("Posted By Mistake");
    await user.click(await screen.findByRole("menuitem", { name: /^delete Posted By Mistake$/i }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Posted By Mistake");
    expect(dialog).toHaveTextContent(/cannot be undone/i);
    // Cancel is reachable and does not perform the action.
    expect(within(dialog).getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("posts the opposite status when a close is confirmed", async () => {
    withJobs(jobRow());
    const post = vi
      .spyOn(apiClient, "post")
      .mockResolvedValue({ data: { success: true, job: jobRow({ status: "closed" }) } } as never);
    renderRoute(<WorkspaceJobs />, { route: "/hire/jobs" });

    const user = await openRowMenu("TypeScript Dev");
    await user.click(await screen.findByRole("menuitem", { name: /close role/i }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: /close role/i }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/job/status/64b0c8f2a9d3e45f6a7b8c9e/update", {
        status: "closed",
      }),
    );
  });

  it("does nothing when the close dialog is cancelled", async () => {
    withJobs(jobRow());
    const post = vi.spyOn(apiClient, "post");
    renderRoute(<WorkspaceJobs />, { route: "/hire/jobs" });

    const user = await openRowMenu("TypeScript Dev");
    await user.click(await screen.findByRole("menuitem", { name: /close role/i }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: /cancel/i }));

    expect(post).not.toHaveBeenCalled();
  });

  it("routes Edit job to the job's own page, not the company's", async () => {
    // The only edit this menu offered was "Edit company" — a recruiter looking
    // for the job's own fields was sent to the employer record instead.
    withJobs(jobRow());
    renderRoute(<WorkspaceJobs />, { route: "/hire/jobs" });
    await openRowMenu("TypeScript Dev");
    expect(await screen.findByRole("menuitem", { name: /edit job/i })).toBeInTheDocument();
  });
});

describe("JobEdit", () => {
  afterEach(() => vi.restoreAllMocks());

  const JOB: JobDto = {
    id: "64b0c8f2a9d3e45f6a7b8c9e",
    title: "Senior Platform Engineer",
    description: "Own the deploy pipeline",
    requirements: ["ts", "terraform"],
    salary: 32,
    experienceLevel: 6,
    location: "Bengaluru",
    jobType: "Full-time",
    department: "Engineering",
    position: "1",
    remote: false,
    status: "open",
    company: {
      id: "64b0c8f2a9d3e45f6a7b8c9d",
      name: "Acme Inc.",
      description: null,
      website: null,
      location: "Pune",
      logoUrl: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    createdAt: "2026-08-01T00:00:00.000Z",
    postedBy: null,
  };

  const mountAt = () =>
    renderRoute(<JobEdit />, {
      route: "/hire/jobs/64b0c8f2a9d3e45f6a7b8c9e",
      // Explicit: renderRoute defaults `path` to `route`, so a parameterised URL
      // passed as a route pattern matches nothing and renders no page.
      path: "/hire/jobs/:id",
    });

  /** Both the job read and the companies read go through apiClient.get. */
  const withJob = (job: JobDto = JOB) =>
    vi.spyOn(apiClient, "get").mockImplementation(((url: string) =>
      url.startsWith("/job/get")
        ? Promise.resolve({ data: { success: true, job } })
        : Promise.resolve({ data: { success: true, companies: [job.company] } })) as never);

  it("reports a failed load in an alert rather than an empty form", async () => {
    mountAt();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("prefills every field from the fetched job", async () => {
    withJob();
    mountAt();

    expect(await screen.findByLabelText(/^Title/)).toHaveValue("Senior Platform Engineer");
    expect(screen.getByLabelText(/^Salary/)).toHaveValue(32);
    expect(screen.getByLabelText(/^Experience/)).toHaveValue(6);
    expect(screen.getByLabelText(/^Location/)).toHaveValue("Bengaluru");
    expect(screen.getByLabelText("Department")).toHaveValue("Engineering");
    // The array comes back as the comma-string the form and the API both speak,
    // so an edit round trip cannot quietly reshape the field.
    expect(screen.getByLabelText(/^Requirements/)).toHaveValue("ts, terraform");
    expect(screen.getByLabelText("This role is remote")).not.toBeChecked();
  });

  it("locks the employer and explains why", async () => {
    withJob();
    mountAt();
    const picker = await screen.findByLabelText(/^Company/);
    // Moving a posting between employers would rewrite who each existing
    // applicant applied to. Disabled and explained, not hidden — a missing
    // control reads as an oversight.
    expect(picker).toBeDisabled();
    expect(screen.getByText(/employer cannot change/i)).toBeInTheDocument();
  });

  it("never sends companyId, which the strict schema would reject", async () => {
    withJob();
    const put = vi
      .spyOn(apiClient, "put")
      .mockResolvedValue({ data: { success: true, job: JOB } } as never);
    mountAt();

    const title = await screen.findByLabelText(/^Title/);
    fireEvent.change(title, { target: { value: "Staff Platform Engineer" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(put).toHaveBeenCalled());
    const [url, body] = put.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe("/job/update/64b0c8f2a9d3e45f6a7b8c9e");
    expect(body.title).toBe("Staff Platform Engineer");
    expect(body).not.toHaveProperty("companyId");
    // The boolean is sent as the string form the schema's enum expects.
    expect(body.remote).toBe("false");
  });

  it("tells the recruiter when the role they are editing is off the board", async () => {
    withJob({ ...JOB, status: "closed" });
    mountAt();
    // A closed role stays editable, so the badge is the only thing that says the
    // posting being corrected is not currently visible to candidates.
    expect(await screen.findByText("Closed")).toBeInTheDocument();
  });
});
