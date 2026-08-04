import { useEffect } from "react";
import type { CompanyDto } from "@jobportal/shared";
import { apiClient } from "@/lib/apiClient";
import { setCompanies } from "@/redux/companySlice";
import { useAppDispatch } from "@/redux/store";

const useGetAllCompanies = () => {
  const dispatch = useAppDispatch();

  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        // A recruiter's own companies: a plain array, not a paginated envelope.
        const res = await apiClient.get<{ success: boolean; companies: CompanyDto[] }>(
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
