import { useState } from "react";
import { ChevronDown, Undo2 } from "lucide-react";
import { toast } from "sonner";
import type { AppliedJobDto } from "@jobportal/shared";
import { isTerminal } from "@jobportal/shared";

import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { Pager } from "./layout/ListControls";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { statusMeta } from "@/lib/applicationStatus";
import { getApiErrorMessage } from "@/lib/apiError";
import { useAppliedJobs, useWithdrawApplication } from "@/hooks/useAppliedJobs";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function StatusBadge({ status }: { status: string }) {
  const { variant, Icon, label } = statusMeta(status);
  return (
    <Badge variant={variant}>
      <Icon aria-hidden="true" />
      {label}
    </Badge>
  );
}

/**
 * One application's transitions, oldest first.
 *
 * Collapsed by default and per-row: a timeline open on every row at once turns
 * the table into a wall, and the status badge already answers the question most
 * visits are asking.
 */
function Timeline({ history }: { history: AppliedJobDto["history"] }) {
  if (history.length === 0) return null;
  return (
    <ol className="mt-3 grid gap-2 border-l border-line pl-4">
      {history.map((event, index) => {
        const { Icon, label, description } = statusMeta(event.status);
        return (
          <li key={`${event.status}-${event.at}-${index}`} className="flex items-start gap-2">
            <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-muted" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{label}</p>
              <p className="text-xs leading-5 text-ink-muted">{description}</p>
            </div>
            <time className="ml-auto shrink-0 font-mono text-xs text-ink-muted" dateTime={event.at}>
              {dateFormatter.format(new Date(event.at))}
            </time>
          </li>
        );
      })}
    </ol>
  );
}

const AppliedJobTable = () => {
  const { data, isPending, isError, error, page, setPage } = useAppliedJobs();
  const withdraw = useWithdrawApplication();
  const [open, setOpen] = useState<string | null>(null);

  const onWithdraw = async (id: string) => {
    try {
      await withdraw.mutateAsync(id);
      toast.success("Application withdrawn");
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not withdraw the application"));
    }
  };

  if (isPending) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-12 rounded-surface" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p role="alert" className="text-sm text-danger-text">
        Could not load your applications: {error instanceof Error ? error.message : "unknown error"}
      </p>
    );
  }

  return (
    <>
      <Table>
        <TableCaption>List of jobs you have applied for</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Job Role</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5}>No applied jobs found</TableCell>
            </TableRow>
          ) : (
            data.items.map((appliedJob) => {
              const expanded = open === appliedJob.id;
              const closed = isTerminal(appliedJob.status);
              return (
                <TableRow key={appliedJob.id}>
                  <TableCell className="align-top">
                    {appliedJob.appliedAt.split("T")[0]}
                  </TableCell>
                  <TableCell className="align-top">{appliedJob.job?.title}</TableCell>
                  <TableCell className="align-top">{appliedJob.job?.company?.name}</TableCell>
                  <TableCell className="align-top">
                    <StatusBadge status={appliedJob.status} />
                    {expanded ? <Timeline history={appliedJob.history} /> : null}
                  </TableCell>
                  <TableCell className="align-top text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-expanded={expanded}
                        onClick={() => setOpen(expanded ? null : appliedJob.id)}
                      >
                        <ChevronDown
                          aria-hidden="true"
                          className={`size-4 transition-transform duration-(--dur-fast) ${
                            expanded ? "rotate-180" : ""
                          }`}
                        />
                        {expanded ? "Hide" : "History"}
                      </Button>
                      {/*
                        Withdraw is absent once the application is closed rather
                        than present-and-disabled: the API answers a second
                        withdrawal with 409, so a control that cannot succeed
                        should not be offered.
                      */}
                      {closed ? null : (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={withdraw.isPending}
                          onClick={() => void onWithdraw(appliedJob.id)}
                          aria-label={`Withdraw application for ${appliedJob.job?.title ?? "this role"}`}
                        >
                          <Undo2 aria-hidden="true" className="size-4" />
                          Withdraw
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
      <div className="mt-4">
        <Pager page={page} pages={data.pages} total={data.total} onPage={setPage} />
      </div>
    </>
  );
};

export default AppliedJobTable;
