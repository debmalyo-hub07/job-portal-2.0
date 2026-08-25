import { MoreHorizontal, Users } from "lucide-react";
import { useParams } from "react-router";
import { toast } from "sonner";
import type { ApplicantDto } from "@jobportal/shared";
import { RECRUITER_SETTABLE, isTerminal } from "@jobportal/shared";

import HireShell from "./HireShell";
import { FitBadge } from "@/components/FitBadge";
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
import { statusMeta } from "@/lib/applicationStatus";
import { useApplicantDecision, useApplicants } from "@/hooks/useRecruiterWorkspace";

/**
 * The applicants for one job.
 *
 * Two fixes. Accept and reject are DropdownMenu items — real buttons with roles,
 * keyboard operation and a focus ring — where the inherited version used
 * `<div onClick>`, which worked for a mouse and did not exist for a keyboard.
 * And the decision invalidates the query, so the row updates; the old table
 * POSTed, toasted success and never refetched, leaving the row showing its
 * previous status until a manual reload.
 *
 * Fit is server-owned. The API scores every applicant against this job and sorts
 * the complete set before pagination, so this table explains the order instead
 * of recomputing a second version of the business rule.
 */
export function Applicants() {
  const params = useParams();
  const { data, isPending, isError, error, setPage } = useApplicants(params.id);
  const decide = useApplicantDecision(params.id);

  // The settable subset, not every ApplicationStatus — the menu is built from
  // the same list, so this is the type making that agreement checkable.
  const onDecide = async (
    applicationId: string,
    status: (typeof RECRUITER_SETTABLE)[number],
  ) => {
    try {
      await decide.mutateAsync({ applicationId, status });
      toast.success(`Moved to ${statusMeta(status).label}`);
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
        <p role="alert" className="text-sm text-danger-text">
          Could not load applicants: {error instanceof Error ? error.message : "unknown error"}
        </p>
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No applicants yet"
          description="Applications appear here as seekers apply to this role."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Resume</TableHead>
              <TableHead>Fit</TableHead>
              <TableHead>Applied</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((item) => {
              const status = statusMeta(item.status);
              const StatusIcon = status.Icon;
              // A closed application takes no further decision; the API answers
              // one with 409, so the menu is not offered at all.
              const closed = isTerminal(item.status);
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
                  <TableCell className="min-w-56">
                    {item.fit ? (
                      <FitBadge
                        fit={item.fit}
                        perfectLabel="Matches every requirement"
                        className="flex-col items-start gap-1"
                      />
                    ) : (
                      <span className="text-ink-muted">&mdash;</span>
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
                    {closed ? (
                      <span className="text-sm text-ink-muted">&mdash;</span>
                    ) : (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Change status for ${item.fullName}`}
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {/*
                            Built from RECRUITER_SETTABLE, so the menu cannot
                            offer a move the API would refuse — and a stage added
                            to the pipeline appears here without an edit.
                            The current status is omitted: setting it again is a
                            409 STATUS_UNCHANGED by design.
                          */}
                          {RECRUITER_SETTABLE.filter((next) => next !== item.status).map((next) => {
                            const meta = statusMeta(next);
                            const NextIcon = meta.Icon;
                            return (
                              <DropdownMenuItem
                                key={next}
                                onSelect={() => void onDecide(item.applicationId, next)}
                              >
                                <NextIcon className="size-4" />
                                {meta.label}
                              </DropdownMenuItem>
                            );
                          })}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </HireShell>
  );
}

export default Applicants;
