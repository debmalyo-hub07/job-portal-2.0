import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

import Navbar from "../shared/Navbar";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { apiClient } from "@/lib/apiClient";
import { getApiErrorMessage } from "@/lib/apiError";
import useGetCompanyById from "@/hooks/useGetCompanyById";
import { useAppSelector } from "@/redux/store";

const CompanySetup = () => {
  const params = useParams();
  useGetCompanyById(params.id);

  const [input, setInput] = useState({
    name: "",
    description: "",
    website: "",
    location: "",
    file: null as File | null,
  });
  const { singleCompany } = useAppSelector((state) => state.company);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const changeEventHandler = (e: ChangeEvent<HTMLInputElement>) => {
    setInput({ ...input, [e.target.name]: e.target.value });
  };

  const changeFileHandler = (e: ChangeEvent<HTMLInputElement>) => {
    setInput({ ...input, file: e.target.files?.[0] ?? null });
  };

  const submitHandler = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData();
    // Only non-empty fields are sent: the update schema validates each field it
    // receives, so an empty `website` is a 400 rather than a no-op.
    for (const field of ["name", "description", "website", "location"] as const) {
      const value = input[field].trim();
      if (value) formData.append(field, value);
    }
    if (input.file) {
      formData.append("file", input.file);
    }
    try {
      setLoading(true);
      const res = await apiClient.put<{ success: boolean }>(
        `/company/update/${params.id}`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      if (res.data.success) {
        toast.success("Company updated");
        navigate("/hire/companies");
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not update company"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Guarded: singleCompany is null until the fetch resolves, and the previous
    // version dereferenced it unconditionally, crashing on first render.
    if (!singleCompany) return;
    setInput({
      name: singleCompany.name ?? "",
      description: singleCompany.description ?? "",
      website: singleCompany.website ?? "",
      location: singleCompany.location ?? "",
      file: null,
    });
  }, [singleCompany]);

  return (
    <div>
      <Navbar />
      <div className="max-w-xl mx-auto my-10">
        <form onSubmit={submitHandler}>
          <div className="flex items-center gap-5 p-8">
            <Button
              type="button"
              onClick={() => navigate("/hire/companies")}
              variant="outline"
              className="flex items-center gap-2 text-gray-500 font-semibold"
            >
              <ArrowLeft />
              <span>Back</span>
            </Button>
            <h1 className="font-bold text-xl">Company Setup</h1>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Company Name</Label>
              <Input type="text" name="name" value={input.name} onChange={changeEventHandler} />
            </div>
            <div>
              <Label>Description</Label>
              <Input
                type="text"
                name="description"
                value={input.description}
                onChange={changeEventHandler}
              />
            </div>
            <div>
              <Label>Website</Label>
              <Input
                type="text"
                name="website"
                value={input.website}
                onChange={changeEventHandler}
              />
            </div>
            <div>
              <Label>Location</Label>
              <Input
                type="text"
                name="location"
                value={input.location}
                onChange={changeEventHandler}
              />
            </div>
            <div>
              <Label>Logo</Label>
              <Input type="file" accept="image/*" onChange={changeFileHandler} />
            </div>
          </div>
          {loading ? (
            <Button className="w-full my-4">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Please wait
            </Button>
          ) : (
            <Button type="submit" className="w-full my-4">
              Update
            </Button>
          )}
        </form>
      </div>
    </div>
  );
};

export default CompanySetup;
