import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import type {
  AccountEventDto,
  AdminActivityDto,
  AdminCompanyDto,
  AdminInsightsDto,
  AdminJobDto,
  AdminOverviewDto,
  AdminRecruiterDto,
  AdminSeekerDto,
  PaginatedResponse,
  PendingRecruiterDto,
} from "@jobportal/shared";

import { apiClient } from "@/lib/apiClient";

/**
 * The admin console's server state.
 *
 * react-query rather than Redux, following the 4B job board: these are reads of
 * server data with a cache and a refetch story, not client state anyone
 * dispatches into. The approval mutations invalidate both the queue and the
 * overview, because approving a recruiter changes the dashboard's counters and
 * a stale "3 pending" beside an empty queue reads as a bug.
 *
 * Every read here carries a `refetchInterval` equal to its own `staleTime`.
 * These screens exist to describe what is happening right now, and without an
 * interval every number on them is as old as the last navigation — an admin
 * watches a queue that emptied ten minutes ago and the only remedy is the
 * browser's reload button. Matching the interval to the stale window rather than
 * picking one number for all of them is deliberate: the queue moves on every
 * approval, the insights aggregations move on any write anywhere, and asking
 * again sooner than the data can change is load bought for nothing.
 *
 * `refetchIntervalInBackground` is left at its default of false throughout, so a
 * forgotten tab stops asking. The manual refresh control on the dashboard stays
 * — an admin who has just acted should not have to wait out a tick.
 */

/** Every console query hangs off this root so one call can clear the console. */
const ADMIN_KEY = ["admin"] as const;

export function useAdminOverview() {
  return useQuery({
    queryKey: [...ADMIN_KEY, "overview"],
    queryFn: async ({ signal }) => {
      const res = await apiClient.get<{ success: boolean } & AdminOverviewDto>(
        "/admin/overview",
        { signal },
      );
      return res.data;
    },
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });
}

/**
 * The dashboard's aggregations.
 *
 * Split from `useAdminOverview` rather than folded into it, because the two go
 * stale at different rates: the counters move on every approval, these move on
 * any write anywhere in the platform. One query would impose the shorter policy
 * on both and re-run eleven aggregations to refresh three counts.
 *
 * `keepPreviousData` holds the last render through a refetch. A skeleton flash on
 * an already-populated dashboard is a layout jump for no new information.
 */
export function useAdminInsights() {
  return useQuery({
    queryKey: [...ADMIN_KEY, "insights"],
    queryFn: async ({ signal }) => {
      const res = await apiClient.get<{ success: boolean } & AdminInsightsDto>("/admin/insights", {
        signal,
      });
      return res.data;
    },
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });
}

export function useAdminActivity() {
  return useQuery({
    queryKey: [...ADMIN_KEY, "activity"],
    queryFn: async ({ signal }) => {
      const res = await apiClient.get<{ success: boolean } & AdminActivityDto>("/admin/activity", {
        signal,
      });
      return res.data.items;
    },
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });
}

export function usePendingRecruiters() {
  return useQuery({
    queryKey: [...ADMIN_KEY, "recruiters", "pending"],
    queryFn: async ({ signal }) => {
      const res = await apiClient.get<{ success: boolean; items: PendingRecruiterDto[] }>(
        "/admin/recruiters/pending",
        { signal },
      );
      return res.data.items;
    },
    staleTime: 15 * 1000,
    refetchInterval: 15 * 1000,
  });
}

/**
 * Approve or deny, sharing one invalidation.
 *
 * Both outcomes remove a row from the queue and move a dashboard counter, so
 * they invalidate the same keys. Nothing here is optimistic: a moderation
 * action that appears to succeed and silently did not is the one failure mode
 * worth an extra round trip to avoid.
 */
export function useRecruiterDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (decision: { id: string; action: "approve" } | { id: string; action: "deny"; reason: string }) => {
      if (decision.action === "approve") {
        await apiClient.post(`/admin/recruiters/${decision.id}/approve`);
      } else {
        await apiClient.post(`/admin/recruiters/${decision.id}/deny`, {
          reason: decision.reason,
        });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...ADMIN_KEY, "recruiters", "pending"] });
      void queryClient.invalidateQueries({ queryKey: [...ADMIN_KEY, "overview"] });
      // The triage band reads pendingRecruiters from insights, so approving
      // without this leaves "3 awaiting approval" above an empty queue.
      void queryClient.invalidateQueries({ queryKey: [...ADMIN_KEY, "insights"] });
    },
  });
}

export function useCreateAdmin() {
  return useMutation({
    mutationFn: async (input: { fullName: string; email: string; provisioningKey: string }) => {
      const res = await apiClient.post<{ success: true; message: string }>("/admin/admins", input);
      return res.data;
    },
  });
}

/**
 * The keyword + page state for a console list, read from the URL.
 *
 * Same rule as the job board: the URL is the state, so a refresh or a shared
 * link reproduces the screen. `page` is 1-based to match the API.
 */
