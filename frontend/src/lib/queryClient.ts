import { QueryClient } from "@tanstack/react-query";

/**
 * Single QueryClient for server-state. `staleTime` is short-but-not-zero so a
 * facet toggle hits the cache when the user flips it off-and-on quickly, while
 * a real filter change always refetches. The job board is the only consumer
 * today; other hooks migrate as their surfaces land in 4C/4D.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});