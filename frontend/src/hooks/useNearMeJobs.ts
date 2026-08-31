import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import type { DistanceBand, NearMeJobDto, PaginatedResponse } from "@jobportal/shared";

import { apiClient } from "@/lib/apiClient";
import { useAppSelector } from "@/redux/store";
import { useDeviceLocation } from "@/hooks/useDeviceLocation";

type NearMeResponse = { success: boolean } & PaginatedResponse<NearMeJobDto>;

export type NearMeState = "signed-out" | "loading" | "ready" | "no-location" | "error";

/**
 * P4 of the location-aware phase: the seeker's area-ranked board.
 *
 * The query runs only for a signed-in seeker — the rail is invisible to
 * everyone else. A 400 with `NEAR_ME_NO_LOCATION` is a *state*, not an error:
 * it is the board's cue to offer the one-time location consent prompt, and
 * `saveLocation` is the prompt's happy path — consent, reverse lookup, save,
 * and the invalidated query re-ranks on the spot.
 */
export function useNearMeJobs() {
  const isSeeker = useAppSelector((state) => state.auth.user?.portal === "seeker");
  const queryClient = useQueryClient();
  const geo = useDeviceLocation();
  const [saving, setSaving] = useState(false);

  const query = useQuery({
    queryKey: ["job", "near-me"],
    queryFn: async ({ signal }) => {
      const res = await apiClient.get<NearMeResponse>("/job/near-me", { signal });
      return res.data;
    },
    enabled: isSeeker,
    staleTime: 60_000,
  });

  const noLocation =
    query.error &&
    (query.error as { response?: { data?: { code?: string } } }).response?.data?.code ===
      "NEAR_ME_NO_LOCATION";

  // The consent prompt's save path: consent → reverse lookup → profile write →
  // the near-me query refetches and the rail appears with ranked rows.
  useEffect(() => {
    if (geo.state !== "granted" || !geo.city || !geo.country) return;
    let cancelled = false;
    setSaving(true);
    const form = new FormData();
    form.set("geoLocation", JSON.stringify({ city: geo.city, country: geo.country }));
    apiClient
      .post("/user/profile/update", form)
      .catch(() => {
        /* The rail stays on its prompt; the profile page is the recovery path. */
      })
      .finally(() => {
        if (!cancelled) {
          setSaving(false);
          void queryClient.invalidateQueries({ queryKey: ["job", "near-me"] });
        }
      });
    return () => {
      cancelled = true;
    };
    // The granted state carries the city and country; the save runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.state, geo.city, geo.country]);

  const saveLocation = useCallback(() => geo.locate(), [geo]);

  const state: NearMeState = !isSeeker
    ? "signed-out"
    : query.isPending
      ? "loading"
      : noLocation
        ? "no-location"
        : query.isError
          ? "error"
          : "ready";

  return {
    state,
    items: query.data?.items ?? [],
    saving,
    locate: saveLocation,
    locating: geo.state === "locating",
  };
}
