import { useEffect } from "react";
import type { LegacyJob } from "@jobportal/shared";
import { apiClient } from "@/lib/apiClient";
import { setAllAdminJobs } from "@/redux/jobSlice";
import { useAppDispatch } from "@/redux/store";

const useGetAllAdminJobs = () => {
  const dispatch = useAppDispatch();

  useEffect(() => {
    const fetchAllAdminJobs = async () => {
      try {
        const res = await apiClient.get<{ success: boolean; jobs: LegacyJob[] }>(
          "/job/getadminjobs",
        );
        if (res.data.success) {
          dispatch(setAllAdminJobs(res.data.jobs));
        }
      } catch (error) {
        console.error(error);
      }
    };
    void fetchAllAdminJobs();
  }, [dispatch]);
};

export default useGetAllAdminJobs;
