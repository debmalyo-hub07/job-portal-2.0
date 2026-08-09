import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import type { CompanyDto } from "@jobportal/shared";

import Navbar from "../shared/Navbar";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { apiClient } from "@/lib/apiClient";
import { getApiErrorMessage } from "@/lib/apiError";
import { setSingleCompany } from "@/redux/companySlice";
import { useAppDispatch } from "@/redux/store";

const CompanyCreate = () => {
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState("");
  const dispatch = useAppDispatch();

  const registerNewCompany = async () => {
    try {
      const res = await apiClient.post<{ success: boolean; company: CompanyDto }>(
        "/company/register",
        { name: companyName },
      );
      if (res.data.success) {
        dispatch(setSingleCompany(res.data.company));
        toast.success("Company created");
        navigate(`/hire/companies/${res.data.company.id}`);
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not create company"));
    }
  };

  return (
    <div>
      <Navbar />
      <div className="max-w-4xl mx-auto">
        <div className="my-10">
          <h1 className="font-bold text-2xl">Your Company Name</h1>
          <p className="text-ink-muted">
            Create a new company profile by filling out the form below. You can change the company
            name, logo, and other details.
          </p>
        </div>
        <Label>Company Name</Label>
        <Input
          type="text"
          className="my-2"
          placeholder="Google, Microsoft"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
        />
        <div className="flex items-center gap-2 my-10">
          <Button onClick={registerNewCompany}>Continue</Button>
          <Button variant="outline" onClick={() => navigate("/hire/companies")}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CompanyCreate;
