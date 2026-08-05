import { Briefcase } from "lucide-react";

import LatestJobCards from "./LatestJobCards";
import { EmptyState } from "./layout/EmptyState";
import { StaggerItem, StaggerList } from "@/lib/motion";
import { useAppSelector } from "@/redux/store";

const LatestJobs = () => {
  const { allJobs } = useAppSelector((state) => state.job);
  // At most two full rows of the 3-column grid, so the landing page stays a
  // fixed height as the job count grows. Carried over from the inherited
  // component, which capped at the same six.
  const jobs = allJobs.slice(0, 6);

  return (
    <section className="pb-(--space-section)">
      <h2 className="font-display text-display-md font-bold text-ink">
        Latest <span className="text-signal-text">openings</span>
      </h2>

      {jobs.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={Briefcase}
            title="No openings right now"
            description="New roles are posted regularly. Check back soon."
          />
        </div>
      ) : (
        <StaggerList className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job) => (
            <StaggerItem key={job.id} className="h-full">
              <LatestJobCards job={job} />
            </StaggerItem>
          ))}
        </StaggerList>
      )}
    </section>
  );
};

export default LatestJobs;
