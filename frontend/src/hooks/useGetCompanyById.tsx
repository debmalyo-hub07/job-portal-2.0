import { useEffect } from "react";
import type { CompanyDto } from "@jobportal/shared";
import { apiClient } from "@/lib/apiClient";
import { setSingleCompany } from "@/redux/companySlice";
import { useAppDispatch } from "@/redux/store";

const useGetCompanyById = (companyId: string | undefined) => {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!companyId) return;

    const fetchSingleCompany = async () => {
      try {
        const res = await apiClient.get<{ success: boolean; company: CompanyDto }>(
          `/company/get/${companyId}`,
        );
        if (res.data.success) {
          dispatch(setSingleCompany(res.data.company));
        }
      } catch (error) {
        console.error(error);
      }
    };
    void fetchSingleCompany();
  }, [companyId, dispatch]);
};

export default useGetCompanyById;
