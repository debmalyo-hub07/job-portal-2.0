import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { CompanyDto } from "@jobportal/shared";

type CompanyState = {
  singleCompany: CompanyDto | null;
  companies: CompanyDto[];
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
    setSingleCompany: (state, action: PayloadAction<CompanyDto | null>) => {
      state.singleCompany = action.payload;
    },
    setCompanies: (state, action: PayloadAction<CompanyDto[]>) => {
      state.companies = action.payload;
    },
    setSearchCompanyByText: (state, action: PayloadAction<string>) => {
      state.searchCompanyByText = action.payload;
    },
  },
});

export const { setSingleCompany, setCompanies, setSearchCompanyByText } = companySlice.actions;
export default companySlice.reducer;
