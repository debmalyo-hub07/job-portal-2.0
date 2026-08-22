import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { AppliedJobDto, JobDto } from "@jobportal/shared";

/**
 * `searchedQuery` is deliberately absent since 2B-2, `searchJobByText` and
 * `allAdminJobs` since 2B-3, and `allJobs` since the landing stats tile landed.
 *
 * All four were the same mistake: a filter or a server list living in redux
 * while something else was already authoritative. The URL owns every filter and
 * page; react-query owns every server read. `allAdminJobs` was the recruiter's
 * own job list, now `useOwnedJobs`; `searchJobByText` was its filter, now the
 * `q` URL param; `allJobs` was the landing page's list, now `useLandingJobs`.
 * Two sources of truth for one question is how the app ended up with two job
 * boards, one of which nothing linked to.
 *
 * `allJobs` cost more than duplication. The dispatch kept only `items` and
 * dropped the envelope's `total`, so the one number the landing page wanted was
 * fetched and thrown away on every visit — and the stats tile hardcoded it
 * instead. An empty initial array also meant "no openings" was indistinguishable
 * from "not loaded yet", which is what made the empty state flash on every load.
 *
 * What remains is one job's detail and the seeker's own applications.
 */
type JobState = {
  singleJob: JobDto | null;
  allAppliedJobs: AppliedJobDto[];
};

const initialState: JobState = {
  singleJob: null,
  allAppliedJobs: [],
};

const jobSlice = createSlice({
  name: "job",
  initialState,
  reducers: {
    setSingleJob: (state, action: PayloadAction<JobDto | null>) => {
      state.singleJob = action.payload;
    },
    setAllAppliedJobs: (state, action: PayloadAction<AppliedJobDto[]>) => {
      state.allAppliedJobs = action.payload;
    },
  },
});

export const { setSingleJob, setAllAppliedJobs } = jobSlice.actions;
export default jobSlice.reducer;
