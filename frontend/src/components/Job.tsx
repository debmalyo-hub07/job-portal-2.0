import { Bookmark } from "lucide-react";
import { useNavigate } from "react-router";
import type { JobDto } from "@jobportal/shared";

import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";

type JobProps = {
  job: JobDto;
};

const Job = ({ job }: JobProps) => {
  const navigate = useNavigate();

  const daysAgoFunction = (mongodbTime: string | undefined): number => {
    if (!mongodbTime) return 0;
    const createdAt = new Date(mongodbTime).getTime();
    const currentTime = Date.now();
    return Math.floor((currentTime - createdAt) / (1000 * 60 * 60 * 24));
  };

  const daysAgo = daysAgoFunction(job.createdAt);

  return (
    <div className="p-5 rounded-md shadow-xl bg-paper-raised border border-line h-full flex flex-col">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-muted">
          {daysAgo === 0 ? "Today" : `${daysAgo} days ago`}
        </p>
        <Button variant="outline" className="rounded-full" size="icon" aria-label="Save job">
          <Bookmark />
        </Button>
      </div>
      <div className="flex items-center gap-2 my-2">
        <Button className="p-6" variant="outline" size="icon" aria-hidden="true" tabIndex={-1}>
          <Avatar>
            <AvatarImage src={job.company?.logoUrl ?? undefined} alt="" />
            <AvatarFallback>{job.company?.name?.slice(0, 2) ?? "??"}</AvatarFallback>
          </Avatar>
        </Button>
        <div>
          <p className="font-medium text-lg">{job.company?.name}</p>
          <p className="text-sm text-ink-muted">{job.location}</p>
        </div>
      </div>
      <div>
        <h3 className="font-bold text-lg my-2">{job.title}</h3>
        <p className="text-sm text-ink-muted line-clamp-3">{job.description}</p>
      </div>
      <div className="flex items-center gap-2 mt-4 flex-wrap">
        <Badge className="text-signal-text font-bold" variant="outline">
          {job.position} Positions
        </Badge>
        <Badge className="text-signal-text font-bold" variant="outline">
          {job.jobType}
        </Badge>
        <Badge className="text-signal-text font-bold" variant="outline">
          {job.salary} LPA
        </Badge>
      </div>
      <div className="flex items-center gap-4 pt-4 mt-auto">
        <Button onClick={() => navigate(`/description/${job.id}`)} variant="outline">
          Details
        </Button>
        <Button variant="signal">Save For Later</Button>
      </div>
    </div>
  );
};

export default Job;
