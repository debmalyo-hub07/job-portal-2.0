import { Briefcase } from "lucide-react";

import AdminShell from "./AdminShell";
import { ListControls, Pager } from "./ListControls";
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
import { useAdminJobs } from "@/hooks/useAdminConsole";

/**
 * Every job on the platform, newest first.
 *
 * The recruiter's own workspace list (`/hire/jobs`) shows only their jobs. This
 * is the cross-tenant view, which is why it carries `recruiterEmail` — the
 * field the public `JobDto` withholds and the admin's first question needs.
 */
export function AdminJobsConsole() {
  const { data, isPending, isError, error, keyword, setKeyword, setPage } = useAdminJobs();

  return (
    <AdminShell title="Jobs" description="Every role posted across all recruiters.">
      <ListControls label="Search jobs" keyword={keyword} onKeyword={setKeyword}>
        {data ? (
          <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
        ) : null}
      </ListControls>

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12 rounded-surface" />
          ))}
        </div>
      ) : isError ? (
        <p role="alert" className="text-sm text-danger">
          Could not load jobs: {error instanceof Error ? error.message : "unknown error"}
        </p>
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={keyword ? "No jobs match that search" : "No jobs posted yet"}
          description={
            keyword ? "Try a different name or location." : "Approved recruiters can post roles."
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Posted by</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">Applicants</TableHead>
                <TableHead>Posted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="font-medium">
                    {job.title}
                    <Badge variant="outline" className="ml-2">
                      {job.jobType}
                    </Badge>
                  </TableCell>
                  <TableCell>{job.companyName ?? "—"}</TableCell>
                  <TableCell>{job.recruiterEmail ?? "—"}</TableCell>
                  <TableCell>{job.location}</TableCell>
                  <TableCell className="text-right font-mono">{job.applicationCount}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {job.createdAt.split("T")[0]}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </AdminShell>
  );
}

export default AdminJobsConsole;
