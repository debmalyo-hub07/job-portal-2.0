import { useMemo } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import {
  jobListQuerySchema,
  type JobDto,
  type PaginatedResponse,
} from "@jobportal/shared";

import { apiClient } from "@/lib/apiClient";

/**
 * 4B client-side contract for the jobs board.
 *
 * `useSearchParams` is the single source of truth for filters. A filter click
 * writes to the URL; this hook reads it, parses it (to a shape the shared zod
 * schema accepts), builds a react-query key, and fetches. The URL IS the state —
 * back/forward/refresh and shareable links all work because nothing else is
 * authoritative.
 *
 * OR within a facet (two Locations checked → `location=A,B`), AND across
 * facets (Location AND JobType). The backend's `jobListQuerySchema` does the
 * string→set parsing; we just forward the raw query string.
 */
/**
 * One page of results, matching the API's pagination envelope exactly.
 *
 * `pages` is the field the server sends (`PaginatedResponse` in
 * `packages/shared`) — not `totalPages`, and there is no `limit` on the
 * response. Declaring fields the server never sends would hand a pagination UI
 * `undefined` at runtime while typechecking clean, so this mirrors the shared
 * type rather than restating it loosely.
 */
export type JobSearchPage = PaginatedResponse<JobDto>;

/**
 * Job-board query, already shaped for the `jobListQuerySchema` wire format.
 * Optional fields are absent (not `undefined`) so the key stays JSON-stable.
 */
export interface JobSearchQuery {
  keyword: string;
  location: string[];
  jobType: string[];
  salaryMax?: number;
  experienceMax?: number;
  remote?: boolean;
  page: number;
  limit: number;
}

/** Splits a comma-joined facet value into a clean, order-stable array. */
function splitFacet(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Reads the current URLSearchParams into the 4B query shape. */
export function parseJobSearchParams(sp: URLSearchParams): JobSearchQuery {
  const salary = sp.get("salaryMax");
  const experience = sp.get("experienceMax");
  const remote = sp.get("remote");
  const parsed = jobListQuerySchema.safeParse({
    keyword: sp.get("keyword") ?? "",
    location: sp.get("location") ?? "",
    jobType: sp.get("jobType") ?? "",
    ...(salary ? { salaryMax: Number(salary) } : {}),
    ...(experience ? { experienceMax: Number(experience) } : {}),
    ...(remote ? { remote } : {}),
    page: sp.get("page") ? Number(sp.get("page")) : undefined,
    limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
  });
  // safeParse, not parse: the URL is user-controlled. A malformed value just
  // falls back to the unfiltered list rather than throwing a teal screen.
  const q = parsed.success ? parsed.data : { keyword: "", location: "", jobType: "", page: 1, limit: 20 };
  return {
    keyword: q.keyword,
    location: splitFacet(q.location),
    jobType: splitFacet(q.jobType),
    ...(q.salaryMax !== undefined ? { salaryMax: q.salaryMax } : {}),
    ...(q.experienceMax !== undefined ? { experienceMax: q.experienceMax } : {}),
    ...(q.remote !== undefined ? { remote: q.remote } : {}),
    page: q.page,
    limit: q.limit,
  };
}

/** Rebuilds the query string the backend expects from a JobSearchQuery. */
export function toSearchParams(q: JobSearchQuery): URLSearchParams {
  const sp = new URLSearchParams();
  if (q.keyword) sp.set("keyword", q.keyword);
  if (q.location.length > 0) sp.set("location", q.location.join(","));
  if (q.jobType.length > 0) sp.set("jobType", q.jobType.join(","));
  if (q.salaryMax !== undefined) sp.set("salaryMax", String(q.salaryMax));
  if (q.experienceMax !== undefined) sp.set("experienceMax", String(q.experienceMax));
  if (q.remote) sp.set("remote", "true");
  if (q.page !== 1) sp.set("page", String(q.page));
  if (q.limit !== 20) sp.set("limit", String(q.limit));
  return sp;
}

async function fetchJobs(q: JobSearchQuery, signal: AbortSignal): Promise<JobSearchPage> {
  const params = toSearchParams(q);
  const response = await apiClient.get<JobSearchPage>(`/job/get?${params}`, { signal });
  return response.data;
}

/**
 * Hook: URL-driven faceted job search.
 *
 * Every input comes from the URL, so a facet toggle that changes the URL is
 * enough to refetch. `keepPreviousData` keeps the previous page on screen
 * while the next resolves — no jitter between keystrokes.
 */
export function useJobSearch() {
  const [searchParams] = useSearchParams();
  const query = useMemo(() => parseJobSearchParams(searchParams), [searchParams]);
  // Stable scalar for the key: URLSearchParams object identity changes per render.
  const paramsString = useMemo(() => toSearchParams(query).toString(), [query]);
  return useQuery({
    queryKey: ["jobs", paramsString],
    queryFn: ({ signal }) => fetchJobs(query, signal),
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
}

/** Toggles a facet value in the URL; the query refetches on the next render. */
export function useFacetToggle() {
  const [searchParams, setSearchParams] = useSearchParams();
  return (facet: "location" | "jobType", value: string) => {
    const sp = new URLSearchParams(searchParams);
    const current = new Set(splitFacet(sp.get(facet)));
    if (current.has(value)) {
      current.delete(value);
    } else {
      current.add(value);
    }
    if (current.size > 0) {
      sp.set(facet, [...current].join(","));
    } else {
      sp.delete(facet);
    }
    // A filter change invalidates the page — return to page 1 so the user never
    // lands on "page 5 of 2".
    sp.delete("page");
    setSearchParams(sp, { replace: false });
  };
}