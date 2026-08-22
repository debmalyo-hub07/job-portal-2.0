import { useQuery } from "@tanstack/react-query";
import type { JobDto, PaginatedResponse } from "@jobportal/shared";

import { apiClient } from "@/lib/apiClient";

/** LatestJobs renders six; the stats tile needs only the envelope's `total`. */
const LANDING_LIMIT = 6;

/**
 * Shared across every consumer, so react-query serves the second one from cache
 * rather than issuing a second identical request.
 */
export const LANDING_JOBS_KEY = ["jobs", "landing"] as const;

/**
 * The landing page's one server read: what has been posted recently, and how
 * many roles exist in total.
 *
 * Not the job board — that is `useJobSearch`, which reads the URL. This asks a
 * question with no inputs. It used to pass the redux `searchedQuery` as
 * `keyword`, which meant a search from the hero box filtered the "Latest
 * openings" section while its heading still said latest. With the board owning
 * search, there is nothing left to filter by.
 *
 * Returns the whole pagination envelope rather than dispatching `items` into
 * redux, for two reasons. `total` was being discarded, so the landing page's
 * stats tile hardcoded a number that went stale the moment the catalogue grew.
 * And `allJobs` was a server read living in a slice while react-query already
 * owned every other one — the same duplication that `searchedQuery` and
 * `allAdminJobs` were removed for.
 */
export function useLandingJobs() {
  return useQuery({
    queryKey: LANDING_JOBS_KEY,
    queryFn: async ({ signal }) => {
      const response = await apiClient.get<{ success: boolean } & PaginatedResponse<JobDto>>(
        "/job/get",
        // Asking for a page rather than the API's cap of 50 keeps the landing
        // payload proportional to what it shows.
        { params: { limit: LANDING_LIMIT }, signal },
      );
      return response.data;
    },
  });
}
