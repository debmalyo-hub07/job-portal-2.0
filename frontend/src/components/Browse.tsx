import { useEffect } from "react";
import Navbar from "./shared/Navbar";
import Job from "./Job";
import useGetAllJobs from "@/hooks/useGetAllJobs";
import { setSearchedQuery } from "@/redux/jobSlice";
import { useAppDispatch, useAppSelector } from "@/redux/store";

const Browse = () => {
  useGetAllJobs();
  const { allJobs } = useAppSelector((state) => state.job);
  const dispatch = useAppDispatch();

  useEffect(() => {
    return () => {
      dispatch(setSearchedQuery(""));
    };
  }, [dispatch]);

  return (
    <div>
      <Navbar />
      <div className="max-w-7xl mx-auto my-10">
        <h1 className="font-bold text-xl my-10">Search Results ({allJobs.length})</h1>
        <div className="grid grid-cols-3 gap-4">
          {allJobs.map((job) => (
            <Job key={job.id} job={job} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default Browse;
