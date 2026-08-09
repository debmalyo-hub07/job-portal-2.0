import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import type {
  AdminCompanyDto,
  AdminJobDto,
  AdminOverviewDto,
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
