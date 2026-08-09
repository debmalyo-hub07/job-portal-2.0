import { useEffect } from "react";
import type { JobDto, PaginatedResponse } from "@jobportal/shared";
import { apiClient } from "@/lib/apiClient";
import { setAllJobs } from "@/redux/jobSlice";
import { useAppDispatch } from "@/redux/store";

/**
 * The landing page's "Latest openings".
 *
 * Not the job board — that is `useJobSearch`, which reads the URL. This asks one
 * question with no inputs: what has been posted recently. It used to pass the
 * redux `searchedQuery` as `keyword`, which meant a search from the hero box
 * filtered the "Latest openings" section while its heading still said latest.
 * With the board owning search, there is nothing left to filter by.
 */
const useGetAllJobs = () => {
  const dispatch = useAppDispatch();

  useEffect(() => {
    const fetchAllJobs = async () => {
      try {
        const res = await apiClient.get<{ success: boolean } & PaginatedResponse<JobDto>>(
          "/job/get",
          // LatestJobs renders six. Asking for a page rather than the API's cap
          // of 50 keeps the landing payload proportional to what it shows.
          { params: { limit: 6 } },
        );
        if (res.data.success) {
          dispatch(setAllJobs(res.data.items));
        }
      } catch (error) {
        console.error(error);
      }
    };
    void fetchAllJobs();
  }, [dispatch]);
};

export default useGetAllJobs;
