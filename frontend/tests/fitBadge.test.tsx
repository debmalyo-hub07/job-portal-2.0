import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import type { ScoreBreakdown } from "@jobportal/shared";
import { computeJobFit, FACTOR_KEYS } from "@jobportal/shared";

import { makeStore, renderRoute } from "./helpers/renderRoute";
import { FitBadge, FitBreakdown } from "@/components/FitBadge";
import Job from "@/components/Job";
import JobDescription from "@/components/JobDescription";
import { apiClient } from "@/lib/apiClient";
import { setSingleJob } from "@/redux/jobSlice";

const seeker = {
  skills: ["typescript", "node"],
  experienceYears: 6,
  location: "Kolkata",
  salaryMin: 8,
  salaryMax: 20,
  openToRemote: true,
};

const job = {
  requirements: ["typescript", "node"],
  salary: 12,
  experienceLevel: 4,
  location: "Kolkata",
  workMode: "onsite" as const,
};

const perfect = computeJobFit(seeker, job);
/** Every requirement missed and the pay outside the band: two real shortfalls. */
const poor = computeJobFit({ ...seeker, skills: [], salaryMin: 40 }, job);
/**
 * A fixture where the biggest loss is *not* the first one listed.
 *
 * `poor` cannot tell "largest shortfall" from "first shortfall" — skills is both.
 * Here one of three skills is missing (13.3 of 40 lost) while the pay sits far
 * enough below the band to zero all 25 salary points, so the answer is the
 * second factor in the list and picking the first one is a visible failure.
 */
const skewed = computeJobFit(
  { ...seeker, skills: ["typescript", "node"], salaryMin: 40, salaryMax: 60 },
  { ...job, requirements: ["typescript", "node", "react"] },
);

const cardJob = {
  id: "job-1",
  title: "Frontend Engineer",
  description: "Build things.",
  requirements: ["typescript"],
  salary: 12,
  location: "Kolkata",
  jobType: "Full-time",
  position: 2,
  experienceLevel: 4,
  remote: false,
  createdAt: new Date().toISOString(),
  company: { id: "c1", name: "Northvale", logoUrl: null },
};

