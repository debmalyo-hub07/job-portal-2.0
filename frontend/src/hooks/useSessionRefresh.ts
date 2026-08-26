import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Portal, SessionUser } from "@jobportal/shared";

import { apiClient } from "@/lib/apiClient";
import { setPortalSession } from "@/redux/authSlice";
import { useAppDispatch } from "@/redux/store";

/**
 * Re-asks `/me` on an interval and writes the answer back into Redux.
 *
 * `useAuthBootstrap` resolves the session once, at startup, and every route
 * guard reads the result out of the store. That is correct for identity — it
 * does not change under you — but wrong for `status`, which an admin flips from
 * another session entirely. A recruiter approved while looking at the gate has
 * no way to learn it: the screen promises an email and then contradicts itself
 * until a hard reload nobody prompts.
 *
 * Deliberately NOT folded into `useAuthBootstrap`. That hook owns the one-time
 * handshake whose `bootstrapped` flag gates every protected route, and it
 * already carries a comment about how re-entering its effect "can leave
 * protected routes permanently empty". A recurring concern belongs beside the
 * screen that needs it, gated on the one state where the answer can change.
 *
 * Failure is silent by design. A transient network blip must not sign anyone
 * out; a genuinely dead session is already handled by the apiClient interceptor,
 * which refreshes on 401 and calls the session-lost handler when that fails.
 *
 * `refetchInterval` does not fire while the tab is hidden — TanStack's
 * `refetchIntervalInBackground` defaults to false — so a forgotten tab costs
 * nothing.
 */
export function useSessionRefresh(
  portal: Portal,
  { enabled, intervalMs = 60_000 }: { enabled: boolean; intervalMs?: number },
): void {
  const dispatch = useAppDispatch();

  const { data } = useQuery({
    queryKey: ["session", portal],
    queryFn: async ({ signal }) => {
      const res = await apiClient.get<{ success: true; user: SessionUser }>(
        `/${portal}/auth/me`,
        { signal },
      );
      return res.data.user;
    },
    enabled,
    refetchInterval: intervalMs,
    // The point of the poll. Without this the first answer is cached and every
    // later tick is served from it, so the status never moves.
    staleTime: 0,
    // One retry, then wait for the next tick rather than hammering a server
    // that is already unhappy.
    retry: 1,
  });

  useEffect(() => {
    // v5 has no onSuccess on useQuery; the write happens on the value instead.
    // `setPortalSession` is the same action bootstrap uses, so a poll and a
    // reload converge on identical state.
    if (data) dispatch(setPortalSession({ portal, user: data }));
  }, [data, dispatch, portal]);
}
