import { describe, expect, it, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";

import { apiClient } from "@/lib/apiClient";
import { makeQueryClient, makeStore } from "./helpers/renderRoute";
import {
  useAdminActivity,
  useAdminInsights,
  useAdminOverview,
  usePendingRecruiters,
} from "@/hooks/useAdminConsole";
import {
  useApplicants,
  useApplicationQueue,
  useOwnedCompanies,
  useOwnedJobs,
} from "@/hooks/useRecruiterWorkspace";
import { useSessionRefresh } from "@/hooks/useSessionRefresh";

/**
 * The console and the workspace refresh themselves.
 *
 * Before this, every number on the dashboard was as old as the last navigation.
 * An admin watched a queue that had emptied, a recruiter watched an applicant
 * count that had moved, and the only fix was the browser's reload button — on
 * screens whose whole purpose is to describe what is happening right now.
 *
 * Two things are worth pinning: that a query with an interval actually issues a
 * second request without anyone touching it, and that every live console read
 * declares an interval at all. The second is the regression guard — a hook added
 * later is one omitted line away from being permanently stale, and nothing about
 * that omission looks wrong in review.
 */

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function wrapper(client: QueryClient) {
  const store = makeStore();
  return ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <QueryClientProvider client={client}>
        {/* Two of these read their keyword and page out of the URL, so they need
            a router the way they have one in the app. */}
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    </Provider>
  );
}

describe("polling mechanism", () => {
  it("issues a second request after the interval elapses, with no user action", async () => {
    const get = vi
      .spyOn(apiClient, "get")
      .mockResolvedValue({ data: { success: true, user: null } } as never);
    const client = makeQueryClient();

    renderHook(() => useSessionRefresh("recruiter", { enabled: true, intervalMs: 40 }), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThanOrEqual(1));
    const first = get.mock.calls.length;
    // Real timers with a 40ms interval rather than fake ones: react-query
    // schedules its interval outside React's control, and advancing fake timers
    // through it needs act() wrappers around a timer this test does not own.
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(first), { timeout: 2000 });
  });

  it("issues nothing at all while disabled", async () => {
    const get = vi
      .spyOn(apiClient, "get")
      .mockResolvedValue({ data: { success: true, user: null } } as never);
    const client = makeQueryClient();

    renderHook(() => useSessionRefresh("recruiter", { enabled: false, intervalMs: 40 }), {
      wrapper: wrapper(client),
    });

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(get).not.toHaveBeenCalled();
  });
});

/**
 * Every live read on the two session surfaces, and the interval it must carry.
 *
 * The values match each hook's own `staleTime` rather than a single number: the
 * pending queue moves on every approval, the dashboard's eleven aggregations move
 * on any write anywhere, and refetching faster than data goes stale is load
 * bought for no new information.
 */
const LIVE_READS: ReadonlyArray<[string, () => unknown, number]> = [
  ["useAdminOverview", () => useAdminOverview(), 30_000],
  ["useAdminInsights", () => useAdminInsights(), 60_000],
  ["useAdminActivity", () => useAdminActivity(), 30_000],
  ["usePendingRecruiters", () => usePendingRecruiters(), 15_000],
  ["useOwnedJobs", () => useOwnedJobs(), 30_000],
  ["useOwnedCompanies", () => useOwnedCompanies(), 30_000],
  ["useApplicants", () => useApplicants("job-1"), 30_000],
  ["useApplicationQueue", () => useApplicationQueue(), 30_000],
];

describe("live console and workspace reads", () => {
  it.each(LIVE_READS)("%s refreshes itself on an interval", async (_name, hook, expected) => {
    vi.spyOn(apiClient, "get").mockResolvedValue({
      data: { success: true, items: [], page: 1, pages: 1, total: 0 },
    } as never);
    const client = makeQueryClient();

    renderHook(hook, { wrapper: wrapper(client) });

    // Read from the cache rather than from the hook's return value: this is the
    // option react-query will actually schedule on, not a restatement of the
    // literal in the source.
    await waitFor(() => expect(client.getQueryCache().getAll().length).toBeGreaterThan(0));
    const entry = client.getQueryCache().getAll()[0]!;
    expect(entry.observers[0]?.options.refetchInterval).toBe(expected);
  });

  /**
   * Not `refetchIntervalInBackground`. A forgotten console tab must stop asking:
   * the default is false, and turning it on would keep eleven aggregations
   * running against a single instance for a screen nobody is looking at.
   */
  it.each(LIVE_READS)("%s does not keep polling a hidden tab", async (_name, hook) => {
    vi.spyOn(apiClient, "get").mockResolvedValue({
      data: { success: true, items: [], page: 1, pages: 1, total: 0 },
    } as never);
    const client = makeQueryClient();

    renderHook(hook, { wrapper: wrapper(client) });

    await waitFor(() => expect(client.getQueryCache().getAll().length).toBeGreaterThan(0));
    const entry = client.getQueryCache().getAll()[0]!;
    expect(entry.observers[0]?.options.refetchIntervalInBackground).toBeFalsy();
  });

  /**
   * A tab that was parked while the world moved. Polling stops on hidden tabs
   * (the test above), so without a focus refetch the worst case is a full
   * interval of staleness after the user returns — and "reload the page" was
   * the reported workaround. Focus refetches respect `staleTime`, so an
   * already-fresh list asks for nothing.
   */
  it.each(LIVE_READS)("%s refetches when its tab regains focus", async (_name, hook) => {
    vi.spyOn(apiClient, "get").mockResolvedValue({
      data: { success: true, items: [], page: 1, pages: 1, total: 0 },
    } as never);
    const client = makeQueryClient();

    renderHook(hook, { wrapper: wrapper(client) });

    await waitFor(() => expect(client.getQueryCache().getAll().length).toBeGreaterThan(0));
    const entry = client.getQueryCache().getAll()[0]!;
    expect(entry.observers[0]?.options.refetchOnWindowFocus).toBe(true);
  });
});
