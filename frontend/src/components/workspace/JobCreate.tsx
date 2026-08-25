import { useNavigate } from "react-router";
import { Building2 } from "lucide-react";
import { toast } from "sonner";

import HireShell from "./HireShell";
import JobForm from "./JobForm";
import { type JobFormValues } from "@/lib/jobForm";
import { EmptyState } from "@/components/layout/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getApiErrorMessage } from "@/lib/apiError";
import { useJobCreate, useOwnedCompanies } from "@/hooks/useRecruiterWorkspace";

/**
 * Post a job.
 *
 * The fields live in `JobForm`, shared with `JobEdit` — the pair follows
 * `CompanyCreate` / `CompanyEdit`. What stays here is what only creation needs:
 * the zero-company dead end below, and the company select being live rather than
 * locked.
 */
export function JobCreate() {
  const navigate = useNavigate();
  const { data: companies, isPending, isError } = useOwnedCompanies();
  const createJob = useJobCreate();

  const submit = async (values: JobFormValues) => {
    try {
      await createJob.mutateAsync({
        ...values,
        // The schema is z.enum(["true","false","1","0","on"]) *before* its
        // transform, so a raw boolean fails validation. Send the string form.
        remote: values.remote ? "true" : "false",
      });
      toast.success("Job posted");
      navigate("/hire/jobs");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not post job"));
    }
  };

  if (isPending) {
    return (
      <HireShell title="Post a job">
        <Skeleton className="h-96 max-w-2xl rounded-surface" />
      </HireShell>
    );
  }

  if (isError) {
    return (
      <HireShell title="Post a job">
        <p role="alert" className="text-sm text-danger-text">
          Could not load your companies, so there is nothing to post against.
        </p>
      </HireShell>
    );
  }

  /**
   * The zero-company dead end, replaced.
   *
   * The inherited page rendered a complete form that could not succeed, plus a
   * warning below the submit button associated with nothing. A form that cannot
   * be submitted successfully is a dead control.
   */
  if ((companies ?? []).length === 0) {
    return (
      <HireShell title="Post a job">
        <EmptyState
          icon={Building2}
          title="Create a company first"
          description="A job belongs to a company, so there is nothing to post against yet."
          action={
            <Button onClick={() => navigate("/hire/companies/create")}>Create a company</Button>
          }
        />
      </HireShell>
    );
  }

  return (
    <HireShell title="Post a job" description="This role appears on the public job board.">
      <JobForm
        companies={companies ?? []}
        submitLabel="Post job"
        pendingLabel="Posting"
        pending={createJob.isPending}
        onSubmit={submit}
        onCancel={() => navigate("/hire/jobs")}
      />
    </HireShell>
  );
}

export default JobCreate;