describe("FitBadge", () => {
  /**
   * `fit` is optional on `JobDto` because the public routes serve anonymous
   * visitors and recruiters too, and neither is the subject of a seeker's score.
   * Rendering "0% fit" for them would be a claim about somebody nobody made.
   */
  it("renders nothing at all when there is no score", () => {
    const { container } = renderRoute(<FitBadge fit={undefined} />, { route: "/jobs" });
    // `renderRoute` mounts the real providers, so the container is never empty —
    // what must be empty is everything they wrapped.
    expect(container.textContent).toBe("");
  });

  it("shows the score", () => {
    renderRoute(<FitBadge fit={poor} />, { route: "/jobs" });
    expect(screen.getByText(new RegExp(`${Math.round(poor.score)}% fit`))).toBeInTheDocument();
  });

  /**
   * The line names the factor that cost the most, not the first one in the list.
   *
   * A badge that says "Location differs" while the seeker is missing every
   * required skill explains the wrong thing — and the shortfall order is exactly
   * what `explain` already sorts by.
   */
  it("names the largest shortfall rather than the first one listed", () => {
    renderRoute(<FitBadge fit={skewed} />, { route: "/jobs" });
    // Salary loses all 25 of its points; the one missing skill loses 13.3 of 40.
    // Salary is second in the factor list, so a component taking the first
    // shortfall it finds would say "missing react" here.
    expect(screen.getByText(/outside the range you set/i)).toBeInTheDocument();
    expect(screen.queryByText(/missing/i)).not.toBeInTheDocument();
  });

  it("says everything matched when nothing was lost", () => {
    renderRoute(<FitBadge fit={perfect} />, { route: "/jobs" });
    expect(screen.getByText(/100% fit/)).toBeInTheDocument();
    expect(screen.getByText(/everything you asked for/i)).toBeInTheDocument();
  });

  it("speaks to the seeker, not about them", () => {
    renderRoute(<FitBadge fit={poor} />, { route: "/jobs" });
    // The reason strings used to be recruiter-voiced — a seeker reading their own
    // job card was told "the seeker isn't open to it". Asserting the absence of
    // that one phrase guards nothing now that it is gone from the source, so this
    // asserts the positive property: the job direction addresses its reader.
    const reason = screen.getByText(/missing/i).textContent ?? "";
    expect(reason).toMatch(/\byou(r|'re)?\b/i);
    expect(document.body.textContent).not.toMatch(/\bthey\b|\btheir\b|\bthe seeker\b/i);
  });

  it("is not interactive", () => {
    const { container } = renderRoute(<FitBadge fit={poor} />, { route: "/jobs" });
    expect(within(container).queryByRole("button")).not.toBeInTheDocument();
    expect(within(container).queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("FitBreakdown", () => {
  it("accounts for every factor and totals to the score", () => {
    renderRoute(<FitBreakdown fit={poor} />, { route: "/description/job-1" });
    for (const key of FACTOR_KEYS) {
      expect(
        screen.getByText(new RegExp(`^${key}$`, "i")),
        `${key} is unaccounted for, so the arithmetic cannot be checked`,
      ).toBeInTheDocument();
    }
    // The visible total has to be the score the badge shows, or the breakdown
    // explains a different number from the one it sits under.
    expect(screen.getByText(new RegExp(`${Math.round(poor.score)}\\s*/\\s*100`))).toBeInTheDocument();
  });

  it("renders nothing without a score", () => {
    const { container } = renderRoute(<FitBreakdown fit={undefined} />, { route: "/jobs" });
    expect(container.textContent).toBe("");
  });

  it("shows each factor's earned points against its ceiling", () => {
    renderRoute(<FitBreakdown fit={poor} />, { route: "/description/job-1" });
    const skills = poor.factors.find((f) => f.key === "skills")!;
    expect(
      screen.getByText(new RegExp(`${skills.earned}\\s*/\\s*${skills.max}`)),
    ).toBeInTheDocument();
  });
});

describe("the job card carries the badge without becoming interactive", () => {
  it("shows the score when the API sent one", () => {
    renderRoute(<Job job={{ ...cardJob, fit: poor } as never} />, { route: "/jobs" });
    expect(screen.getByText(new RegExp(`${Math.round(poor.score)}% fit`))).toBeInTheDocument();
  });

  it("keeps one link and no buttons", () => {
    const { container } = renderRoute(<Job job={{ ...cardJob, fit: poor } as never} />, {
      route: "/jobs",
    });
    // The card is a single `<Link>`; a tooltip trigger or a details button inside
    // it would add a second tab stop per result and nest a control in a link.
    expect(within(container).getAllByRole("link")).toHaveLength(1);
    expect(within(container).queryByRole("button")).not.toBeInTheDocument();
  });

  it("looks the same as before for a visitor with no score", () => {
    const { container } = renderRoute(<Job job={cardJob as never} />, { route: "/jobs" });
    expect(within(container).queryByText(/% fit/)).not.toBeInTheDocument();
  });
});

describe("the breakdown's own arithmetic", () => {
  it("is what the pipeline produced, not a re-derivation", () => {
    // Guards against the badge computing its own total: a sum done in the
    // component drifts from the pipeline's rounding the moment either changes.
    const summed: ScoreBreakdown = { score: 42, factors: poor.factors };
    renderRoute(<FitBreakdown fit={summed} />, { route: "/description/job-1" });
    expect(screen.getByText(/42\s*\/\s*100/)).toBeInTheDocument();
  });
});

describe("the job detail page explains the score", () => {
  function mountDetail(fit?: ScoreBreakdown) {
    vi.spyOn(apiClient, "get").mockImplementation(((url: string) =>
      url.startsWith("/job/get")
        ? Promise.resolve({ data: { success: true, job: { ...cardJob, fit } } })
        : Promise.resolve({
            data: { success: true, items: [], total: 0, page: 1, pages: 1 },
          })) as never);

    const store = makeStore();
    store.dispatch(setSingleJob({ ...cardJob, fit } as never));
    return renderRoute(<JobDescription />, {
      route: "/description/job-1",
      path: "/description/:id",
      store,
    });
  }

  it("shows the whole breakdown, not just the headline number", async () => {
    mountDetail(poor);
    // Scoped to the panel's own region, because the page's Overview list has a
    // "Salary" row of its own — an unscoped query matches both and cannot tell
    // which surface it read.
    const panel = await screen.findByRole("region", { name: /how you fit/i });
    for (const key of FACTOR_KEYS) {
      expect(
        within(panel).getByText(new RegExp(`^${key}$`, "i")),
        `${key} is unaccounted for on the detail page`,
      ).toBeInTheDocument();
    }
    expect(
      within(panel).getByText(new RegExp(`${Math.round(poor.score)}\\s*/\\s*100`)),
    ).toBeInTheDocument();
  });

  it("keeps exactly one h1", async () => {
    mountDetail(poor);
    await screen.findByRole("region", { name: /how you fit/i });
    // The panel's own title is an <h2>. The convention is one <h1> per route and
    // it belongs to the page, not to a panel inside it.
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("omits the panel entirely when the API sent no score", async () => {
    mountDetail(undefined);
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("region", { name: /how you fit/i })).not.toBeInTheDocument();
  });
});
