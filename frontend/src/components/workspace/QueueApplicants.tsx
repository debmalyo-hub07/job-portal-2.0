import { Link } from "react-router";
import { Users } from "lucide-react";
import { toast } from "sonner";
import type { QueuedApplicantDto } from "@jobportal/shared";
import { RECRUITER_SETTABLE, isTerminal } from "@jobportal/shared";

import HireShell from "./HireShell";
import DecisionMenu from "./DecisionMenu";
import { FitBadge } from "@/components/FitBadge";
import { Pager } from "@/components/layout/ListControls";
import { EmptyState } from "@/components/layout/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useApplicantDecision, useApplicationQueue } from "@/hooks/useRecruiterWorkspace";

/**
 * The recruiter's cross-job queue (Project D): every application on every
 * role they own, newest first, one screen.
 *
 * Structurally the per-job Applicants table plus a Job column — the row
 * shape is the same DTO extended with the posting, and the decision menu is
 * the same mutation. The Job column links to the per-job screen, which stays
 * the place for one role's ranked view.
 */
export function QueueApplicants() {
  const { data, isPending, isError, error, setPage } = useApplicationQueue();
  const decide = useApplicantDecision(undefined);

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
      description={
        data ? `${data.total} ${data.total === 1 ? "person" : "people"} across all your roles.` : undefined
      }
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
          description="Applications to any of your roles appear here, newest first."
        />
      ) : (
        <div className="hidden sm:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Email</TableHead>
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
                    <TableCell>
                      {item.jobId ? (
                        <Link
                          to={`/hire/jobs/${item.jobId}/applicants`}
                          className="text-signal-text hover:underline"
                        >
                          {item.jobTitle}
                        </Link>
                      ) : (
                        item.jobTitle || "—"
                      )}
                      {item.companyName ? (
                        <span className="ml-2 text-xs text-ink-muted">{item.companyName}</span>
                      ) : null}
                    </TableCell>
                    <TableCell>{item.email}</TableCell>
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
                        <DecisionMenu
                          fullName={item.fullName}
                          current={item.status}
                          onDecide={(next) => void onDecide(item.applicationId, next)}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {data && data.items.length > 0 ? (
        /* The small-screen rendering: one card per application, with the job
           it belongs to — the whole point of this screen — leading the card. */
        <ul
          aria-label="Applicant queue"
          className="mt-4 divide-y divide-line rounded-surface border border-line bg-paper-raised sm:hidden"
        >
          {data.items.map((item) => {
            const status = statusMeta(item.status);
            const StatusIcon = status.Icon;
            const closed = isTerminal(item.status);
            return (
              <li key={item.applicationId} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 break-words font-medium text-ink">{item.fullName}</p>
                  <Badge variant={status.variant}>
                    <StatusIcon aria-hidden="true" className="size-3" />
                    {status.label}
                  </Badge>
                </div>
                <p className="mt-1 break-words text-sm text-ink-muted">
                  {item.jobId ? (
                    <Link
                      to={`/hire/jobs/${item.jobId}/applicants`}
                      className="text-signal-text hover:underline"
                    >
                      {item.jobTitle}
                    </Link>
                  ) : (
                    item.jobTitle || "—"
                  )}
                  {item.companyName ? ` · ${item.companyName}` : ""}
                </p>
                <p className="mt-1 break-words text-sm text-ink-muted">{item.email}</p>
                <p className="mt-2 text-xs text-ink-muted">
                  Applied <span className="font-mono">{item.appliedAt.split("T")[0]}</span>
                  {item.fit ? ` · ${Math.round(item.fit.score)}% fit` : ""}
                </p>
                {item.resumeUrl ? (
                  <a
                    className="mt-2 inline-block text-sm text-signal-text underline"
                    href={item.resumeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {item.resumeName ?? "Resume"}
                  </a>
                ) : null}
                {closed ? null : (
                  <div className="mt-3">
                    <DecisionMenu
                      fullName={item.fullName}
                      current={item.status}
                      onDecide={(next) => void onDecide(item.applicationId, next)}
                      trigger="labelled"
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </HireShell>
  );
}

export default QueueApplicants;
