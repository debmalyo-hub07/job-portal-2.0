import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { AppliedJobDto, JobDto } from "@jobportal/shared";

/**
 * `searchedQuery` is deliberately absent since 2B-2, and `searchJobByText` and
 * `allAdminJobs` since 2B-3.
 *
 * All three were the same mistake: a filter or a server list living in redux
 * while something else was already authoritative. The URL owns every filter and
 * page; react-query owns every server read. `allAdminJobs` was the recruiter's
 * own job list, now `useOwnedJobs`; `searchJobByText` was its filter, now the
 * `q` URL param. Two sources of truth for one question is how the app ended up
 * with two job boards, one of which nothing linked to.
 *
 * What remains is the seeker surface: the landing page's list, one job's detail,
 * and the seeker's own applications.
 */
type JobState = {
  allJobs: JobDto[];
  singleJob: JobDto | null;
  allAppliedJobs: AppliedJobDto[];
};

const initialState: JobState = {
  allJobs: [],
  singleJob: null,
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
    setAllAppliedJobs: (state, action: PayloadAction<AppliedJobDto[]>) => {
      state.allAppliedJobs = action.payload;
    },
  },
});

export const { setAllJobs, setSingleJob, setAllAppliedJobs } = jobSlice.actions;
export default jobSlice.reducer;
