import { Briefcase, Edit2, Eye, MoreHorizontal, Plus } from "lucide-react";
import { useNavigate } from "react-router";

import HireShell from "./HireShell";
import { ListControls, Pager } from "@/components/layout/ListControls";
import { EmptyState } from "@/components/layout/EmptyState";
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
import { useOwnedJobs } from "@/hooks/useRecruiterWorkspace";

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
 */
export function WorkspaceJobs() {
  const navigate = useNavigate();
  const { data, isPending, isError, error, keyword, setKeyword, setPage } = useOwnedJobs();

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
              <TableHead>Type</TableHead>
              <TableHead>Posted</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((job) => (
              <TableRow key={job.id}>
                <TableCell className="font-medium">{job.title}</TableCell>
                <TableCell>{job.company?.name ?? "—"}</TableCell>
                <TableCell>{job.jobType}</TableCell>
                <TableCell className="font-mono text-sm">
                  {job.createdAt.split("T")[0]}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" aria-label={`Actions for ${job.title}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() => navigate(`/hire/companies/${job.company?.id ?? ""}`)}
                      >
                        <Edit2 />
                        Edit company
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => navigate(`/hire/jobs/${job.id}/applicants`)}
                      >
                        <Eye />
                        Applicants
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </HireShell>
  );
}

export default WorkspaceJobs;
