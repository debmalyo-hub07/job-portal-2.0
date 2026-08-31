import { useState } from "react";
import { Link } from "react-router";
import { MapPin, X } from "lucide-react";
import type { DistanceBand } from "@jobportal/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useNearMeJobs } from "@/hooks/useNearMeJobs";

/**
 * The "Near you" rail — P4 of the location-aware phase. Leads the board for a
 * signed-in seeker with a stored area; offers the one-time location consent
 * prompt to a seeker without one; invisible to everyone else.
 *
 * Band labels are seeker-relative on purpose ("Your city", not "In Bengaluru"):
 * the band describes the seeker's relation to the role, and naming the job's
 * city would mislabel a same-region role as near when it is merely regional.
 */
const BAND_LABEL: Record<DistanceBand, string> = {
  same_city: "Your city",
  same_region: "Your region",
  remote: "Remote",
  elsewhere: "Further afield",
};

const PROMPT_DISMISSED_KEY = "near-me-prompt-dismissed";

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(PROMPT_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function NearYouRail() {
  const { state, items, saving, locate, locating } = useNearMeJobs();
  const [dismissed, setDismissed] = useState(readDismissed);

  if (state === "signed-out" || state === "error") return null;

  if (state === "loading") {
    return (
      <section aria-label="Roles near you" className="mb-6 space-y-2">
        <Skeleton className="h-4 w-32 rounded-surface" />
        <Skeleton className="h-16 rounded-surface" />
        <Skeleton className="h-16 rounded-surface" />
      </section>
    );
  }

  if (state === "no-location") {
    if (dismissed) return null;
    return (
      <section
        aria-label="Find roles near you"
        data-testid="near-you-prompt"
        className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-surface border border-line bg-paper-raised px-4 py-3.5"
      >
        <div className="flex min-w-0 items-center gap-3">
          <MapPin aria-hidden="true" className="size-4 shrink-0 text-signal-text" />
          <p className="text-sm text-ink-muted">
            See roles near you first — share your area once, and only the city is kept.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="signal" size="sm" onClick={locate} disabled={locating || saving}>
            {locating ? "Locating…" : saving ? "Saving…" : "Use my location"}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Dismiss"
            onClick={() => {
              try {
                window.localStorage.setItem(PROMPT_DISMISSED_KEY, "1");
              } catch {
                /* Refused storage: dismissal lasts this visit only. */
              }
              setDismissed(true);
            }}
          >
            <X aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </section>
    );
  }

  if (items.length === 0) return null;

  return (
    <section aria-label="Roles near you" data-testid="near-you-rail" className="mb-6">
      <p className="mb-2 text-xs font-semibold uppercase text-signal-text">Near you</p>
      <ul className="divide-y divide-line rounded-surface border border-line bg-paper-raised">
        {items.slice(0, 5).map((job) => (
          <li key={job.id}>
            <Link
              to={`/description/${job.id}`}
              className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-paper"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ink">{job.title}</span>
                <span className="block truncate text-xs text-ink-muted">
                  {job.company?.name ?? "Independent team"} · {job.location}
                </span>
              </span>
              <Badge variant="outline" className="shrink-0">
                {BAND_LABEL[job.band]}
              </Badge>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default NearYouRail;
