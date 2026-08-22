import { ArrowRight, Briefcase } from "lucide-react";
import { Link } from "react-router";

import LatestJobCards from "./LatestJobCards";
import { EmptyState } from "./layout/EmptyState";
import { Skeleton } from "./ui/skeleton";
import { useLandingJobs } from "@/hooks/useLandingJobs";
import { Reveal } from "@/lib/motion";

const CARD_LAYOUTS = [
  "lg:col-span-7",
  "lg:col-span-5",
  "lg:col-span-4",
  "lg:col-span-8",
  "lg:col-span-6",
  "lg:col-span-6",
] as const;

const LatestJobs = () => {
  const { data, isPending } = useLandingJobs();
  const jobs = data?.items.slice(0, 6) ?? [];

  return (
    <section aria-labelledby="latest-jobs-heading" className="relative border-b border-line bg-paper-sunken/45">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-28">
        <Reveal className="grid gap-8 border-b border-line pb-9 md:grid-cols-[minmax(0,1fr)_minmax(16rem,0.55fr)] md:items-end">
          <div>
            <p className="text-xs font-semibold uppercase text-signal-text">Fresh opportunities</p>
            <h2
              id="latest-jobs-heading"
              className="mt-4 max-w-3xl font-display text-5xl font-semibold leading-none text-ink sm:text-6xl"
            >
              Work worth a closer look.
            </h2>
          </div>
          <div className="md:pb-1">
            <p className="max-w-md text-sm leading-6 text-ink-muted">
              Recently posted roles, selected for a quick read without losing the details that
              matter.
            </p>
            <Link
              to="/jobs"
              className="group mt-5 inline-flex items-center gap-3 text-sm font-semibold text-ink transition-colors hover:text-signal-text focus-visible:rounded-sharp focus-visible:ring-[3px] focus-visible:ring-signal-ring focus-visible:outline-none"
            >
              See the full job board
              <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </Reveal>

        {isPending ? (
          // Not the empty state. `jobs` is empty on the first render of every
          // visit, so branching on its length alone rendered "No openings right
          // now" — a false claim about the marketplace — until the request
          // landed. `isPending` is the only thing that tells the two apart.
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-12 lg:gap-5">
            {CARD_LAYOUTS.map((layout, index) => (
              <div key={index} className={`h-full ${layout}`}>
                <Skeleton className="h-full min-h-80 rounded-surface" />
              </div>
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="mt-10">
            <EmptyState
              icon={Briefcase}
              title="No openings right now"
              description="New roles are posted regularly. Check back soon."
            />
          </div>
        ) : (
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-12 lg:gap-5">
            {jobs.map((job, index) => (
              <Reveal
                key={job.id}
                delay={(index % 2) * 0.08}
                className={`h-full ${CARD_LAYOUTS[index] ?? "lg:col-span-6"}`}
              >
                <LatestJobCards job={job} index={index} featured={index === 0 || index === 3} />
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default LatestJobs;
