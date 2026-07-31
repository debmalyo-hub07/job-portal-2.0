import { useEffect } from "react";
import { useParams } from "react-router-dom";
import type { LegacyJob } from "@jobportal/shared";

import Navbar from "../shared/Navbar";
import ApplicantsTable from "./ApplicantsTable";
import { apiClient } from "@/lib/apiClient";
import { setAllApplicants } from "@/redux/applicationSlice";
import { useAppDispatch, useAppSelector } from "@/redux/store";

const Applicants = () => {
  const params = useParams();
  const dispatch = useAppDispatch();
  const { applicants } = useAppSelector((state) => state.application);

  useEffect(() => {
    if (!params.id) return;

    const fetchAllApplicants = async () => {
      try {
        const res = await apiClient.get<{ success: boolean; job: LegacyJob }>(
          `/application/${params.id}/applicants`,
        );
        // The endpoint returns the job with its applications populated; the
        // slice stores the application list, not the job.
        dispatch(setAllApplicants(res.data.job.applications ?? []));
      } catch (error) {
        console.error(error);
      }
    };
    void fetchAllApplicants();
  }, [params.id, dispatch]);

  return (
    <div>
      <Navbar />
      <div className="max-w-7xl mx-auto">
        <h1 className="font-bold text-xl my-5">Applicants {applicants.length}</h1>
        <ApplicantsTable />
      </div>
    </div>
  );
};

export default Applicants;
