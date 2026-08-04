import { useEffect } from "react";
import type { AppliedJobDto, PaginatedResponse } from "@jobportal/shared";
import { apiClient } from "@/lib/apiClient";
import { setAllAppliedJobs } from "@/redux/jobSlice";
import { useAppDispatch } from "@/redux/store";

const useGetAppliedJobs = () => {
  const dispatch = useAppDispatch();

  useEffect(() => {
    const fetchAppliedJobs = async () => {
      try {
        const res = await apiClient.get<{ success: boolean } & PaginatedResponse<AppliedJobDto>>(
          "/application/get",
          { params: { limit: 50 } },
        );
        if (res.data.success) {
          dispatch(setAllAppliedJobs(res.data.items));
        }
      } catch (error) {
        console.error(error);
      }
    };
    void fetchAppliedJobs();
  }, [dispatch]);
};

export default useGetAppliedJobs;
