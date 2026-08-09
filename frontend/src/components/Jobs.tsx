import { motion } from "motion/react";

import Navbar from "./shared/Navbar";
import FilterCard from "./FilterCard";
import Job from "./Job";
import { useJobSearch } from "@/hooks/useJobSearch";
import { Skeleton } from "./ui/skeleton";

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
      <div className="max-w-7xl mx-auto mt-5">
        <div className="flex gap-5">
          <div className="w-[20%]">
            <FilterCard />
          </div>
          <div className="flex-1 h-[88vh] overflow-y-auto pb-5">
            {isPending ? (
              <div className="grid grid-cols-3 gap-4">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-48 rounded-md" />
                ))}
              </div>
            ) : isError ? (
              <div className="text-red-600 text-sm p-4">
                Could not load jobs: {error instanceof Error ? error.message : "unknown error"}
              </div>
            ) : jobs.length === 0 ? (
              <span>No jobs match these filters.</span>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                {jobs.map((job) => (
                  <motion.div
                    initial={{ opacity: 0, x: 100 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -100 }}
                    transition={{ duration: 0.3 }}
                    key={job.id}
                  >
                    <Job job={job} />
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Jobs;
