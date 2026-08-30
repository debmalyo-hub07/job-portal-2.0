import { useEffect } from "react";

import { apiClient } from "@/lib/apiClient";

/**
 * Starts waking a sleeping API instance the moment a sign-in page is VIEWED,
 * so the click that submits rarely pays the cold start.
 *
 * The API's free-tier host sleeps after inactivity, and the first request after
 * an idle period takes 30–60 seconds — long enough to read as a hang or, before
 * the fetched Google start, to paint the host's page instead of ours. The wake
 * targets `/health`, which the API also mounts under `/api/v1/health` precisely
 * so it is reachable through the same-origin proxy the browser talks to (the
 * host's own health check stays on the bare `/health` at the root).
 *
 * Fire-and-forget by design. The response is not read, failures are swallowed,
 * and no loading state is derived from it: a request that never answers can
 * still have started the boot, which is the entire point. A user whose click
 * beats the wake simply waits inside the button's pending state instead of on
 * the host's blank page.
 *
 * Called once per mount of a page that leads to a session-creating request:
 * the login and signup screens. Not on public pages — waking an instance for
 * every anonymous browse would keep it awake with traffic that needs no API
 * beyond the public job board, which already wakes it with real work.
 */
export function useApiWake(): void {
  useEffect(() => {
    apiClient.get("/health").catch(() => {
      // Deliberately ignored — see the docblock. A rejected wake says nothing
      // about the API's health; the request itself did the waking.
    });
  }, []);
}
