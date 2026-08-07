import { useEffect, useState } from "react";
import { useParams } from "react-router";
import type { ApplicantDto, PaginatedResponse } from "@jobportal/shared";

import Navbar from "../shared/Navbar";
import ApplicantsTable from "./ApplicantsTable";
import { apiClient } from "@/lib/apiClient";
import { setAllApplicants } from "@/redux/applicationSlice";
import { useAppDispatch, useAppSelector } from "@/redux/store";

const Applicants = () => {
  const params = useParams();
  const dispatch = useAppDispatch();
  const { applicants } = useAppSelector((state) => state.application);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!params.id) return;

    const fetchAllApplicants = async () => {
      try {
        const res = await apiClient.get<
          { success: boolean } & PaginatedResponse<ApplicantDto>
        >(`/application/${params.id}/applicants`, { params: { limit: 50 } });
        dispatch(setAllApplicants(res.data.items));
        // The header counts every applicant, not just the page on screen.
        setTotal(res.data.total);
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
        <h1 className="font-bold text-xl my-5">Applicants {total || applicants.length}</h1>
        <ApplicantsTable />
      </div>
    </div>
  );
};

export default Applicants;
