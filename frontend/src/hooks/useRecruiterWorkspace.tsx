import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import type {
  ApplicantDto,
  ApplicantsPageDto,
  CompanyDto,
  JobDto,
  JobStatus,
  PaginatedResponse,
  QueuedApplicantDto,
} from "@jobportal/shared";
import { RECRUITER_SETTABLE } from "@jobportal/shared";

import { apiClient } from "@/lib/apiClient";

/**
 * The recruiter workspace's server state.
 *
 * react-query rather than Redux, following the admin console and the 4B job
 * board: these are reads of server data with a cache and a refetch story, not
 * client state anyone dispatches into. Converging on it is what empties
 * companySlice and applicationSlice.
 *
 * Nothing here is optimistic. A hiring decision that appears to succeed and
 * silently did not is worth an extra round trip to avoid — and the absence of a
 * refetch after the decision POST is exactly the bug this replaces.
 *
 * The list reads carry a `refetchInterval` matching their `staleTime`, for the
 * same reason the console's do: a recruiter watching an applicant list is
 * watching for something a candidate does, and a list that only updates on
 * navigation makes them reload to find out. The single-record reads
 * (`useCompany`, `useJob`) deliberately do not poll — they back edit forms, where
 * a background write would fight whatever the recruiter is typing.
 *
 * `refetchIntervalInBackground` stays at its default of false, so a tab left open
 * in another window stops asking.
 */

/** Every workspace query hangs off this root so one call can clear it. */
const WORKSPACE_KEY = ["workspace"] as const;

/**
 * Keyword + page for a workspace list, read from the URL.
 *
 * Same rule as the console and the job board: the URL is the state, so a reload
 * or a shared link reproduces the screen. This is what replaces
 * `searchJobByText` and `searchCompanyByText` — the last two survivors of the
 * pattern 2B-2 deleted `searchedQuery` for.
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

/** The recruiter's own jobs. Keyword is server-side — see the API's listOwnedJobs. */
export function useOwnedJobs() {
  const { keyword, page, setKeyword, setPage } = useListParams();
  const qs = listQueryString(keyword, page);
  const query = useQuery({
    queryKey: [...WORKSPACE_KEY, "jobs", qs],
    queryFn: async ({ signal }) => {
      const res = await apiClient.get<{ success: boolean } & PaginatedResponse<JobDto>>(
        `/job/getadminjobs?${qs}`,
        { signal },
      );
      return res.data;
    },
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
    // Applicant counts on these rows move while the recruiter is looking at
    // them; see the note above the file's read hooks.
    refetchInterval: 30 * 1000,
  });
  return { ...query, keyword, page, setKeyword, setPage };
}

/**
 * The recruiter's own companies.
 *
 * Filtered in the browser, deliberately: `/company/get` returns every owned
 * company as a plain unpaginated array, so every row is present and a local
 * filter is honest. The keyword still lives in the URL, so this behaves
 * identically to the jobs list from the user's side.
 */
export function useOwnedCompanies() {
  const { keyword, setKeyword } = useListParams();
  const query = useQuery({
    queryKey: [...WORKSPACE_KEY, "companies"],
    queryFn: async ({ signal }) => {
      const res = await apiClient.get<{ success: boolean; companies: CompanyDto[] }>(
        "/company/get",
        { signal },
      );
      return res.data.companies;
    },
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });

  const needle = keyword.trim().toLowerCase();
  const filtered = needle
    ? (query.data ?? []).filter(
        (c) =>
          c.name.toLowerCase().includes(needle) ||
          (c.location ?? "").toLowerCase().includes(needle),
      )
    : (query.data ?? []);

  return { ...query, keyword, setKeyword, filtered };
}

export function useCompany(id: string | undefined) {
  return useQuery({
    queryKey: [...WORKSPACE_KEY, "company", id],
    queryFn: async ({ signal }) => {
      const res = await apiClient.get<{ success: boolean; company: CompanyDto }>(
        `/company/get/${id}`,
        { signal },
      );
      return res.data.company;
    },
    enabled: Boolean(id),
  });
}

export function useApplicants(jobId: string | undefined) {
  const { page, setPage } = useListParams();
  const qs = listQueryString("", page);
  const query = useQuery({
    queryKey: [...WORKSPACE_KEY, "applicants", jobId, qs],
    queryFn: async ({ signal }) => {
      const res = await apiClient.get<{ success: boolean } & ApplicantsPageDto>(
        `/application/${jobId}/applicants?${qs}`,
        { signal },
      );
      return res.data;
    },
    enabled: Boolean(jobId),
    placeholderData: keepPreviousData,
    // The one workspace list a candidate can change without the recruiter doing
    // anything: a new application appears here and nowhere else in the UI.
    // `staleTime` is the client default of 30s, so the interval matches it.
    refetchInterval: 30 * 1000,
  });
  return { ...query, page, setPage };
}

