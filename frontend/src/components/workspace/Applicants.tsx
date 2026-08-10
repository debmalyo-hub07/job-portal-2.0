import { Check, Clock, MoreHorizontal, Users, X } from "lucide-react";
import { useParams } from "react-router";
import { toast } from "sonner";
import type { ApplicantDto } from "@jobportal/shared";

import HireShell from "./HireShell";
import { Pager } from "@/components/layout/ListControls";
import { EmptyState } from "@/components/layout/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getApiErrorMessage } from "@/lib/apiError";
import { useApplicantDecision, useApplicants } from "@/hooks/useRecruiterWorkspace";

/**
 * Status as icon *and* label, never colour alone — the rule 2A set and
 * `AppliedJobTable` already follows.
 */
const STATUS: Record<
  ApplicantDto["status"],
  { variant: "ok" | "danger" | "warn"; icon: typeof Check; label: string }
> = {
  accepted: { variant: "ok", icon: Check, label: "Accepted" },
  rejected: { variant: "danger", icon: X, label: "Rejected" },
  pending: { variant: "warn", icon: Clock, label: "Pending" },
};

/**
 * The applicants for one job.
 *
 * Two fixes. Accept and reject are DropdownMenu items — real buttons with roles,
 * keyboard operation and a focus ring — where the inherited version used
 * `<div onClick>`, which worked for a mouse and did not exist for a keyboard.
 * And the decision invalidates the query, so the row updates; the old table
 * POSTed, toasted success and never refetched, leaving the row showing its
 * previous status until a manual reload.
 */
export function Applicants() {
  const params = useParams();
  const { data, isPending, isError, error, setPage } = useApplicants(params.id);
  const decide = useApplicantDecision(params.id);

  const onDecide = async (applicationId: string, status: "accepted" | "rejected") => {
    try {
      await decide.mutateAsync({ applicationId, status });
      toast.success(status === "accepted" ? "Applicant accepted" : "Applicant rejected");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not update status"));
    }
  };

  return (
    <HireShell
      title="Applicants"
      description={data ? `${data.total} ${data.total === 1 ? "person" : "people"} applied.` : undefined}
      actions={
        data ? (
          <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
        ) : undefined
      }
    >
      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-12 rounded-surface" />
          ))}
        </div>
      ) : isError ? (
        <p role="alert" className="text-sm text-danger">
          Could not load applicants: {error instanceof Error ? error.message : "unknown error"}
        </p>
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No applicants yet"
          description="Applications appear here as seekers apply to this role."
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Resume</TableHead>
                <TableHead>Applied</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((item) => {
                const status = STATUS[item.status];
                const StatusIcon = status.icon;
                return (
                  <TableRow key={item.applicationId}>
                    <TableCell className="font-medium">{item.fullName}</TableCell>
                    <TableCell>{item.email}</TableCell>
                    <TableCell>{item.phone ?? "—"}</TableCell>
                    <TableCell>
                      {item.resumeUrl ? (
                        <a
                          className="text-signal-text underline"
                          href={item.resumeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {item.resumeName ?? "Download"}
                        </a>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {item.appliedAt.split("T")[0]}
                    </TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>
                        <StatusIcon aria-hidden="true" className="size-3" />
                        {status.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Decide on ${item.fullName}`}
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => void onDecide(item.applicationId, "accepted")}
                          >
                            <Check className="size-4" />
                            Accept
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => void onDecide(item.applicationId, "rejected")}
                          >
                            <X className="size-4" />
                            Reject
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </HireShell>
  );
}

export default Applicants;
