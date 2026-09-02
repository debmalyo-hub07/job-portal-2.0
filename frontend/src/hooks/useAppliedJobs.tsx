import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { AppliedJobDto, PaginatedResponse } from "@jobportal/shared";

import { apiClient } from "@/lib/apiClient";

/**
 * The seeker's own applications.
 *
 * react-query, replacing the `useGetAppliedJobs` effect that dispatched a single
 * unpaginated page into `jobSlice` on mount and never refetched. That shape had
 * two defects this fixes: a recruiter's decision was invisible until the page
 * was navigated to afresh, and the `limit: 50` meant application 51 onward did
 * not exist as far as the profile was concerned.
 *
 * `refetchOnWindowFocus` is enabled HERE rather than globally: the client default
 * is off, and flipping it for every query would refetch the job board and the
 * console on every tab switch. A candidate returning to a parked tab is exactly
 * the case that needs it, since status changes originate elsewhere.
 */
const APPLIED_KEY = ["applied-jobs"] as const;
/** The per-job checks the role page's button state reads. */
const APPLIED_ONE_KEY = ["applied-job"] as const;

export function useAppliedJobs() {
  // Local, not URL state: the profile has one list and no shareable search, so a
  // query param here would be a URL that means nothing to anyone it is sent to.
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: [...APPLIED_KEY, page],
    queryFn: async ({ signal }) => {
      const res = await apiClient.get<{ success: boolean } & PaginatedResponse<AppliedJobDto>>(
        "/application/get",
        { params: { page }, signal },
      );
      return res.data;
    },
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });
  return { ...query, page, setPage };
}

/**
 * Has this seeker applied to this job? Its own per-job read, replacing the
 * effect that scanned the applied list with `limit: 50` — application 51
 * onward was invisible to the role page's own button. Exact at any list
 * size, and cached per role.
 */
export function useIsApplied(jobId: string | undefined) {
  return useQuery({
    queryKey: [...APPLIED_ONE_KEY, jobId],
    queryFn: async ({ signal }) => {
      const res = await apiClient.get<{ success: boolean; applied: boolean }>(
        `/application/applied/${jobId}`,
        { signal },
      );
      return res.data.applied;
    },
    enabled: Boolean(jobId),
  });
}

/**
 * Repaints every per-job check and the applied list — called after a
 * successful apply, whose outcome is the server's to state.
 */
export function useInvalidateApplied() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: APPLIED_ONE_KEY });
    void queryClient.invalidateQueries({ queryKey: APPLIED_KEY });
  };
}

/**
 * Withdrawing an application.
 *
 * Invalidates rather than mutating the cache in place: the server sets the
 * terminal status and stamps the history entry, so the row's new shape is the
 * server's answer, not something the client can predict correctly.
 */
export function useWithdrawApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (applicationId: string) => {
      await apiClient.post(`/application/${applicationId}/withdraw`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: APPLIED_KEY });
    },
  });
}
