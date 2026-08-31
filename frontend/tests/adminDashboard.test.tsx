import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render as rtlRender, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { Provider } from "react-redux";
import type { AdminActivityDto, AdminInsightsDto, AdminOverviewDto } from "@jobportal/shared";

import { ActivityFeed } from "@/components/console/ActivityFeed";
import { AdminDashboard } from "@/components/console/AdminDashboard";
import { CompositionCard } from "@/components/console/CompositionCard";
import { JobsTrend } from "@/components/console/JobsTrend";
import { PipelineFunnel } from "@/components/console/PipelineFunnel";
import { TriageBand } from "@/components/console/TriageBand";
import { makeStore } from "./helpers/renderRoute";


/**
 * The dashboard's presentation pieces, rendered directly.
 *
 * Each is a pure function of one slice of `AdminInsightsDto`, so these mount the
 * component with a literal rather than driving the route: the assertions are
 * about how a shape is drawn, and a router plus a query client between the two
 * only adds ways for the test to fail for an unrelated reason.
 *
 * Every test names a way a chart can be wrong while still rendering — a stage
 * dropped because it is empty, a zero standing in for an unmeasurable rate, a
 * value reachable only by hovering.
 *
 * A MemoryRouter wraps every render because two of these panels are built out of
 * links, and `Link` reads the router context rather than degrading to a bare
 * anchor — without it those panels throw on `basename` instead of rendering.
 */
function render(ui: ReactElement) {
  return rtlRender(<MemoryRouter>{ui}</MemoryRouter>);
}

const PIPELINE_EMPTY: AdminInsightsDto["pipeline"] = {
  byStatus: {
    applied: 0,
    reviewed: 0,
    shortlisted: 0,
    interview: 0,
    offered: 0,
    rejected: 0,
    withdrawn: 0,
  },
  total: 0,
  live: 0,
  decided: 0,
};

const PIPELINE_FULL: AdminInsightsDto["pipeline"] = {
  byStatus: {
    applied: 40,
    reviewed: 22,
    shortlisted: 11,
    interview: 5,
    offered: 2,
    rejected: 9,
    withdrawn: 0,
  },
  total: 89,
  live: 80,
  decided: 9,
};

function series(days: number, at: Record<number, number> = {}) {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.UTC(2026, 5, 1));
    d.setUTCDate(d.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), count: at[i] ?? 0 };
  });
}

