import type { JobDto } from "@jobportal/shared";

/**
 * Every field a job carries, as strings — this is a form, so numbers arrive as
 * text and the API's schema coerces them.
 *
 * In `lib/` rather than beside `JobForm.tsx`: a component file may export only
 * components, or Fast Refresh silently stops working for it
 * (`react-refresh/only-export-components`). The type could have stayed — types
 * are erased — but keeping the shape and its mapper together is why they both
 * live here.
 */
export type JobFormValues = {
  title: string;
  description: string;
  requirements: string;
  salary: string;
  location: string;
  jobType: string;
  department: string;
  experience: string;
  position: string;
  companyId: string;
  remote: boolean;
};

/**
 * A job's fields, off the wire and into the form.
 *
 * `requirements` is an array in the DTO and a comma-string in the form, which is
 * the same legacy shape `jobCreateBodySchema` splits on the way in — so the
 * round trip is symmetric rather than lossy.
 */
export function jobToFormValues(job: JobDto): JobFormValues {
  return {
    title: job.title,
    description: job.description,
    requirements: job.requirements.join(", "),
    salary: String(job.salary),
    location: job.location,
    jobType: job.jobType,
    department: job.department,
    experience: String(job.experienceLevel),
    position: job.position,
    companyId: job.company?.id ?? "",
    remote: job.remote,
  };
}
