import { useEffect } from "react";
import type { LegacyCompany } from "@jobportal/shared";
import { apiClient } from "@/lib/apiClient";
import { setCompanies } from "@/redux/companySlice";
import { useAppDispatch } from "@/redux/store";

const useGetAllCompanies = () => {
  const dispatch = useAppDispatch();

  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const res = await apiClient.get<{ success: boolean; companies: LegacyCompany[] }>(
          "/company/get",
        );
        if (res.data.success) {
          dispatch(setCompanies(res.data.companies));
        }
      } catch (error) {
        console.error(error);
      }
    };
    void fetchCompanies();
  }, [dispatch]);
};

export default useGetAllCompanies;
