import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import type { LegacyJob } from "@jobportal/shared";

import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { apiClient } from "@/lib/apiClient";
import { getApiErrorMessage } from "@/lib/apiError";
import { setSingleJob } from "@/redux/jobSlice";
import { useAppDispatch, useAppSelector } from "@/redux/store";

const JobDescription = () => {
  const { singleJob } = useAppSelector((state) => state.job);
  const { user } = useAppSelector((state) => state.auth);
  const params = useParams();
  const jobId = params.id;
  const dispatch = useAppDispatch();

  const [isApplied, setIsApplied] = useState(false);

  const applyJobHandler = async () => {
    try {
      const res = await apiClient.get<{ success: boolean; message: string }>(
        `/application/apply/${jobId}`,
      );
      if (res.data.success) {
        setIsApplied(true);
        toast.success(res.data.message);
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not apply"));
    }
  };

  useEffect(() => {
    if (!jobId) return;

    const fetchSingleJob = async () => {
      try {
        const res = await apiClient.get<{ success: boolean; job: LegacyJob }>(
          `/job/get/${jobId}`,
        );
        if (res.data.success) {
          dispatch(setSingleJob(res.data.job));
          setIsApplied(
            res.data.job.applications?.some(
              (application) => String(application.applicant) === user?._id,
            ) ?? false,
          );
        }
      } catch (error) {
        console.error(error);
      }
    };
    void fetchSingleJob();
  }, [jobId, dispatch, user?._id]);

  return (
    <div className="max-w-7xl mx-auto my-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-xl">{singleJob?.title}</h1>
          <div className="flex items-center gap-2 mt-4">
            <Badge className={"text-blue-700 font-bold"} variant="ghost">
              {singleJob?.position} Positions
            </Badge>
            <Badge className={"text-[#F83002] font-bold"} variant="ghost">
              {singleJob?.jobType}
            </Badge>
            <Badge className={"text-[#7209b7] font-bold"} variant="ghost">
              {singleJob?.salary}LPA
            </Badge>
          </div>
        </div>
        <Button
          onClick={isApplied ? undefined : applyJobHandler}
          disabled={isApplied}
          className={`rounded-lg ${
            isApplied ? "bg-gray-600 cursor-not-allowed" : "bg-[#7209b7] hover:bg-[#5f32ad]"
          }`}
        >
          {isApplied ? "Applied" : "Apply Now"}
        </Button>
      </div>
      <h1 className="border-b-2 border-b-gray-300 font-medium py-4">Job Description</h1>
      <div className="my-4">
        <h1 className="font-bold my-1">
          Role:
          <span className="pl-0 font-normal text-gray-800">{singleJob?.title}</span>
        </h1>
        <h1 className="font-bold my-1">
          Location:
          <span className="pl-0 font-normal text-gray-800">{singleJob?.location}</span>
        </h1>
        <h1 className="font-bold my-1">
          Description:
          <span className="pl-0 font-normal text-gray-800">{singleJob?.description}</span>
        </h1>
        <h1 className="font-bold my-1">
          Experience:
          <span className="pl-0 font-normal text-gray-800">
            {singleJob?.experienceLevel} years
          </span>
        </h1>
        <h1 className="font-bold my-1">
          Salary:
          <span className="pl-0 font-normal text-gray-800">{singleJob?.salary}LPA</span>
        </h1>
        <h1 className="font-bold my-1">
          Total Applicants:
          <span className="pl-0 font-normal text-gray-800">
            {singleJob?.applications?.length ?? 0}
          </span>
        </h1>
        <h1 className="font-bold my-1">
          Posted Date:
          <span className="pl-0 font-normal text-gray-800">
            {singleJob?.createdAt?.split("T")[0]}
          </span>
        </h1>
      </div>
    </div>
  );
};

export default JobDescription;
