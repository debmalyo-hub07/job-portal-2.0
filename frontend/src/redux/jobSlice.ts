import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { AppliedJobDto, JobDto } from "@jobportal/shared";

/**
 * `searchedQuery` is deliberately absent since 2B-2.
 *
 * It was the job board's filter state, written by the hero search box and the
 * category chips and read by `useGetAllJobs`. 4B moved the board to the URL
 * (`useJobSearch`), which left redux authoritative for the retired `/browse`
 * list and the URL authoritative for `/jobs` — two sources of truth for one
 * question. Its last consumer was the landing page's "Latest openings", where
 * it was a bug: a search filtered that section while its heading still claimed
 * to show the latest.
 */
type JobState = {
  allJobs: JobDto[];
  allAdminJobs: JobDto[];
  singleJob: JobDto | null;
  searchJobByText: string;
  allAppliedJobs: AppliedJobDto[];
};

const initialState: JobState = {
  allJobs: [],
  allAdminJobs: [],
  singleJob: null,
  searchJobByText: "",
  allAppliedJobs: [],
};

const jobSlice = createSlice({
  name: "job",
  initialState,
  reducers: {
    setAllJobs: (state, action: PayloadAction<JobDto[]>) => {
      state.allJobs = action.payload;
    },
    setSingleJob: (state, action: PayloadAction<JobDto | null>) => {
      state.singleJob = action.payload;
    },
    setAllAdminJobs: (state, action: PayloadAction<JobDto[]>) => {
      state.allAdminJobs = action.payload;
    },
    setSearchJobByText: (state, action: PayloadAction<string>) => {
      state.searchJobByText = action.payload;
    },
    setAllAppliedJobs: (state, action: PayloadAction<AppliedJobDto[]>) => {
      state.allAppliedJobs = action.payload;
    },
  },
});

export const {
  setAllJobs,
  setSingleJob,
  setAllAdminJobs,
  setSearchJobByText,
  setAllAppliedJobs,
} = jobSlice.actions;
export default jobSlice.reducer;
