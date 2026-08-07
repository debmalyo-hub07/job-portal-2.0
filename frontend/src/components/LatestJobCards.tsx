import { Link } from "react-router";
import type { JobDto } from "@jobportal/shared";
import { Badge } from "./ui/badge";
import { HoverLift } from "@/lib/motion";

type LatestJobCardsProps = {
  job: JobDto;
};

const LatestJobCards = ({ job }: LatestJobCardsProps) => {
  return (
    <HoverLift className="h-full">
      {/*
        A real link, not a div with onClick. The inherited card was a clickable
        div: no keyboard focus, no Enter, nothing for a screen reader to
        announce as navigable.
      */}
      <Link
        to={`/description/${job.id}`}
        className="flex h-full flex-col rounded-surface border border-line bg-paper-raised p-(--space-card) transition-colors duration-(--dur-fast) hover:border-signal focus-visible:ring-[3px] focus-visible:ring-signal-ring focus-visible:outline-none"
      >
        <p className="font-medium text-ink">{job.company?.name}</p>
        <p className="text-sm text-ink-muted">{job.location}</p>

        <h3 className="mt-3 font-display text-xl font-semibold text-ink">{job.title}</h3>
        <p className="mt-2 line-clamp-2 text-sm text-ink-muted">{job.description}</p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {/*
            `position` is a department string in jobCreateBodySchema, not a
            count — the inherited card rendered "{position} Positions", which
            produced "Analytics Positions".
          */}
          <Badge variant="outline">{job.position}</Badge>
          <Badge variant="outline">{job.jobType}</Badge>
          {/* Geist, not mono: a lone value in a badge is not a column to scan. */}
          <Badge variant="outline">₹{job.salary} LPA</Badge>
        </div>
      </Link>
    </HoverLift>
  );
};

export default LatestJobCards;