function useListParams() {
  const [searchParams, setSearchParams] = useSearchParams();
  const keyword = searchParams.get("q") ?? "";
  const page = Number(searchParams.get("page") ?? "1") || 1;

  const setKeyword = (next: string) => {
    const sp = new URLSearchParams(searchParams);
    if (next) sp.set("q", next);
    else sp.delete("q");
    // A new search invalidates the page — never land on "page 5 of 2".
    sp.delete("page");
    setSearchParams(sp, { replace: true });
  };

  const setPage = (next: number) => {
    const sp = new URLSearchParams(searchParams);
    if (next > 1) sp.set("page", String(next));
    else sp.delete("page");
    setSearchParams(sp, { replace: false });
  };

  return { keyword, page, setKeyword, setPage };
}

function listQueryString(keyword: string, page: number): string {
  const sp = new URLSearchParams();
  if (keyword) sp.set("keyword", keyword);
  if (page > 1) sp.set("page", String(page));
  return sp.toString();
}

export function useAdminJobs() {
  const { keyword, page, setKeyword, setPage } = useListParams();
  const qs = listQueryString(keyword, page);
  const query = useQuery({
    queryKey: [...ADMIN_KEY, "jobs", qs],
    queryFn: async ({ signal }) => {
      const res = await apiClient.get<{ success: boolean } & PaginatedResponse<AdminJobDto>>(
        `/admin/review/jobs?${qs}`,
        { signal },
      );
      return res.data;
    },
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
  return { ...query, keyword, page, setKeyword, setPage };
}

export function useAdminCompanies() {
  const { keyword, page, setKeyword, setPage } = useListParams();
  const qs = listQueryString(keyword, page);
  const query = useQuery({
    queryKey: [...ADMIN_KEY, "companies", qs],
    queryFn: async ({ signal }) => {
      const res = await apiClient.get<{ success: boolean } & PaginatedResponse<AdminCompanyDto>>(
        `/admin/review/companies?${qs}`,
        { signal },
      );
      return res.data;
    },
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
  return { ...query, keyword, page, setKeyword, setPage };
}

/**
 * Project D's oversight listings. The seekers screen paginates and
 * keyword-matches exactly like the jobs and companies screens, so the two
 * share `useListParams` and the same query shape — a console listing whose
 * URL state behaved differently from its siblings would be a small mystery.
 */
export function useAdminSeekers() {
  const { keyword, page, setKeyword, setPage } = useListParams();
  const qs = listQueryString(keyword, page);
  const query = useQuery({
    queryKey: [...ADMIN_KEY, "seekers", qs],
    queryFn: async ({ signal }) => {
      const res = await apiClient.get<{ success: boolean } & PaginatedResponse<AdminSeekerDto>>(
        `/admin/seekers?${qs}`,
        { signal },
      );
      return res.data;
    },
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
  return { ...query, keyword, page, setKeyword, setPage };
}

/**
 * Every recruiter, not just the pending queue — the monitoring screen's read.
 */
export function useAdminRecruiters() {
  const { keyword, page, setKeyword, setPage } = useListParams();
  const qs = listQueryString(keyword, page);
  const query = useQuery({
    queryKey: [...ADMIN_KEY, "recruiters", "all", qs],
    queryFn: async ({ signal }) => {
      const res = await apiClient.get<{ success: boolean } & PaginatedResponse<AdminRecruiterDto>>(
        `/admin/recruiters?${qs}`,
        { signal },
      );
      return res.data;
    },
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
  return { ...query, keyword, page, setKeyword, setPage };
}

/**
 * Suspend or reinstate an account. Shared by both screens because the
 * mutation is the same write with a different portal prefix; the invalidation
 * covers both listings AND the overview, whose counters move with every
 * status change.
 */
export function useAccountStatusChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      portal: "seeker" | "recruiter";
      id: string;
      action: "suspend" | "reinstate";
      reason?: string;
    }) => {
      await apiClient.post(`/admin/${input.portal === "seeker" ? "seekers" : "recruiters"}/${input.id}/${input.action}`, ...(input.reason ? [{ reason: input.reason }] : []));
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: [...ADMIN_KEY, "seekers"] });
      void queryClient.invalidateQueries({ queryKey: [...ADMIN_KEY, "recruiters"] });
      void queryClient.invalidateQueries({ queryKey: [...ADMIN_KEY, "overview"] });
      void queryClient.invalidateQueries({
        queryKey: [...ADMIN_KEY, "events", variables.portal, variables.id],
      });
    },
  });
}

/** The per-account history. Keyed per subject so the dialog refetches on open. */
export function useAccountEvents(portal: "seeker" | "recruiter" | null, id: string | null) {
  return useQuery({
    queryKey: [...ADMIN_KEY, "events", portal, id],
    queryFn: async ({ signal }) => {
      const res = await apiClient.get<{ success: boolean; items: AccountEventDto[] }>(
        `/admin/accounts/${portal}/${id}/events`,
        { signal },
      );
      return res.data.items;
    },
    enabled: portal !== null && id !== null,
    staleTime: 15 * 1000,
  });
}
