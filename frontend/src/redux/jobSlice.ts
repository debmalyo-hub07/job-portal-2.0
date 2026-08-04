import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { AppliedJobDto, JobDto } from "@jobportal/shared";

type JobState = {
  allJobs: JobDto[];
  allAdminJobs: JobDto[];
  singleJob: JobDto | null;
  searchJobByText: string;
  allAppliedJobs: AppliedJobDto[];
  searchedQuery: string;
};

const initialState: JobState = {
  allJobs: [],
  allAdminJobs: [],
  singleJob: null,
  searchJobByText: "",
  allAppliedJobs: [],
  searchedQuery: "",
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
    setSearchedQuery: (state, action: PayloadAction<string>) => {
      state.searchedQuery = action.payload;
    },
  },
});

export const {
  setAllJobs,
  setSingleJob,
  setAllAdminJobs,
  setSearchJobByText,
  setAllAppliedJobs,
  setSearchedQuery,
} = jobSlice.actions;
export default jobSlice.reducer;
