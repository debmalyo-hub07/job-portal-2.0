import { Link } from "react-router";
import type { JobDto } from "@jobportal/shared";

import { Badge } from "./ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";

type JobProps = {
  job: JobDto;
};

/**
 * Days since posting, as a phrase rather than a number.
 *
 * Hoisted out of the component: it closes over nothing, so redefining it per
 * render bought a new function per card per render for no reason.
 */
function postedLabel(mongodbTime: string | undefined): string {
  if (!mongodbTime) return "Recently";
  const days = Math.floor((Date.now() - new Date(mongodbTime).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

/**
 * A job card on the board.
 *
 * The Bookmark button and "Save For Later" are gone. Both rendered as real
 * controls and called nothing at all — the first was an icon button with no
 * handler, the second a primary-styled button with no handler. Saved jobs is
 * still unbuilt, and a control that silently does nothing is worse than an
 * absent one: it teaches the user their click was ignored. They come back with
 * the feature.
 *
 * The card is one link rather than a card containing a "Details" button, so the
 * whole surface is the target and there is a single tab stop per result.
 */
const Job = ({ job }: JobProps) => {
  return (
    <Link
      to={`/description/${job.id}`}
      className="flex h-full flex-col rounded-surface border border-line bg-paper-raised p-5 transition-colors hover:border-signal focus-visible:ring-[3px] focus-visible:ring-signal-ring focus-visible:outline-none"
    >
      <p className="text-sm text-ink-muted">{postedLabel(job.createdAt)}</p>

      <div className="mt-3 flex items-center gap-3">
        <Avatar>
          {/* alt="" — the company name is the next element, and a duplicate
              accessible name is announced twice. */}
          <AvatarImage src={job.company?.logoUrl ?? undefined} alt="" />
          <AvatarFallback>{job.company?.name?.slice(0, 2) ?? "??"}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{job.company?.name}</p>
          <p className="truncate text-sm text-ink-muted">{job.location}</p>
        </div>
      </div>

      <h3 className="mt-4 font-display text-xl font-semibold text-ink">{job.title}</h3>
      <p className="mt-2 line-clamp-3 text-sm text-ink-muted">{job.description}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2 pt-2">
        <Badge variant="outline">{job.position} positions</Badge>
        <Badge variant="outline">{job.jobType}</Badge>
        {/* Not Geist Mono: the rule is aligned numeric comparison only, and a
            lone figure in a badge is the case it names as prohibited. */}
        <Badge variant="outline">{job.salary} LPA</Badge>
        {job.remote && <Badge variant="outline">Remote</Badge>}
      </div>
    </Link>
  );
};

export default Job;
