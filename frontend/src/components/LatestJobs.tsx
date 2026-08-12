import { Briefcase } from "lucide-react";

import LatestJobCards from "./LatestJobCards";
import { EmptyState } from "./layout/EmptyState";
import { Reveal } from "@/lib/motion";
import { useAppSelector } from "@/redux/store";

const LatestJobs = () => {
  const { allJobs } = useAppSelector((state) => state.job);
  // At most two full rows of the 3-column grid, so the landing page stays a
  // fixed height as the job count grows. Carried over from the inherited
  // component, which capped at the same six.
  const jobs = allJobs.slice(0, 6);

  return (
    <section className="pb-(--space-section)">
      <Reveal>
        <h2 className="font-display text-display-md font-bold text-ink">
          Latest <span className="text-signal-text">openings</span>
        </h2>
      </Reveal>

      {jobs.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={Briefcase}
            title="No openings right now"
            description="New roles are posted regularly. Check back soon."
          />
        </div>
      ) : (
        /*
          `Reveal` per card rather than the `StaggerList` that was here. This
          section is the second screen of the landing page, so the stagger fired
          on mount and was over before the reader arrived — the choreography was
          real and nobody ever saw it. The delay is capped by row rather than
          growing with the index: six cards at 0.06s each would leave the last one
          waiting a third of a second after the first, which reads as slow rather
          than as sequence.
        */
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job, i) => (
            <Reveal key={job.id} delay={(i % 3) * 0.06} className="h-full">
              <LatestJobCards job={job} />
            </Reveal>
          ))}
        </div>
      )}
    </section>
  );
};

export default LatestJobs;
