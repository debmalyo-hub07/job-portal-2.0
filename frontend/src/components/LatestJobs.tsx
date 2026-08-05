import { Briefcase } from "lucide-react";

import LatestJobCards from "./LatestJobCards";
import { EmptyState } from "./layout/EmptyState";
import { StaggerItem, StaggerList } from "@/lib/motion";
import { useAppSelector } from "@/redux/store";

const LatestJobs = () => {
  const { allJobs } = useAppSelector((state) => state.job);
  // Six, so the 3-column grid fills two complete rows. The inherited version
  // took whatever arrived and orphaned a lone card beside two empty cells.
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
