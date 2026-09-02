import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { PaginatedResponse, SavedJobDto } from "@jobportal/shared";

import { apiClient } from "@/lib/apiClient";

/**
 * The seeker's shortlist.
 *
 * The useAppliedJobs shape exactly: local page state (the list has no
 * shareable search, so a page param would be a URL that means nothing to
 * anyone it is sent to), keepPreviousData, and refetchOnWindowFocus — the
 * applied marker changes when the seeker applies from another surface, which
 * is the same "changed elsewhere" rationale that hook documents.
 */
const SAVED_KEY = ["saved-jobs"] as const;
/** The per-job checks the detail page's button state reads. */
const SAVED_ONE_KEY = ["saved-job"] as const;

export function useSavedJobs() {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: [...SAVED_KEY, page],
    queryFn: async ({ signal }) => {
      const res = await apiClient.get<{ success: boolean } & PaginatedResponse<SavedJobDto>>(
        "/saved",
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
 * Is this job on the seeker's shortlist? Its own per-job read rather than a
 * scan of the list: exact at any list size, and cached per role.
 */
export function useIsSaved(jobId: string | undefined) {
  return useQuery({
    queryKey: [...SAVED_ONE_KEY, jobId],
    queryFn: async ({ signal }) => {
      const res = await apiClient.get<{ success: boolean; saved: boolean }>(`/saved/${jobId}`, {
        signal,
      });
      return res.data.saved;
    },
    enabled: Boolean(jobId),
  });
}

/**
 * The toggle pair. Both invalidate the per-job checks and the list, which is
 * what repaints every button and row — the server is idempotent, so there is
 * no client-side guard to race.
 */
function useSavedInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: SAVED_ONE_KEY });
    void queryClient.invalidateQueries({ queryKey: SAVED_KEY });
  };
}

export function useSaveJob() {
  const invalidate = useSavedInvalidation();
  return useMutation({
    mutationFn: async (jobId: string) => {
      await apiClient.post(`/saved/${jobId}`);
    },
    onSuccess: invalidate,
  });
}

export function useUnsaveJob() {
  const invalidate = useSavedInvalidation();
  return useMutation({
    mutationFn: async (jobId: string) => {
      await apiClient.delete(`/saved/${jobId}`);
    },
    onSuccess: invalidate,
  });
}
