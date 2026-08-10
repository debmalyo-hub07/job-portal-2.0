import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import HireShell from "./HireShell";
import { FormField } from "@/components/layout/FormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getApiErrorMessage } from "@/lib/apiError";
import { useCompanyCreate } from "@/hooks/useRecruiterWorkspace";

/**
 * Create a company — one field, so this changes least.
 *
 * A real `<form>` rather than a button with a click handler, so Enter submits.
 * The redux dispatch is gone: the mutation invalidates the companies query, and
 * the edit page fetches the row it needs by id.
 */
export function CompanyCreate() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const createCompany = useCompanyCreate();

  const submitHandler = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const company = await createCompany.mutateAsync({ name });
      toast.success("Company created");
      navigate(`/hire/companies/${company.id}`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not create company"));
    }
  };

  return (
    <HireShell
      title="New company"
      description="Name it now — you can add a logo, website and location next."
    >
      <form onSubmit={submitHandler} className="max-w-md">
        <FormField label="Company name" htmlFor="name" required>
          <Input
            id="name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Inc."
            required
          />
        </FormField>

        <div className="mt-(--space-card) flex items-center gap-2">
          <Button type="submit" disabled={createCompany.isPending}>
            {createCompany.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Creating
              </>
            ) : (
              "Continue"
            )}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate("/hire/companies")}>
            Cancel
          </Button>
        </div>
      </form>
    </HireShell>
  );
}

export default CompanyCreate;