describe("TriageBand", () => {
  it("names each waiting item and links to the screen that resolves it", () => {
    render(<TriageBand triage={{ pendingRecruiters: 3, companiesMissingBranding: 27 }} />);

    const recruiters = screen.getByRole("link", { name: /3 recruiters awaiting approval/i });
    expect(recruiters).toHaveAttribute("href", "/admin/recruiters");
    const companies = screen.getByRole("link", { name: /27 compan/i });
    expect(companies).toHaveAttribute("href", "/admin/review/companies");
  });

  it("says so plainly when nothing is waiting, rather than showing zeros", () => {
    // A row of 0s reads as a broken panel. The console's whole question is "is
    // there work waiting", so "no" is an answer worth writing out.
    render(<TriageBand triage={{ pendingRecruiters: 0, companiesMissingBranding: 0 }} />);

    expect(screen.getByText(/nothing waiting/i)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("hides only the item that is clear, keeping the one that is not", () => {
    render(<TriageBand triage={{ pendingRecruiters: 0, companiesMissingBranding: 4 }} />);

    expect(screen.queryByText(/awaiting approval/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /4 compan/i })).toBeInTheDocument();
  });
});

describe("PipelineFunnel", () => {
  it("renders every stage, including the ones nobody has reached", () => {
    // A named stage at zero is information: it says the platform has that step
    // and nobody is in it. Dropping the row would say the step does not exist.
    render(<PipelineFunnel pipeline={PIPELINE_FULL} />);

    for (const stage of ["Applied", "Reviewed", "Shortlisted", "Interview", "Offered", "Rejected", "Withdrawn"]) {
      expect(screen.getByText(stage)).toBeInTheDocument();
    }
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("puts every value in the document, not only in a tooltip", () => {
    // A tooltip must enhance, never gate. Each bar carries its value at the tip.
    render(<PipelineFunnel pipeline={PIPELINE_FULL} />);
    const list = screen.getByRole("list", { name: /pipeline/i });
    for (const value of ["40", "22", "11", "5", "2", "9"]) {
      expect(within(list).getByText(value)).toBeInTheDocument();
    }
  });

  it("explains an empty pipeline instead of drawing seven zero-width bars", () => {
    // Production has no applications at all. Seven empty rows and a "0" is a
    // chart pretending to be a measurement.
    render(<PipelineFunnel pipeline={PIPELINE_EMPTY} />);

    expect(screen.getByText(/no applications yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: /pipeline/i })).not.toBeInTheDocument();
  });

  it("separates live applications from decided ones", () => {
    render(<PipelineFunnel pipeline={PIPELINE_FULL} />);
    expect(screen.getByText(/80 live/i)).toBeInTheDocument();
    expect(screen.getByText(/9 decided/i)).toBeInTheDocument();
  });
});

describe("JobsTrend", () => {
  it("plots a line and offers the same numbers as a table", () => {
    // "A tooltip as the only way to read a value" is the anti-pattern. A dense
    // series cannot label every point, so the table view is what un-gates it.
    const { container } = render(<JobsTrend series={series(56, { 10: 4, 20: 7 })} />);

    expect(container.querySelector("svg path[data-mark='line']")).toBeTruthy();
    const table = screen.getByRole("table", { name: /jobs posted/i });
    expect(within(table).getByText("7")).toBeInTheDocument();
  });

  it("summarises the window so the headline needs no hover at all", () => {
    render(<JobsTrend series={series(56, { 10: 4, 20: 7 })} />);
    // Exact strings, not /11/: the table below carries dates like 2026-06-11 and
    // a loose matcher would pass on one of those instead of the total.
    expect(screen.getByText("11 posted in the last 8 weeks")).toBeInTheDocument();
    expect(screen.getByText(/busiest day: 7/i)).toBeInTheDocument();
  });

  it("declines to draw a trend when nothing was posted in the window", () => {
    render(<JobsTrend series={series(56)} />);
    expect(screen.getByText(/no roles posted/i)).toBeInTheDocument();
  });

  it("renders nothing rather than crashing on an empty series", () => {
    // The API guarantees 56 dense points, but a component that divides by
    // `length - 1` turns a contract change into a blank page.
    render(<JobsTrend series={[]} />);
    expect(screen.getByText(/no roles posted/i)).toBeInTheDocument();
  });
});

describe("CompositionCard", () => {
  it("ranks the slices biggest first and labels each with its value", () => {
    render(
      <CompositionCard
        composition={{
          byDepartment: [
            { label: "Engineering", count: 74 },
            { label: "Operations & Supply Chain", count: 22 },
          ],
          byType: [{ label: "Full-time", count: 192 }],
          remoteOpenJobs: 58,
        }}
        openJobs={198}
      />,
    );

    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent(/Engineering/);
    expect(rows[0]).toHaveTextContent("74");
  });

  it("says how many slices it left out rather than truncating in silence", () => {
    // A capped list that does not admit the cap reads as the whole taxonomy.
    const many = Array.from({ length: 11 }, (_, i) => ({ label: `Dept ${i}`, count: 11 - i }));
    render(
      <CompositionCard
        composition={{ byDepartment: many, byType: [], remoteOpenJobs: 0 }}
        openJobs={66}
      />,
    );

    expect(screen.getByText(/5 more/i)).toBeInTheDocument();
  });

  it("expresses the remote share against open jobs, not as a bare count", () => {
    render(
      <CompositionCard
        composition={{ byDepartment: [], byType: [], remoteOpenJobs: 58 }}
        openJobs={198}
      />,
    );
    // 58 of 198 is 29%.
    expect(screen.getByText(/29%/)).toBeInTheDocument();
  });

  it("declines a percentage when there are no open jobs to divide by", () => {
    render(
      <CompositionCard
        composition={{ byDepartment: [], byType: [], remoteOpenJobs: 0 }}
        openJobs={0}
      />,
    );
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });
});

describe("ActivityFeed", () => {
  const items: AdminActivityDto["items"] = [
    {
      id: "job:1",
      kind: "job_posted",
      at: new Date().toISOString(),
      label: "Staff Engineer",
      detail: "Acme",
      href: "/admin/review/jobs",
    },
    {
      id: "application:2",
      kind: "application_submitted",
      at: new Date().toISOString(),
      label: "Designer",
      detail: null,
      href: null,
    },
  ];

  it("labels each event with what happened and links the ones that resolve", () => {
    render(<ActivityFeed items={items} />);

    expect(screen.getByRole("link", { name: /Staff Engineer/ })).toHaveAttribute(
      "href",
      "/admin/review/jobs",
    );
    // The application row has no console screen, so it must not be a dead link.
    const designer = screen.getByText("Designer");
    expect(designer.closest("a")).toBeNull();
  });

  it("says the feed is empty rather than rendering an empty list", () => {
    render(<ActivityFeed items={[]} />);
    expect(screen.getByText(/nothing has happened yet/i)).toBeInTheDocument();
  });
});

/**
 * The invite dialog's promise to the admin doing the inviting.
 *
 * It used to say the new admin "receives a short-lived password setup code" —
 * true, and useless: the code arrived with no link, and the "password setup
 * screen" it named did not exist. Anyone reading this dialog had no way to know
 * the person they had just invited was stranded.
 *
 * Read from the source rather than the rendered dialog, the same way
 * passwordInput.test.tsx reads these forms: mounting the dashboard means
 * satisfying three aggregation queries with full DTOs before the trigger is
 * clickable, and every one of those fixtures is a way for a copy assertion to
 * fail for a reason that has nothing to do with copy.
 */
describe("invite dialog copy", () => {
  // Anchored to the vitest root rather than import.meta.url — see the note in
  // passwordInput.test.tsx about the Windows drive prefix.
  const source = readFileSync(
    join(process.cwd(), "src", "components", "console", "AdminDashboard.tsx"),
    "utf8",
  );

  it("was read at all", () => {
    // The silent-miss guard: an unreadable path must fail here, never pass by
    // finding nothing in an empty string.
    expect(source.length).toBeGreaterThan(500);
  });

  it("names the setup screen the invite now links to", () => {
    const description = /<DialogDescription>([\s\S]*?)<\/DialogDescription>/.exec(source)?.[1];
    expect(description).toBeTruthy();
    expect(description).toMatch(/link/i);
  });

  it("keeps the reassurance that no password passes through the inviter", () => {
    expect(source).toMatch(/No password is entered or shared here/i);
  });

  /** The wording that described a screen that did not exist. */
  it("no longer promises only a bare code", () => {
    expect(source).not.toMatch(/receives a short-lived password setup code/i);
  });
});

/**
 * The dashboard's responsive shell, mounted whole.
 *
 * Both assertions pin classes that are load-bearing at phone width and
 * invisible everywhere else — jsdom cannot lay out a page, so the test holds
 * the line the real-browser probe measured: at 390px the document ran to 487px
 * with the nav band alone 471px of it, and the "as of" stamp did not render
 * at all. The classes are the fix; drop one and a phone scrolls sideways or
 * loses its timestamp again while every desktop check stays green.
 *
 * `vi.hoisted` because `vi.mock` factories run before the module body: the
 * fixtures they close over must exist by then, and the module-scope literals
 * above (PIPELINE_FULL, series) would still be in their temporal dead zone.
 */
const consoleFixtures = vi.hoisted(() => {
  const pipeline = {
    byStatus: {
      applied: 40,
      reviewed: 22,
      shortlisted: 11,
      interview: 5,
      offered: 2,
      rejected: 9,
      withdrawn: 0,
    },
    total: 89,
    live: 80,
    decided: 9,
  };
  const jobsPostedSeries = Array.from({ length: 56 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 5, 1));
    d.setUTCDate(d.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), count: ({ 0: 1, 10: 3, 40: 2 } as Record<number, number>)[i] ?? 0 };
  });
  return {
    insights: {
      triage: { pendingRecruiters: 2, companiesMissingBranding: 0 },
      pipeline,
      liquidity: { openJobs: 12, jobsWithApplications: 7, applicationsPerJob: 1.4 },
      composition: {
        byDepartment: [{ label: "Engineering", count: 9 }],
        byType: [{ label: "Full-time", count: 10 }],
        remoteOpenJobs: 4,
      },
      jobsPostedSeries,
      generatedAt: "2026-08-31T09:41:00.000Z",
    } as AdminInsightsDto,
    overview: {
      recruiters: { pending: 2, active: 6, suspended: 1 },
      seekers: { total: 40 },
      jobs: { total: 198 },
      companies: { total: 27 },
      applications: { total: 89 },
    } as AdminOverviewDto,
  };
});

