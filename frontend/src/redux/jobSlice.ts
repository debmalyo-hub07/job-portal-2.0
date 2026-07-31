import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { LegacyApplication, LegacyJob } from "@jobportal/shared";

type JobState = {
  allJobs: LegacyJob[];
  allAdminJobs: LegacyJob[];
  singleJob: LegacyJob | null;
  searchJobByText: string;
  allAppliedJobs: LegacyApplication[];
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
    setAllJobs: (state, action: PayloadAction<LegacyJob[]>) => {
      state.allJobs = action.payload;
    },
    setSingleJob: (state, action: PayloadAction<LegacyJob | null>) => {
      state.singleJob = action.payload;
    },
    setAllAdminJobs: (state, action: PayloadAction<LegacyJob[]>) => {
      state.allAdminJobs = action.payload;
    },
    setSearchJobByText: (state, action: PayloadAction<string>) => {
      state.searchJobByText = action.payload;
    },
    setAllAppliedJobs: (state, action: PayloadAction<LegacyApplication[]>) => {
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
