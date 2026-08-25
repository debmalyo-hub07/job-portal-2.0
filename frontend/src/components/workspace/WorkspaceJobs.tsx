import { useState } from "react";
import { Briefcase, CircleSlash, Edit2, Eye, MoreHorizontal, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import type { JobDto } from "@jobportal/shared";

import HireShell from "./HireShell";
import { ListControls, Pager } from "@/components/layout/ListControls";
import { EmptyState } from "@/components/layout/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
import { jobStatusMeta } from "@/lib/jobStatus";
import { useJobDelete, useJobStatus, useOwnedJobs } from "@/hooks/useRecruiterWorkspace";

/**
 * The recruiter's own jobs.
 *
 * The keyword is a server parameter, not a browser filter: this list paginates,
 * and filtering the current page while presenting itself as searching
 * everything is the bug 2B-2 closed on the seeker side.
 *
 * The row menu is a DropdownMenu rather than a Popover full of `<div onClick>`.
 * The inherited version's actions had no role, no tabIndex and no focus ring —
 * they worked for a mouse and did not exist for a keyboard.
 *
 * Closed roles stay in this list. Closing is not deleting, and a recruiter who
 * could no longer see a role they closed would have no way to reopen it.
 */
export function WorkspaceJobs() {
  const navigate = useNavigate();
  const { data, isPending, isError, error, keyword, setKeyword, setPage } = useOwnedJobs();
  const setStatus = useJobStatus();
  const deleteJob = useJobDelete();

  // One dialog, driven by whichever row asked for it — a dialog per row would
  // mount one Radix portal per job on the page.
  const [closing, setClosing] = useState<JobDto | null>(null);
  const [deleting, setDeleting] = useState<JobDto | null>(null);

  const confirmClose = async () => {
    if (!closing) return;
    const next = closing.status === "closed" ? "open" : "closed";
    try {
      await setStatus.mutateAsync({ jobId: closing.id, status: next });
      toast.success(next === "closed" ? "Role closed" : "Role reopened");
      setClosing(null);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not change this role's status"));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteJob.mutateAsync(deleting.id);
      toast.success("Job deleted");
      setDeleting(null);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not delete this job"));
    }
  };

  return (
    <HireShell
      title="Jobs"
      description="Roles you have posted."
      actions={
        <Button variant="signal" onClick={() => navigate("/hire/jobs/create")}>
          <Plus data-icon="inline-start" />
          Post a job
        </Button>
      }
    >
      <ListControls label="Search jobs" keyword={keyword} onKeyword={setKeyword}>
        {data ? (
          <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
        ) : null}
      </ListControls>

      {isPending ? (
        <div className="grid gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12 rounded-surface" />
          ))}
        </div>
      ) : isError ? (
        <p role="alert" className="text-sm text-danger-text">
          Could not load your jobs: {error instanceof Error ? error.message : "unknown error"}
        </p>
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={keyword ? "No jobs match that search" : "No jobs posted yet"}
          description={
            keyword
              ? "Try a different title or keyword."
              : "Post your first role and it will appear on the job board."
          }
          action={
            keyword ? undefined : (
              <Button onClick={() => navigate("/hire/jobs/create")}>Post a job</Button>
            )
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Role</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Applicants</TableHead>
              <TableHead>Posted</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((job) => {
              const status = jobStatusMeta(job.status);
              const closed = job.status === "closed";
              // Absent means the API did not send counts, which is a bug rather
              // than a job with none — treat it as "unknown" and let the API
              // refuse the delete, rather than offering an action that 409s.
              const counts = job.applications;
              const deletable = counts?.total === 0;
              return (
                <TableRow key={job.id}>
                  <TableCell className="font-medium">{job.title}</TableCell>
                  <TableCell>{job.company?.name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={status.variant}>
                      <status.Icon aria-hidden="true" />
                      {status.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {counts ? (
                      // The active count is what makes a closed role's limbo
                      // visible: those candidates are still waiting on a
                      // decision for a role that has left the board.
                      <>
                        {counts.total}
                        {closed && counts.active > 0 ? (
                          <span className="ml-2 font-sans text-xs text-warn-text">
                            {counts.active} awaiting a decision
                          </span>
                        ) : null}
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{job.createdAt.split("T")[0]}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" aria-label={`Actions for ${job.title}`}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => navigate(`/hire/jobs/${job.id}`)}>
                          <Edit2 />
                          Edit job
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => navigate(`/hire/jobs/${job.id}/applicants`)}
                        >
                          <Eye />
                          Applicants
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setClosing(job)}>
                          {closed ? <RotateCcw /> : <CircleSlash />}
                          {closed ? "Reopen role" : "Close role"}
                        </DropdownMenuItem>
                        {/* Disabled rather than absent, with the reason in the
                            accessible name: a recruiter looking for Delete
                            needs to learn that applicants are what prevents it,
                            not that the control does not exist. */}
                        <DropdownMenuItem
                          disabled={!deletable}
                          onSelect={() => setDeleting(job)}
                          aria-label={
                            deletable
                              ? `Delete ${job.title}`
                              : `Cannot delete ${job.title} — candidates have applied`
                          }
                        >
                          <Trash2 />
                          {deletable ? "Delete job" : "Delete (has applicants)"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <ConfirmDialog
        open={closing !== null}
        onOpenChange={(open) => (open ? null : setClosing(null))}
        title={closing?.status === "closed" ? "Reopen this role?" : "Close this role?"}
        description={
          closing?.status === "closed"
            ? `"${closing?.title}" goes back on the job board and starts accepting applications again.`
            : `"${closing?.title}" leaves the job board and stops accepting applications.` +
              (closing?.applications?.active
                ? ` ${closing.applications.active} candidate${closing.applications.active === 1 ? "" : "s"} still awaiting a decision will stay in your applicant list — closing does not reject anyone.`
                : "")
        }
        confirmLabel={closing?.status === "closed" ? "Reopen role" : "Close role"}
        pending={setStatus.isPending}
        onConfirm={confirmClose}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => (open ? null : setDeleting(null))}
        title="Delete this job?"
        description={`"${deleting?.title}" is removed permanently. This cannot be undone.`}
        confirmLabel="Delete job"
        destructive
        pending={deleteJob.isPending}
        onConfirm={confirmDelete}
      />
    </HireShell>
  );
}

export default WorkspaceJobs;