/**
 * The cross-job queue (Project D): every application on every owned job.
 *
 * Same 30s refetch cadence as the per-job list and for the same reason — new
 * applications arrive here too — and a separate key so the two lists
 * invalidate independently.
 */
export function useApplicationQueue() {
  const { page, setPage } = useListParams();
  const qs = listQueryString("", page);
  const query = useQuery({
    queryKey: [...WORKSPACE_KEY, "queue", qs],
    queryFn: async ({ signal }) => {
      const res = await apiClient.get<{ success: boolean } & PaginatedResponse<QueuedApplicantDto>>(
        `/application/queue?${qs}`,
        { signal },
      );
      return res.data;
    },
    placeholderData: keepPreviousData,
    refetchInterval: 30 * 1000,
  });
  return { ...query, page, setPage };
}

/**
 * One posted job, for the edit form.
 *
 * Reads the public detail route rather than a new owner-scoped one: the DTO
 * already carries every field the form edits, and a second read path would be a
 * second place for the shape to drift. Ownership is enforced where it matters —
 * on the write, which answers 404 for a job the caller does not own.
 */
export function useJob(id: string | undefined) {
  return useQuery({
    queryKey: [...WORKSPACE_KEY, "job", id],
    queryFn: async ({ signal }) => {
      const res = await apiClient.get<{ success: boolean; job: JobDto }>(`/job/get/${id}`, {
        signal,
      });
      return res.data.job;
    },
    enabled: Boolean(id),
  });
}

export function useJobCreate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiClient.post<{ success: boolean; job: JobDto }>("/job/post", body);
      return res.data.job;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...WORKSPACE_KEY, "jobs"] });
    },
  });
}

export function useJobUpdate(id: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiClient.put<{ success: boolean; job: JobDto }>(
        `/job/update/${id}`,
        body,
      );
      return res.data.job;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...WORKSPACE_KEY, "jobs"] });
      void queryClient.invalidateQueries({ queryKey: [...WORKSPACE_KEY, "job", id] });
    },
  });
}

/**
 * Close a filled role, or reopen one.
 *
 * Invalidates the seeker-facing job queries too, because this is the one
 * workspace mutation whose effect is visible outside the workspace: a closed
 * role leaves the public board, and a cached board would go on offering it.
 */
export function useJobStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (change: { jobId: string; status: JobStatus }) => {
      const res = await apiClient.post<{ success: boolean; job: JobDto }>(
        `/job/status/${change.jobId}/update`,
        { status: change.status },
      );
      return res.data.job;
    },
    onSuccess: (_job, change) => {
      void queryClient.invalidateQueries({ queryKey: [...WORKSPACE_KEY, "jobs"] });
      void queryClient.invalidateQueries({ queryKey: [...WORKSPACE_KEY, "job", change.jobId] });
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}

/** Only ever succeeds for a posting nobody applied to; the API refuses the rest. */
export function useJobDelete() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string) => {
      await apiClient.delete(`/job/delete/${jobId}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...WORKSPACE_KEY, "jobs"] });
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}

export function useCompanyCreate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { name: string }) => {
      const res = await apiClient.post<{ success: boolean; company: CompanyDto }>(
        "/company/register",
        body,
      );
      return res.data.company;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...WORKSPACE_KEY, "companies"] });
    },
  });
}

export function useCompanyUpdate(id: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (formData: FormData) => {
      await apiClient.put(`/company/update/${id}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...WORKSPACE_KEY, "companies"] });
      void queryClient.invalidateQueries({ queryKey: [...WORKSPACE_KEY, "company", id] });
    },
  });
}

/**
 * Accept or reject an applicant.
 *
 * The invalidation is the fix for the stale-row bug: the inherited table POSTed
 * the status, toasted success, and never refetched, so the row kept its old
 * status until a manual reload. It falls out of using the pattern rather than
 * being a separate repair.
 */
export function useApplicantDecision(jobId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (decision: {
      applicationId: string;
      // The recruiter-settable subset, not every ApplicationStatus: `applied` is
      // the creation default and `withdrawn` is the candidate's alone, and the
      // API's schema refuses both.
      status: (typeof RECRUITER_SETTABLE)[number];
    }) => {
      await apiClient.post(`/application/status/${decision.applicationId}/update`, {
        status: decision.status,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [...WORKSPACE_KEY, "applicants", jobId],
      });
      // The cross-job queue shows the same rows; a decision made from either
      // screen must refresh both.
      void queryClient.invalidateQueries({
        queryKey: [...WORKSPACE_KEY, "queue"],
      });
    },
  });
}
