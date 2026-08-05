import LatestJobCards from "./LatestJobCards";
import { useAppSelector } from "@/redux/store";

const LatestJobs = () => {
  const { allJobs } = useAppSelector((state) => state.job);

  return (
    <div className="max-w-7xl mx-auto my-20">
      <h1 className="text-4xl font-bold">
        <span className="text-signal-text">Latest &amp; Top</span> Job Openings
      </h1>
      <div className="grid grid-cols-3 gap-4 my-5">
        {allJobs.length <= 0 ? (
          <span>No Job Available</span>
        ) : (
          allJobs.slice(0, 6).map((job) => <LatestJobCards key={job.id} job={job} />)
        )}
      </div>
    </div>
  );
};

export default LatestJobs;
