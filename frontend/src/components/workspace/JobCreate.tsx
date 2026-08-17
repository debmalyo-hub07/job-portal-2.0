import { useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { JOB_TYPES } from "@jobportal/shared";

import HireShell from "./HireShell";
import { FormField } from "@/components/layout/FormField";
import { EmptyState } from "@/components/layout/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getApiErrorMessage } from "@/lib/apiError";
import { useJobCreate, useOwnedCompanies } from "@/hooks/useRecruiterWorkspace";

/**
 * Token-styled field surface for the controls with no primitive of their own —
 * `<textarea>` and `<select>`. `Input` already carries these classes; repeating
 * them inline on each element is how the two drift.
 */
const FIELD =
  "w-full rounded-surface border border-line-strong bg-paper px-3 py-2 text-sm text-ink " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-ring";

/**
 * Post a job.
 *
 * Two silent bugs close here. `remote` gets a control for the first time — the
 * field exists on the schema, the model and the matching pipeline, so every row
 * ever posted carries the default `false` and the seeker board's Remote facet
 * matches nothing. And `jobType` becomes a fixed list rather than free text, so
 * a recruiter can no longer post a value the board's exact-equality facet can
 * never match.
 *
 * A native `<select>` rather than the Radix primitive: Radix's popper needs
 * pointer-event stubs jsdom does not provide, so the control would be
 * untestable — the same reason FilterCard uses native inputs.
 */
export function JobCreate() {
  const navigate = useNavigate();
  const { data: companies, isPending, isError } = useOwnedCompanies();
  const createJob = useJobCreate();

  const [input, setInput] = useState({
    title: "",
    description: "",
    requirements: "",
    salary: "",
    location: "",
    jobType: JOB_TYPES[0] as string,
    experience: "",
    position: "",
    companyId: "",
    remote: false,
  });

  const onField = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    setInput({ ...input, [e.target.name]: e.target.value });
  };

  const submitHandler = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      await createJob.mutateAsync({
        ...input,
        // The schema is z.enum(["true","false","1","0","on"]) *before* its
        // transform, so a raw boolean fails validation. Send the string form.
        remote: input.remote ? "true" : "false",
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
      <form onSubmit={submitHandler} className="max-w-2xl">
        <FormField label="Title" htmlFor="title" required>
          <Input id="title" name="title" value={input.title} onChange={onField} required />
        </FormField>

        <FormField label="Description" htmlFor="description" required>
          <textarea
            id="description"
            name="description"
            rows={5}
            value={input.description}
            onChange={onField}
            required
            className={FIELD}
          />
        </FormField>

        <FormField
          label="Requirements"
          htmlFor="requirements"
          hint="Comma-separated — each becomes its own tag on the job card."
        >
          <textarea
            id="requirements"
            name="requirements"
            rows={3}
            value={input.requirements}
            onChange={onField}
            className={FIELD}
          />
        </FormField>

        <div className="grid gap-x-4 sm:grid-cols-2">
          <FormField label="Salary (LPA)" htmlFor="salary" required>
            <Input
              id="salary"
              name="salary"
              type="number"
              min={1}
              value={input.salary}
              onChange={onField}
              required
            />
          </FormField>

          <FormField label="Experience (years)" htmlFor="experience" required>
            <Input
              id="experience"
              name="experience"
              type="number"
              min={0}
              max={50}
              value={input.experience}
              onChange={onField}
              required
            />
          </FormField>

          <FormField label="Location" htmlFor="location" required>
            <Input
              id="location"
              name="location"
              value={input.location}
              onChange={onField}
              required
            />
          </FormField>

          <FormField label="Positions" htmlFor="position" required>
            <Input
              id="position"
              name="position"
              type="number"
              min={1}
              value={input.position}
              onChange={onField}
              required
            />
          </FormField>

          <FormField
            label="Job type"
            htmlFor="jobType"
            hint="Seekers filter on these exact values."
          >
            <select
              id="jobType"
              name="jobType"
              value={input.jobType}
              onChange={onField}
              className={FIELD}
            >
              {JOB_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Company" htmlFor="companyId" required>
            <select
              id="companyId"
              name="companyId"
              value={input.companyId}
              onChange={onField}
              required
              className={FIELD}
            >
              {/* Matched on id, never on a lowercased name: two companies with
                  the same name resolved to whichever the array held first. */}
              <option value="">Select a company</option>
              {(companies ?? []).map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <div className="mb-(--space-field) flex items-center gap-2">
          <input
            type="checkbox"
            id="remote"
            name="remote"
            checked={input.remote}
            onChange={(e) => setInput({ ...input, remote: e.target.checked })}
            className="size-4 rounded border-line-strong accent-[var(--signal-text)]"
          />
          <Label htmlFor="remote" className="cursor-pointer font-normal text-ink-muted">
            This role is remote
          </Label>
        </div>

        <div className="mt-(--space-card) flex items-center gap-2">
          <Button type="submit" disabled={createJob.isPending}>
            {createJob.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Posting
              </>
            ) : (
              "Post job"
            )}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate("/hire/jobs")}>
            Cancel
          </Button>
        </div>
      </form>
    </HireShell>
  );
}

export default JobCreate;
