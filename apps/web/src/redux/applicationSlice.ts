import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { LegacyApplication } from "@jobportal/shared";

type ApplicationState = {
  applicants: LegacyApplication[];
};

const initialState: ApplicationState = {
  applicants: [],
};

const applicationSlice = createSlice({
  name: "application",
  initialState,
  reducers: {
    setAllApplicants: (state, action: PayloadAction<LegacyApplication[]>) => {
      state.applicants = action.payload;
    },
  },
});

export const { setAllApplicants } = applicationSlice.actions;
export default applicationSlice.reducer;
