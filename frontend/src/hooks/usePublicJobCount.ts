import { useEffect, useState } from "react";
import { apiClient } from "@/lib/apiClient";

/** Below this, a count reads as "nobody is here" and is worse than no number. */
const MIN_DISPLAYABLE = 10;

/**
 * Open-role count for the seeker auth panel.
 *
 * `GET /job/get` is public (`optionalAuthenticate`) and returns `total`, so this
 * needs no session and no new endpoint. Returns `count: null` when the request
 * fails OR when the number is too small to be worth showing — the caller renders
 * its value-proposition copy in both cases, so a fresh install never advertises
 * "0 open roles".
 */
export function usePublicJobCount(): { count: number | null; ready: boolean } {
  const [count, setCount] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<{ success: true; total: number }>("/job/get", { params: { limit: 1 } })
      .then((res) => {
        if (cancelled) return;
        const total = res.data.total;
        setCount(typeof total === "number" && total >= MIN_DISPLAYABLE ? total : null);
      })
      .catch(() => {
        if (!cancelled) setCount(null);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { count, ready };
}
