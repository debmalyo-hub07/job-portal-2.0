import { useEffect } from "react";
import type { JobDto, PaginatedResponse } from "@jobportal/shared";
import { apiClient } from "@/lib/apiClient";
import { setAllJobs } from "@/redux/jobSlice";
import { useAppDispatch, useAppSelector } from "@/redux/store";

const useGetAllJobs = () => {
  const dispatch = useAppDispatch();
  const { searchedQuery } = useAppSelector((state) => state.job);

  useEffect(() => {
    const fetchAllJobs = async () => {
      try {
        const res = await apiClient.get<{ success: boolean } & PaginatedResponse<JobDto>>(
          "/job/get",
          // The API caps `limit` at 50. Asking for the cap keeps the board
          // showing what it used to until a real pager lands.
          { params: { keyword: searchedQuery, limit: 50 } },
        );
        if (res.data.success) {
          dispatch(setAllJobs(res.data.items));
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