vi.mock("@/hooks/useAdminConsole", () => ({
  useAdminOverview: () => ({
    data: consoleFixtures.overview,
    isPending: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: async () => ({}),
  }),
  useAdminInsights: () => ({
    data: consoleFixtures.insights,
    isPending: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: async () => ({}),
  }),
  useAdminActivity: () => ({
    data: [] as AdminActivityDto[],
    isPending: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: async () => ({}),
  }),
  useCreateAdmin: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe("AdminDashboard at phone width", () => {
  function renderDashboard() {
    return rtlRender(
      <Provider store={makeStore()}>
        <MemoryRouter>
          <AdminDashboard />
        </MemoryRouter>
      </Provider>,
    );
  }

  it("renders the 'as of' stamp at every width, not only from sm up", () => {
    // The stamp is the only clue the numbers are a snapshot. It was hidden
    // below sm, which is the width where a refresh is most likely the reason
    // the dashboard was opened. `hidden … sm:inline` was the removed bug;
    // re-adding the hidden class must fail here.
    const { container } = renderDashboard();
    const stamp = screen.getByText(/^as of/);
    expect(stamp.className).not.toMatch(/\bhidden\b/);
    expect(stamp.className).not.toMatch(/sm:inline/);
    expect(container).toBeInTheDocument();
  });

  it("caps the nav band so the workbench cannot grow past the viewport", () => {
    // A grid item's automatic minimum is its content's min-content, and the
    // mobile nav strip's labels are deliberately nowrap — without this cap the
    // grid track grows to the full label width and drags the whole page with
    // it. Measured: 390px viewport, 487px document.
    const { container } = renderDashboard();
    const aside = container.querySelector("aside");
    expect(aside).not.toBeNull();
    expect(aside!.className).toMatch(/\bmin-w-0\b/);
  });
});
