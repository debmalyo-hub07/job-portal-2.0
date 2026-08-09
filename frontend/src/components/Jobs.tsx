import Navbar from "./shared/Navbar";
import FilterCard from "./FilterCard";
import Job from "./Job";
import { useJobSearch } from "@/hooks/useJobSearch";
import { Skeleton } from "./ui/skeleton";
import { StaggerItem, StaggerList } from "@/lib/motion";

/**
 * 4B jobs board.
 *
 * Server state (which jobs match the URL filters) lives in react-query, not
 * Redux. `useJobSearch` reads the URL, derives the query, and returns the
 * current page. Redux `searchedQuery`/`allJobs` stay alive for LatestJobs and
 * Home, but the filter rail on this page is now driven from the URL alone.
 */
const Jobs = () => {
  const { data, isPending, isError, error } = useJobSearch();

  const jobs = data?.items ?? [];

  return (
    <div>
      <Navbar />
      <div className="max-w-7xl mx-auto mt-5 px-4">
        <div className="flex flex-col gap-5 md:flex-row">
          <div className="w-full md:w-[20%] md:shrink-0">
            <FilterCard />
          </div>
          <div className="flex-1 md:h-[88vh] md:overflow-y-auto pb-5">
            {isPending ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-48 rounded-md" />
                ))}
              </div>
            ) : isError ? (
              <div className="text-danger text-sm p-4" role="alert">
                Could not load jobs: {error instanceof Error ? error.message : "unknown error"}
              </div>
            ) : jobs.length === 0 ? (
              <span>No jobs match these filters.</span>
            ) : (
              <StaggerList className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {jobs.map((job) => (
                  <StaggerItem key={job.id}>
                    <Job job={job} />
                  </StaggerItem>
                ))}
              </StaggerList>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Jobs;
