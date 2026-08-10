import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import HireShell from "./HireShell";
import { FormField } from "@/components/layout/FormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getApiErrorMessage } from "@/lib/apiError";
import { useCompany, useCompanyUpdate } from "@/hooks/useRecruiterWorkspace";

const FIELD =
  "w-full rounded-surface border border-line bg-paper px-3 py-2 text-sm text-ink " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal";

/**
 * Edit a company.
 *
 * Named for what it does — `CompanySetup` suggested a first-run wizard, and a
 * recruiter arriving at it for an existing company had no way to tell.
 *
 * The hydrating effect stays: this is an edit form genuinely seeded from a
 * fetch, not a redux mirror. It now seeds from the query result rather than
 * `singleCompany`, so `data` is its only dependency.
 */
export function CompanyEdit() {
  const params = useParams();
  const navigate = useNavigate();
  const { data, isPending, isError, error } = useCompany(params.id);
  const updateCompany = useCompanyUpdate(params.id);

  const [input, setInput] = useState({
    name: "",
    description: "",
    website: "",
    location: "",
    file: null as File | null,
  });

  useEffect(() => {
    if (!data) return;
    setInput({
      name: data.name ?? "",
      description: data.description ?? "",
      website: data.website ?? "",
      location: data.location ?? "",
      file: null,
    });
  }, [data]);

  const onField = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setInput({ ...input, [e.target.name]: e.target.value });
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
    if (input.file) formData.append("file", input.file);

    try {
      await updateCompany.mutateAsync(formData);
      toast.success("Company updated");
      navigate("/hire/companies");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not update company"));
    }
  };

  if (isPending) {
    return (
      <HireShell title="Edit company">
        <Skeleton className="h-96 max-w-2xl rounded-surface" />
      </HireShell>
    );
  }

  if (isError) {
    return (
      <HireShell title="Edit company">
        <p role="alert" className="text-sm text-danger">
          Could not load this company: {error instanceof Error ? error.message : "unknown error"}
        </p>
      </HireShell>
    );
  }

  return (
    <HireShell title="Edit company" description={data?.name}>
      <form onSubmit={submitHandler} className="max-w-2xl">
        <FormField label="Company name" htmlFor="name" required>
          <Input id="name" name="name" value={input.name} onChange={onField} required />
        </FormField>

        <FormField label="Description" htmlFor="description">
          <textarea
            id="description"
            name="description"
            rows={4}
            value={input.description}
            onChange={onField}
            className={FIELD}
          />
        </FormField>

        <FormField
          label="Website"
          htmlFor="website"
          hint="Include the scheme — https://example.com"
        >
          <Input
            id="website"
            name="website"
            type="url"
            value={input.website}
            onChange={onField}
          />
        </FormField>

        <FormField label="Location" htmlFor="location">
          <Input id="location" name="location" value={input.location} onChange={onField} />
        </FormField>

        <FormField label="Logo" htmlFor="logo" hint="Replaces the current logo, if any.">
          <Input
            id="logo"
            name="logo"
            type="file"
            accept="image/*"
            onChange={(e) => setInput({ ...input, file: e.target.files?.[0] ?? null })}
          />
        </FormField>

        <div className="mt-(--space-card) flex items-center gap-2">
          <Button type="submit" disabled={updateCompany.isPending}>
            {updateCompany.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Saving
              </>
            ) : (
              "Save changes"
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

export default CompanyEdit;
