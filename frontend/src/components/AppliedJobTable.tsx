import { Badge, badgeVariants } from "./ui/badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { useAppSelector } from "@/redux/store";
import type { VariantProps } from "class-variance-authority";
import { CircleCheck, CircleX, Clock, type LucideIcon } from "lucide-react";

type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];

// Status is carried by icon and label together — never colour alone.
const STATUS_PRESENTATION: Record<
  string,
  { variant: BadgeVariant; Icon: LucideIcon }
> = {
  rejected: { variant: "danger", Icon: CircleX },
  pending: { variant: "outline", Icon: Clock },
  accepted: { variant: "ok", Icon: CircleCheck },
};

function statusPresentation(status: string) {
  return STATUS_PRESENTATION[status] ?? STATUS_PRESENTATION.pending;
}

const AppliedJobTable = () => {
  const { allAppliedJobs } = useAppSelector((state) => state.job);

  return (
    <Table>
      <TableCaption>List of jobs you have applied for</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Job Role</TableHead>
          <TableHead>Company</TableHead>
          <TableHead className="text-right">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {allAppliedJobs.length <= 0 ? (
          <TableRow>
            <TableCell colSpan={4}>No applied jobs found</TableCell>
          </TableRow>
        ) : (
          allAppliedJobs.map((appliedJob) => {
            const { variant, Icon } = statusPresentation(appliedJob.status);
            return (
              <TableRow key={appliedJob.id}>
                <TableCell>{appliedJob.appliedAt.split("T")[0]}</TableCell>
                <TableCell>{appliedJob.job?.title}</TableCell>
                <TableCell>{appliedJob.job?.company?.name}</TableCell>
                <TableCell className="text-right">
                  <Badge variant={variant}>
                    <Icon />
                    {appliedJob.status.toUpperCase()}
                  </Badge>
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
};

export default AppliedJobTable;
