import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { APPLICATION_STATUSES, type AdminInsightsDto, type AdminOverviewDto } from "@jobportal/shared";

import AdminDashboard from "@/components/console/AdminDashboard";
import { makeQueryClient, makeStore } from "./helpers/renderRoute";

/**
 * The console's refetch stutter, pinned. The dashboard used to dim to 60%
 * opacity whenever ANY of its three queries was fetching — including the
 * silent background polls that fire every 30-60 seconds — so the whole page
 * visibly pulsed twice a minute. The dim belongs to a manual refresh alone,
 * where the button's spinner is already speaking.
 */

// vi.mock is hoisted above the imports, so the shared mutable state the factory
// closes over has to be hoisted with it.
const harness = vi.hoisted(() => {
  const state = { fetching: false };
  const pending: Array<() => void> = [];
  const refetch = () =>
    new Promise<void>((resolve) => {
      pending.push(resolve);
    });
  return { state, pending, refetch };
});

vi.mock("@/hooks/useAdminConsole", () => ({
  useAdminOverview: () => ({
    data: {
      recruiters: { pending: 0, active: 4, suspended: 0 },
      seekers: { total: 1 },
      jobs: { total: 198 },
      companies: { total: 27 },
      applications: { total: 0 },
    } satisfies AdminOverviewDto,
    isFetching: harness.state.fetching,
    isError: false,
    isPending: false,
    refetch: harness.refetch,
  }),
  useAdminInsights: () => ({
    data: {
      triage: { pendingRecruiters: 0, companiesMissingBranding: 0 },
      pipeline: {
        byStatus: Object.fromEntries(APPLICATION_STATUSES.map((status) => [status, 0])),
        total: 0,
        live: 0,
        decided: 0,
      },
      liquidity: { openJobs: 3, jobsWithApplications: 1, applicationsPerJob: 0.5 },
      composition: {
        byDepartment: [{ label: "Engineering", count: 2 }],
        byType: [{ label: "Full-time", count: 3 }],
        remoteOpenJobs: 1,
      },
      jobsPostedSeries: [
        { date: "2026-08-30", count: 1 },
        { date: "2026-08-31", count: 2 },
      ],
      generatedAt: new Date("2026-08-31T12:00:00Z").toISOString(),
    } satisfies AdminInsightsDto,
    isFetching: harness.state.fetching,
    isError: false,
    isPending: false,
    refetch: harness.refetch,
  }),
  useAdminActivity: () => ({
    data: [],
    isFetching: harness.state.fetching,
    isError: false,
    isPending: false,
    refetch: harness.refetch,
  }),
  useCreateAdmin: () => ({ mutate: vi.fn(), isPending: false }),
}));

const theDashboard = <AdminDashboard />;

function renderDashboard() {
  return render(
    <Provider store={makeStore()}>
      <QueryClientProvider client={makeQueryClient()}>
        <MemoryRouter initialEntries={["/admin"]}>
          <Routes>
            <Route path="/admin" element={theDashboard} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>,
  );
}

const dimmed = (container: HTMLElement) => container.querySelector("div.opacity-60") !== null;

describe("the console's background refetches", () => {
  it("does not dim the dashboard while a background poll is in flight", async () => {
    // The regression: isFetching true with no manual refresh — exactly the
    // state every 30-second poll passes through.
    harness.state.fetching = true;
    const { container } = renderDashboard();

    expect(await screen.findByText(/as of/i)).toBeTruthy();
    expect(dimmed(container)).toBe(false);
  });

  it("dims only while a manual refresh is in flight, then clears", async () => {
    harness.state.fetching = false;
    harness.pending.length = 0;
    const { container } = renderDashboard();
    expect(await screen.findByText(/as of/i)).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /refresh/i }));

    // While the manual refresh is in flight, the dim is honest feedback.
    await act(async () => {});
    expect(dimmed(container)).toBe(true);

    // Complete it: every refetch resolves, the finally clears the flag.
    harness.state.fetching = false;
    await act(async () => {
      harness.pending.splice(0).forEach((resolve) => resolve());
    });
    expect(dimmed(container)).toBe(false);
  });
});
