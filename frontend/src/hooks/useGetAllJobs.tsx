import { useEffect } from "react";
import type { LegacyJob } from "@jobportal/shared";
import { apiClient } from "@/lib/apiClient";
import { setAllJobs } from "@/redux/jobSlice";
import { useAppDispatch, useAppSelector } from "@/redux/store";

const useGetAllJobs = () => {
  const dispatch = useAppDispatch();
  const { searchedQuery } = useAppSelector((state) => state.job);

  useEffect(() => {
    const fetchAllJobs = async () => {
      try {
        const res = await apiClient.get<{ success: boolean; jobs: LegacyJob[] }>("/job/get", {
          params: { keyword: searchedQuery },
        });
        if (res.data.success) {
          dispatch(setAllJobs(res.data.jobs));
        }
      } catch (error) {
        console.error(error);
      }
    };
    void fetchAllJobs();
    // searchedQuery was previously missing from this list, so changing the
    // search term never triggered a refetch.
  }, [dispatch, searchedQuery]);
};

export default useGetAllJobs;
