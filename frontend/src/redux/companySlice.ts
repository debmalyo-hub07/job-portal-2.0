import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { LegacyCompany } from "@jobportal/shared";

type CompanyState = {
  singleCompany: LegacyCompany | null;
  companies: LegacyCompany[];
  searchCompanyByText: string;
};

const initialState: CompanyState = {
  singleCompany: null,
  companies: [],
  searchCompanyByText: "",
};

const companySlice = createSlice({
  name: "company",
  initialState,
  reducers: {
    setSingleCompany: (state, action: PayloadAction<LegacyCompany | null>) => {
      state.singleCompany = action.payload;
    },
    setCompanies: (state, action: PayloadAction<LegacyCompany[]>) => {
      state.companies = action.payload;
    },
    setSearchCompanyByText: (state, action: PayloadAction<string>) => {
      state.searchCompanyByText = action.payload;
    },
  },
});

export const { setSingleCompany, setCompanies, setSearchCompanyByText } = companySlice.actions;
export default companySlice.reducer;
