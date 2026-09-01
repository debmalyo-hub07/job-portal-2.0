import { useQuery } from "@tanstack/react-query";
import type { FlagsResponse } from "@jobportal/shared";

import { apiClient } from "@/lib/apiClient";

/**
 * The public flag read — flags are not a secret, and the client branches UI
 * on the same resolution the server acts on. Never used to gate anything the
 * server does not independently enforce.
 */
export function useFlags() {
  return useQuery({
    queryKey: ["flags"],
    queryFn: async () => {
      const res = await apiClient.get<{ success: boolean } & FlagsResponse>("/flags");
      return res.data.flags;
    },
    staleTime: 30_000,
  });
}
