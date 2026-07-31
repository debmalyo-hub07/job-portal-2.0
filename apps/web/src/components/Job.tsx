import { Bookmark } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { LegacyJob } from "@jobportal/shared";

import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Avatar, AvatarImage } from "./ui/avatar";

type JobProps = {
  job: LegacyJob;
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
    <div className="p-5 rounded-md shadow-xl bg-white border border-gray-100">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {daysAgo === 0 ? "Today" : `${daysAgo} days ago`}
        </p>
        <Button variant="outline" className="rounded-full" size="icon">
          <Bookmark />
        </Button>
      </div>
      <div className="flex items-center gap-2 my-2">
        <Button className="p-6" variant="outline" size="icon">
          <Avatar>
            <AvatarImage src={job.company?.logo} alt={job.company?.name} />
          </Avatar>
        </Button>
        <div>
          <h1 className="font-medium text-lg">{job.company?.name}</h1>
          <p className="text-sm text-gray-500">{job.location}</p>
        </div>
      </div>
      <div>
        <h1 className="font-bold text-lg my-2">{job.title}</h1>
        <p className="text-sm text-gray-600">{job.description}</p>
      </div>
      <div className="flex items-center gap-2 mt-4">
        <Badge className="text-blue-700 font-bold" variant="outline">
          {job.position} Positions
        </Badge>
        <Badge className="text-[#F83002] font-bold" variant="outline">
          {job.jobType}
        </Badge>
        <Badge className="text-[#7209b7] font-bold" variant="outline">
          {job.salary}LPA
        </Badge>
      </div>
      <div className="flex items-center gap-4 mt-4">
        <Button onClick={() => navigate(`/description/${job._id}`)} variant="outline">
          Details
        </Button>
        <Button className="bg-[#7209b7]">Save For Later</Button>
      </div>
    </div>
  );
};

export default Job;
