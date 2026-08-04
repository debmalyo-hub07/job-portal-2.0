import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { ApplicantDto } from "@jobportal/shared";

type ApplicationState = {
  applicants: ApplicantDto[];
};

const initialState: ApplicationState = {
  applicants: [],
};

const applicationSlice = createSlice({
  name: "application",
  initialState,
  reducers: {
    setAllApplicants: (state, action: PayloadAction<ApplicantDto[]>) => {
      state.applicants = action.payload;
    },
  },
});

export const { setAllApplicants } = applicationSlice.actions;
export default applicationSlice.reducer;
