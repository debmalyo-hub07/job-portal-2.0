import { ArrowUpRight, BriefcaseBusiness, Clock3, MapPin } from "lucide-react";
import { Link } from "react-router";
import type { JobDto } from "@jobportal/shared";

import { Badge } from "./ui/badge";
import CompanyAvatar from "./shared/CompanyAvatar";
import { FitBadge } from "./FitBadge";

type JobProps = {
  job: JobDto;
};

const postedFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function postedLabel(mongodbTime: string | undefined): string {
  if (!mongodbTime) return "Recently";
  const days = Math.floor((Date.now() - new Date(mongodbTime).getTime()) / 86_400_000);
  if (days < 7) return postedFormatter.format(-days, "day");
  const weeks = Math.floor(days / 7);
  return postedFormatter.format(-weeks, "week");
}

const Job = ({ job }: JobProps) => {
  return (
    <Link
      to={`/description/${job.id}`}
      className="group grid gap-5 py-6 transition-colors duration-(--dur-fast) hover:bg-paper-sunken/65 focus-visible:bg-paper-sunken/65 focus-visible:ring-[3px] focus-visible:ring-signal-ring focus-visible:outline-none sm:grid-cols-[minmax(0,1fr)_11rem] sm:px-4"
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-3">
          <CompanyAvatar name={job.company?.name} logoUrl={job.company?.logoUrl} className="size-10" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{job.company?.name}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
              <MapPin aria-hidden="true" className="size-3.5" />
              <span className="truncate">{job.remote ? "Remote" : job.location}</span>
            </p>
          </div>
        </div>

        <h3 className="mt-5 font-display text-2xl font-semibold leading-tight text-ink group-hover:text-signal-text sm:text-[1.75rem]">
          {job.title}
        </h3>
        <p className="mt-2 line-clamp-2 max-w-2xl text-sm leading-6 text-ink-muted">{job.description}</p>

        <FitBadge fit={job.fit} className="mt-4 border-l-2 border-signal pl-3" />
      </div>

      <div className="flex items-start justify-between gap-4 sm:flex-col sm:items-end sm:justify-start sm:border-l sm:border-line sm:pl-5 sm:text-right">
        <ArrowUpRight aria-hidden="true" className="size-4 shrink-0 text-ink-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-signal-text sm:order-last sm:mt-auto" />
        <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
          <Badge variant="secondary">
            <BriefcaseBusiness aria-hidden="true" />
            {job.jobType}
          </Badge>
          <span className="text-sm font-semibold text-ink">INR {job.salary} LPA</span>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
          <Clock3 aria-hidden="true" className="size-3.5" />
          {postedLabel(job.createdAt)}
        </span>
      </div>
    </Link>
  );
};

export default Job;
