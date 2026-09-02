import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { PostingHealthDto } from "@jobportal/shared";

import { PostingHealth } from "@/components/workspace/PostingHealth";

// The dashboard-test convention: these panels are pure functions of one DTO
// slice, so they mount with a literal rather than driving the route.
function series(days: number, at: Record<number, number> = {}) {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.UTC(2026, 5, 1));
    d.setUTCDate(d.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), count: at[i] ?? 0 };
  });
}

const health = (over: Partial<PostingHealthDto> = {}): PostingHealthDto => ({
  series: series(56, { 10: 4, 20: 7 }),
  firstApplicationAt: "2026-06-11T00:00:00.000Z",
  total: 11,
  ...over,
});

const renderHealth = (props: Parameters<typeof PostingHealth>[0]) =>
  render(<MemoryRouter>{<PostingHealth {...props} />}</MemoryRouter>);

describe("PostingHealth", () => {
  it("plots a line and offers the same numbers as a table", () => {
    // "A tooltip as the only way to read a value" is the anti-pattern. A dense
    // series cannot label every point, so the table view is what un-gates it.
    const { container } = renderHealth({ health: health(), jobId: "j1" });
    expect(container.querySelector("svg path[data-mark='line']")).toBeTruthy();
    const table = screen.getByRole("table", { name: /applications per day/i });
    expect(within(table).getByText("7")).toBeInTheDocument();
  });

  it("summarises the window so the headline needs no hover at all", () => {
    renderHealth({ health: health(), jobId: "j1" });
    expect(screen.getByText("11 applicants")).toBeInTheDocument();
    expect(screen.getByText(/busiest day: 7/i)).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /applications per day over the last eight weeks/i }),
    ).toBeInTheDocument();
  });

  it("states time-to-first from the job's own creation, not a server opinion", () => {
    // firstApplicationAt 2026-06-11 minus createdAt 2026-06-08 = 3 days.
    renderHealth({ health: health(), jobId: "j1", jobCreatedAt: "2026-06-08T00:00:00.000Z" });
    expect(screen.getByText(/First applicant after 3 days/)).toBeInTheDocument();
  });

  it("says 'within a day' when the first applicant landed the same day", () => {
    renderHealth({
      health: health({ firstApplicationAt: "2026-06-08T09:00:00.000Z" }),
      jobId: "j1",
      jobCreatedAt: "2026-06-08T00:00:00.000Z",
    });
    expect(screen.getByText(/First applicant within a day of posting/)).toBeInTheDocument();
  });

  it("makes the empty state an invitation with the live posting's link", () => {
    renderHealth({
      health: health({ series: series(56), firstApplicationAt: null, total: 0 }),
      jobId: "64b0c8f2a9d3e45f6a7b8c9d",
    });
    expect(screen.getByText(/no applicants yet/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /view the live posting/i });
    expect(link).toHaveAttribute("href", "/description/64b0c8f2a9d3e45f6a7b8c9d");
  });

  it("notes when nothing applied in the window instead of drawing a flat line", () => {
    const { container } = renderHealth({
      health: health({ series: series(56), firstApplicationAt: "2026-01-05T00:00:00.000Z", total: 3 }),
      jobId: "j1",
      jobCreatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(screen.getByText(/no applications in the last eight weeks/i)).toBeInTheDocument();
    expect(container.querySelector("svg path[data-mark='line']")).toBeNull();
  });

  it("renders the facts rather than crashing on an empty series", () => {
    // The API guarantees 56 dense points; a component that indexes
    // `series[0]` unguarded turns a contract change into a blank page.
    renderHealth({
      health: health({ series: [], firstApplicationAt: "2026-06-11T00:00:00.000Z", total: 2 }),
      jobId: "j1",
      jobCreatedAt: "2026-06-08T00:00:00.000Z",
    });
    expect(screen.getByText("2 applicants")).toBeInTheDocument();
    expect(screen.getByText(/First applicant after 3 days/)).toBeInTheDocument();
  });
});
