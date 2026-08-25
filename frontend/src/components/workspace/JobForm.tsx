import { useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { JOB_DEPARTMENTS, JOB_TYPES, type CompanyDto } from "@jobportal/shared";

import { type JobFormValues } from "@/lib/jobForm";
import { FormField } from "@/components/layout/FormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Token-styled field surface for the controls with no primitive of their own —
 * `<textarea>` and `<select>`. `Input` already carries these classes; repeating
 * them inline on each element is how the two drift.
 */
const FIELD =
  "w-full rounded-surface border border-line-strong bg-paper px-3 py-2 text-sm text-ink " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-ring";

const EMPTY: JobFormValues = {
  title: "",
  description: "",
  requirements: "",
  salary: "",
  location: "",
  jobType: JOB_TYPES[0] as string,
  department: JOB_DEPARTMENTS[0] as string,
  experience: "",
  position: "",
  companyId: "",
  remote: false,
};

/**
 * The job form, shared by Post and Edit.
 *
 * Extracted rather than copied. This markup is the longest form in the app, and
 * a second copy is how `remote` came to have no control at all and `jobType`
 * came to be free text against a board that filters it by exact equality — two
 * bugs that both existed because the field list lived in one place and the
 * schema in another. One copy means an edit form cannot silently omit a field.
 *
 * `lockedCompany` is what enforces the one field a recruiter may not change:
 * moving a posting between employers rewrites who each existing applicant
 * applied to. Rendered disabled and explained rather than hidden, so the rule is
 * visible instead of looking like a missing control.
 *
 * Native `<select>` rather than the Radix primitive: Radix's popper needs
 * pointer-event stubs jsdom does not provide, so the control would be
 * untestable — the same reason FilterCard uses native inputs.
 */
export function JobForm({
  companies,
  initial,
  lockedCompany = false,
  submitLabel,
  pendingLabel,
  pending,
  onSubmit,
  onCancel,
  footerNote,
}: {
  companies: CompanyDto[];
  initial?: JobFormValues;
  lockedCompany?: boolean;
  submitLabel: string;
  pendingLabel: string;
  pending: boolean;
  onSubmit: (values: JobFormValues) => void;
  onCancel: () => void;
  footerNote?: ReactNode;
}) {
  const [input, setInput] = useState<JobFormValues>(initial ?? EMPTY);

  const onField = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    setInput((current) => ({ ...current, [e.target.name]: e.target.value }));
  };

  const submitHandler = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit(input);
  };

  return (
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
          <Input id="location" name="location" value={input.location} onChange={onField} required />
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

        <FormField label="Job type" htmlFor="jobType" hint="Seekers filter on these exact values.">
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

        <FormField
          label="Department"
          htmlFor="department"
          hint="Used to help candidates browse beyond engineering roles."
        >
          <select
            id="department"
            name="department"
            value={input.department}
            onChange={onField}
            className={FIELD}
          >
            {JOB_DEPARTMENTS.map((department) => (
              <option key={department} value={department}>
                {department}
              </option>
            ))}
          </select>
        </FormField>

        <FormField
          label="Company"
          htmlFor="companyId"
          required={!lockedCompany}
          hint={
            lockedCompany
              ? "The employer cannot change — candidates applied to this company."
              : undefined
          }
        >
          <select
            id="companyId"
            name="companyId"
            value={input.companyId}
            onChange={onField}
            required={!lockedCompany}
            disabled={lockedCompany}
            className={`${FIELD} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {/* Matched on id, never on a lowercased name: two companies with
                the same name resolved to whichever the array held first. */}
            <option value="">Select a company</option>
            {companies.map((company) => (
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
          onChange={(e) => setInput((current) => ({ ...current, remote: e.target.checked }))}
          className="size-4 rounded border-line-strong accent-[var(--signal-text)]"
        />
        <Label htmlFor="remote" className="cursor-pointer font-normal text-ink-muted">
          This role is remote
        </Label>
      </div>

      {footerNote}

      <div className="mt-(--space-card) flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              {pendingLabel}
            </>
          ) : (
            submitLabel
          )}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export default JobForm;
