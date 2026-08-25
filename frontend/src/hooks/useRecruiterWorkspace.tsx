import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import type { ApplicantDto, CompanyDto, JobDto, PaginatedResponse } from "@jobportal/shared";
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
      const res = await apiClient.get<{ success: boolean } & PaginatedResponse<ApplicantDto>>(
        `/application/${jobId}/applicants?${qs}`,
        { signal },
      );
      return res.data;
    },
    enabled: Boolean(jobId),
    placeholderData: keepPreviousData,
  });
  return { ...query, page, setPage };
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
    },
  });
}
