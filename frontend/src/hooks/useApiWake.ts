import { useEffect } from "react";

import { apiClient } from "@/lib/apiClient";

/** One wake attempt every 12s: long enough to outlast a proxy timeout, short enough that a second attempt lands while a 30–60s boot is still running. */
const WAKE_INTERVAL_MS = 12_000;
/** Stop after 5 minutes — beyond that the boot either finished or the host is having an incident no retry fixes. */
const WAKE_MAX_ATTEMPTS = 25;

/**
 * Starts waking a sleeping API instance the moment a sign-in page is VIEWED,
 * and keeps nudging until it answers, so the click that submits rarely pays
 * the cold start.
 *
 * The API's free-tier host sleeps after inactivity, and the first request after
 * an idle period takes 30–60 seconds — long enough to read as a hang or, before
 * the fetched Google start, to paint the host's page instead of ours. The wake
 * targets `/health`, which the API also mounts under `/api/v1/health` precisely
 * so it is reachable through the same-origin proxy the browser talks to (the
 * host's own health check stays on the bare `/health` at the root).
 *
 * ONE attempt is not enough, measured in production: the proxy function gives
 * up on a request to a sleeping instance well before the boot completes, and a
 * request that errors out does NOT stop the boot — but it also does not repeat
 * itself. A visitor who arrived at the sleeping instance then hit "network
 * error" on every subsequent request until the boot finished on its own. So the
 * wake retries on an interval until the API answers, which is the point at
 * which the boot has finished: retrying after that wastes nothing, because the
 * successful response ends the loop, and the instance stays awake on its own
 * once real traffic reaches it.
 *
 * The response BODY is never read, only that it arrived as a 2xx — anything
 * else (a 5xx from the proxy while the API restarts, a network error from a
 * request the proxy gave up on) counts as "not up yet" and schedules the next
 * knock, because every one of those outcomes can still be sitting on top of a
 * boot in progress. Failures are swallowed individually, and there is no
 * backoff: the failure mode of spacing attempts out is the person clicking
 * before the loop finishes.
 *
 * Called once per mount of a page that leads to a session-creating request:
 * the login and signup screens. Not on public pages — waking an instance for
 * every anonymous browse would keep it awake with traffic that needs no API
 * beyond the public job board, which already wakes it with real work.
 */
export function useApiWake(): void {
  useEffect(() => {
    let attempts = 0;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function ping(): Promise<void> {
      if (cancelled || attempts >= WAKE_MAX_ATTEMPTS) return;
      attempts += 1;
      try {
        // Axios resolves only on 2xx by default, which is the whole test: a
        // 502/504 from the proxy over a restarting API is an answer that does
        // NOT mean up, and must schedule the next knock like a network error.
        await apiClient.get("/health");
        return; // 2xx: the API answered — boot complete.
      } catch {
        // Not up (yet). The failed attempt may itself have nudged the boot.
      }
      if (cancelled) return;
      timer = setTimeout(ping, WAKE_INTERVAL_MS);
    }

    void ping();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);
}
