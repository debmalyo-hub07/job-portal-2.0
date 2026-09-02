import { Bookmark, BookmarkMinus } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";

import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { EmptyState } from "./layout/EmptyState";
import { Pager } from "./layout/ListControls";
import PageShell from "./layout/PageShell";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { getApiErrorMessage } from "@/lib/apiError";
import { useSavedJobs, useUnsaveJob } from "@/hooks/useSavedJobs";

/**
 * The seeker's shortlist: roles saved from their pages, newest first.
 *
 * Dead rows stay and are marked — a posting deleted after saving renders "No
 * longer available" (the applied list's stance: the seeker's record is
 * theirs), and a closed role keeps its row with the facts it had. Unsave is
 * the only write, and it targets the stored job id so a dead row is
 * removable exactly like a live one.
 */
export function SavedJobs() {
  const { data, isPending, isError, error, page, setPage } = useSavedJobs();
  const unsave = useUnsaveJob();

  const onUnsave = async (jobId: string) => {
    try {
      await unsave.mutateAsync(jobId);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not remove this role"));
    }
  };

  return (
    <PageShell width="wide" motion="standard" className="pt-8">
      <header className="border-b border-line pb-7">
        <p className="text-xs font-semibold uppercase text-signal-text">Your shortlist</p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-ink sm:text-5xl">
          Saved roles
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-ink-muted">
          {data
            ? `${data.total} ${data.total === 1 ? "role" : "roles"} saved — the ones you're still deciding on.`
            : "Roles you save from their pages wait for you here."}
        </p>
      </header>

      {isPending ? (
        <div className="mt-8 space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-14 rounded-surface" />
          ))}
        </div>
      ) : isError ? (
        <p role="alert" className="mt-8 text-sm text-danger-text">
          Could not load your saved roles:{" "}
          {error instanceof Error ? error.message : "unknown error"}
        </p>
      ) : data.items.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={Bookmark}
            title="No saved roles yet"
            description="Save roles from their pages and they'll wait for you here."
            action={
              <Button asChild variant="signal">
                <Link to="/jobs">Browse open roles</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-8">
          <Table>
            <TableCaption>Roles you have saved</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Salary</TableHead>
                <TableHead>Saved</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((item) => {
                // `?? "open"` for the same reason the detail page reads it:
                // a job row written before the field existed is open.
                const closed = (item.job?.status ?? "open") === "closed";
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.job ? (
                        <Link
                          className="text-ink hover:text-signal-text"
                          to={`/description/${item.job.id}`}
                        >
                          {item.job.title}
                          <span className="block text-xs font-normal text-ink-muted">
                            {item.job.company?.name}
                          </span>
                        </Link>
                      ) : (
                        <span className="text-ink-muted">No longer available</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.job ? (item.job.remote ? "Remote" : item.job.location) : "—"}
                    </TableCell>
                    <TableCell>{item.job ? `INR ${item.job.salary} LPA` : "—"}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {item.savedAt.split("T")[0]}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {item.applied ? <Badge variant="secondary">Applied</Badge> : null}
                        {closed ? <Badge variant="outline">Closed</Badge> : null}
                        {!item.applied && !closed ? (
                          <span className="text-ink-muted">—</span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={unsave.isPending}
                        aria-label={
                          item.job ? `Remove ${item.job.title} from saved` : "Remove from saved"
                        }
                        onClick={() => void onUnsave(item.jobId)}
                      >
                        <BookmarkMinus aria-hidden="true" />
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="mt-4">
            <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
          </div>
        </div>
      )}
    </PageShell>
  );
}

export default SavedJobs;
