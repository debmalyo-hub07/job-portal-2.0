import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { LegacyJob } from "@jobportal/shared";

import Navbar from "./shared/Navbar";
import FilterCard from "./FilterCard";
import Job from "./Job";
import { useAppSelector } from "@/redux/store";

const Jobs = () => {
  const { allJobs, searchedQuery } = useAppSelector((state) => state.job);
  const [filterJobs, setFilterJobs] = useState<LegacyJob[]>(allJobs);

  useEffect(() => {
    if (!searchedQuery) {
      setFilterJobs(allJobs);
      return;
    }

    const needle = searchedQuery.toLowerCase();
    const filteredJobs = allJobs.filter(
      (job) =>
        job.title?.toLowerCase().includes(needle) ||
        job.company?.name?.toLowerCase().includes(needle) ||
        job.location?.toLowerCase().includes(needle) ||
        job.position?.toLowerCase().includes(needle) ||
        job.jobType?.toLowerCase().includes(needle) ||
        String(job.salary).includes(needle),
    );
    setFilterJobs(filteredJobs);
  }, [allJobs, searchedQuery]);

  return (
    <div>
      <Navbar />
      <div className="max-w-7xl mx-auto mt-5">
        <div className="flex gap-5">
          <div className="w-[20%]">
            <FilterCard />
          </div>
          {filterJobs.length <= 0 ? (
            <span>No jobs found</span>
          ) : (
            <div className="flex-1 h-[88vh] overflow-y-auto pb-5">
              <div className="grid grid-cols-3 gap-4">
                {filterJobs.map((job) => (
                  <motion.div
                    initial={{ opacity: 0, x: 100 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -100 }}
                    transition={{ duration: 0.3 }}
                    key={job._id}
                  >
                    <Job job={job} />
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Jobs;
