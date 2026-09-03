import { ArrowUpRight, BriefcaseBusiness, CalendarDays, MapPin } from "lucide-react";
import type { PointerEvent } from "react";
import { Link } from "react-router";
import type { JobDto } from "@jobportal/shared";

import { Badge } from "./ui/badge";
import CompanyAvatar from "./shared/CompanyAvatar";
import "./landing-interactions.css";

type LatestJobCardsProps = {
  job: JobDto;
  index: number;
  featured?: boolean;
};

const DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
});

const postedOn = (createdAt: string) => {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? "Recently" : DATE_FORMATTER.format(date);
};

const LatestJobCards = ({ job, index, featured = false }: LatestJobCardsProps) => {
  const handlePointerMove = (event: PointerEvent<HTMLAnchorElement>) => {
    if (event.pointerType === "touch") return;

    const card = event.currentTarget;
    const bounds = card.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;

    card.style.setProperty("--job-tilt-x", `${(-y * 4).toFixed(2)}deg`);
    card.style.setProperty("--job-tilt-y", `${(x * 5).toFixed(2)}deg`);
  };

  const resetTilt = (event: PointerEvent<HTMLAnchorElement>) => {
    event.currentTarget.style.setProperty("--job-tilt-x", "0deg");
    event.currentTarget.style.setProperty("--job-tilt-y", "0deg");
  };

  return (
    <Link
      to={`/description/${job.id}`}
      viewTransition
      onPointerMove={handlePointerMove}
      onPointerLeave={resetTilt}
      className="job-spotlight-card group relative flex h-full min-h-80 flex-col overflow-hidden rounded-surface border border-line bg-paper-raised p-6 shadow-[var(--elevate-1)] focus-visible:ring-[3px] focus-visible:ring-signal-ring focus-visible:outline-none sm:p-7"
    >
      <span className="job-spotlight-card__rule" aria-hidden="true" />

      <div className="job-spotlight-card__depth flex items-start justify-between gap-5">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <CompanyAvatar name={job.company?.name} logoUrl={job.company?.logoUrl} className="size-9" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-ink-muted">{String(index + 1).padStart(2, "0")}</span>
                <span className="h-px w-7 bg-line" aria-hidden="true" />
                <p className="truncate text-sm font-semibold text-ink">{job.company?.name ?? "Independent team"}</p>
              </div>
            </div>
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-muted">
            <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="truncate">{job.remote ? "Remote" : job.location}</span>
          </p>
        </div>
        <span className="job-spotlight-card__arrow flex size-10 shrink-0 items-center justify-center rounded-full border border-line text-ink-muted transition-colors group-hover:border-signal group-hover:bg-signal group-hover:text-signal-fg">
          <ArrowUpRight aria-hidden="true" className="size-4" />
          <span className="sr-only">View {job.title}</span>
        </span>
      </div>

      <div className="job-spotlight-card__depth mt-9">
        <h3
          className={`max-w-2xl font-display font-semibold leading-[1.05] text-ink ${featured ? "text-3xl sm:text-4xl" : "text-3xl"}`}
        >
          {job.title}
        </h3>
        <p className="mt-3 text-xs font-semibold uppercase text-signal-text">{job.department}</p>
        <p className={`mt-4 text-sm leading-6 text-ink-muted ${featured ? "max-w-xl" : "line-clamp-3"}`}>
          {job.description}
        </p>
      </div>

      <div className="job-spotlight-card__depth mt-auto pt-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            <BriefcaseBusiness aria-hidden="true" />
            {job.jobType}
          </Badge>
          <Badge variant="outline">{job.position}</Badge>
          <Badge variant="outline">INR {job.salary} LPA</Badge>
        </div>
        <div className="mt-5 flex items-center gap-2 border-t border-line pt-4 text-xs text-ink-muted">
          <CalendarDays aria-hidden="true" className="size-3.5" />
          Posted {postedOn(job.createdAt)}
        </div>
      </div>
    </Link>
  );
};

export default LatestJobCards;
