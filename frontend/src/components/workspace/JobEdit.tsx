import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";

import HireShell from "./HireShell";
import JobForm from "./JobForm";
import { jobToFormValues, type JobFormValues } from "@/lib/jobForm";
import { Skeleton } from "@/components/ui/skeleton";
import { getApiErrorMessage } from "@/lib/apiError";
import { jobStatusMeta } from "@/lib/jobStatus";
import { Badge } from "@/components/ui/badge";
import { useJob, useJobUpdate, useOwnedCompanies } from "@/hooks/useRecruiterWorkspace";

/**
 * Edit a posted job.
 *
 * The form is mounted only once `data` has arrived, keyed by nothing — a form
 * seeded from a fetch either has its values or is not rendered. `CompanyEdit`
 * hydrates through an effect because it was converted from a redux mirror; a new
 * form has no reason to inherit that, since an effect-seeded form flickers
 * through an empty state and can overwrite what the user has already typed if
 * the query refetches.
 */
export function JobEdit() {
  const params = useParams();
  const navigate = useNavigate();
  const { data: job, isPending, isError, error } = useJob(params.id);
  const { data: companies } = useOwnedCompanies();
  const updateJob = useJobUpdate(params.id);

  const submit = async (values: JobFormValues) => {
    try {
      // `companyId` is deliberately not sent: the update schema is `.strict()`
      // and does not define it, so including it would be a 400. The employer is
      // fixed once candidates have applied against it.
      await updateJob.mutateAsync({
        title: values.title,
        description: values.description,
        requirements: values.requirements,
        salary: values.salary,
        experience: values.experience,
        location: values.location,
        jobType: values.jobType,
        department: values.department,
        position: values.position,
        remote: values.remote ? "true" : "false",
      });
      toast.success("Job updated");
      navigate("/hire/jobs");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not update job"));
    }
  };

  if (isPending) {
    return (
      <HireShell title="Edit job">
        <Skeleton className="h-96 max-w-2xl rounded-surface" />
      </HireShell>
    );
  }

  if (isError) {
    return (
      <HireShell title="Edit job">
        <p role="alert" className="text-sm text-danger-text">
          Could not load this job: {error instanceof Error ? error.message : "unknown error"}
        </p>
      </HireShell>
    );
  }

  const status = jobStatusMeta(job.status);

  return (
    <HireShell
      title="Edit job"
      description="Changes appear on the public job board immediately."
      actions={
        // A closed role stays editable, so the badge is what tells the recruiter
        // the posting they are correcting is not currently on the board.
        job.status === "closed" ? (
          <Badge variant={status.variant}>
            <status.Icon aria-hidden="true" />
            {status.label}
          </Badge>
        ) : undefined
      }
    >
      <JobForm
        companies={companies ?? (job.company ? [job.company] : [])}
        initial={jobToFormValues(job)}
        lockedCompany
        submitLabel="Save changes"
        pendingLabel="Saving"
        pending={updateJob.isPending}
        onSubmit={submit}
        onCancel={() => navigate("/hire/jobs")}
      />
    </HireShell>
  );
}

export default JobEdit;
