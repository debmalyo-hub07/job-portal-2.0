import { useEffect } from "react";
import type { JobDto, PaginatedResponse } from "@jobportal/shared";
import { apiClient } from "@/lib/apiClient";
import { setAllAdminJobs } from "@/redux/jobSlice";
import { useAppDispatch } from "@/redux/store";

const useGetAllAdminJobs = () => {
  const dispatch = useAppDispatch();

  useEffect(() => {
    const fetchAllAdminJobs = async () => {
      try {
        const res = await apiClient.get<{ success: boolean } & PaginatedResponse<JobDto>>(
          "/job/getadminjobs",
          { params: { limit: 50 } },
        );
        if (res.data.success) {
          dispatch(setAllAdminJobs(res.data.items));
        }
      } catch (error) {
        console.error(error);
      }
    };
    void fetchAllAdminJobs();
  }, [dispatch]);
};

export default useGetAllAdminJobs;
