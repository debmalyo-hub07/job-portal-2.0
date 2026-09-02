import { useEffect, useState } from "react";
import { MoreHorizontal, Users } from "lucide-react";
import { useParams } from "react-router";
import { toast } from "sonner";
import type { ApplicantDto, BulkSkipReason } from "@jobportal/shared";
import { ACTIVE_STATUSES, RECRUITER_SETTABLE, TERMINAL_STATUSES, isTerminal } from "@jobportal/shared";

import HireShell from "./HireShell";
import { FitBadge } from "@/components/FitBadge";
import { Pager } from "@/components/layout/ListControls";
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
import { statusMeta } from "@/lib/applicationStatus";
import {
  useApplicantDecision,
  useApplicants,
  useBulkApplicantDecision,
} from "@/hooks/useRecruiterWorkspace";

/** The skip reasons a bulk result can carry, in words a recruiter reads. */
const SKIP_COPY: Record<BulkSkipReason, string> = {
  TERMINAL: "already closed",
  SAME_STATUS: "already at that stage",
  NOT_FOUND: "no longer available",
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
 *
 * Fit is server-owned. The API scores every applicant against this job and sorts
 * the complete set before pagination, so this table explains the order instead
 * of recomputing a second version of the business rule.
 *
 * Bulk is a shortcut through the same rules, not a different rule: the batch
 * posts to one endpoint that applies each row through the single move's state
 * machine and reports every refusal, so the toast can be honest about both
 * halves.
 */
export function Applicants() {
  const params = useParams();
  const { data, isPending, isError, error, page, setPage } = useApplicants(params.id);
  const decide = useApplicantDecision(params.id);
  const bulk = useBulkApplicantDecision(params.id);

  // Selection is client state, page-scoped: the ranked list re-orders under a
  // decision, so ids from another page are stale by definition once it turns.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingStage, setPendingStage] = useState<(typeof RECRUITER_SETTABLE)[number] | null>(
    null,
  );
  useEffect(() => {
    setSelected(new Set());
  }, [page]);

  const pageIds = data?.items.map((item) => item.applicationId) ?? [];
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  const toggleOne = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((current) => {
      const next = new Set(current);
      if (allSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

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

  // The honest result: both halves of the batch, in one toast.
  const onBulkMove = async () => {
    if (pendingStage === null || selected.size === 0) return;
    try {
      const result = await bulk.mutateAsync({
        applicationIds: [...selected],
        status: pendingStage,
      });
      const parts = [`Moved ${result.moved} to ${statusMeta(pendingStage).label}`];
      if (result.skipped.length > 0) {
        const reasons = [...new Set(result.skipped.map((s) => s.reason))]
          .map((reason) => SKIP_COPY[reason])
          .join(", ");
        parts.push(`${result.skipped.length} skipped — ${reasons}`);
      }
      toast.success(parts.join(" · "));
      setSelected(new Set());
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not move applicants"));
    } finally {
      setPendingStage(null);
    }
  };

  const selectedLabel = `${selected.size} ${selected.size === 1 ? "applicant" : "applicants"}`;

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
      {data?.funnel ? (
        /* P5's funnel: where everyone stands, across every page. Server-owned
           for the same reason the fit ordering is — the list below paginates
           after ranking, so a client-side count would describe a slice. */
        <ol
          aria-label="Pipeline"
          className="mb-4 flex flex-wrap items-baseline gap-x-5 gap-y-1 rounded-surface border border-line bg-paper-raised px-4 py-3"
        >
          {ACTIVE_STATUSES.map((status) => (
            <li key={status} className="flex items-baseline gap-1.5">
              <span className="font-mono text-sm font-semibold tabular-nums text-ink">
                {data.funnel[status]}
              </span>
              <span className="text-xs text-ink-muted">{statusMeta(status).label}</span>
            </li>
          ))}
          <li aria-hidden="true" className="hidden h-4 w-px bg-line sm:block" />
          {TERMINAL_STATUSES.map((status) => (
            <li key={status} className="flex items-baseline gap-1.5">
              <span className="font-mono text-sm font-semibold tabular-nums text-ink-faint">
                {data.funnel[status]}
              </span>
              <span className="text-xs text-ink-faint">{statusMeta(status).label}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {selected.size > 0 ? (
        /* The bulk bar: count, destination, clear. Selecting a stage opens the
           confirmation dialog — a mass decision is never one click. */
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-surface border border-line bg-paper-raised px-4 py-3">
          <span className="text-sm font-medium text-ink">{selected.size} selected</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Move to…
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {/* Every settable stage, including ones some rows already hold:
                  bulk reports those as skips rather than hiding them, because
                  the rows in a batch do not share one current status. */}
              {RECRUITER_SETTABLE.map((next) => {
                const meta = statusMeta(next);
                const NextIcon = meta.Icon;
                return (
                  <DropdownMenuItem key={next} onSelect={() => setPendingStage(next)}>
                    <NextIcon className="size-4" />
                    {meta.label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      ) : null}
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
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  aria-label="Select every applicant on this page"
                  checked={allSelected}
                  onChange={toggleAll}
                  ref={(el) => {
                    // Native checkboxes have no `indeterminate` attribute and
                    // React does not manage the property — the ref is the one
                    // way to show some-but-not-all.
                    if (el) el.indeterminate = selected.size > 0 && !allSelected;
                  }}
                  className="size-4 rounded accent-[var(--signal-text)]"
                />
              </TableHead>
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
              // one with 409, so the menu is not offered at all. It stays
              // selectable: a select-all batch reports it as a skip, which is
              // the honest result, not a hidden one.
              const closed = isTerminal(item.status);
              return (
                <TableRow
                  key={item.applicationId}
                  data-state={selected.has(item.applicationId) ? "selected" : undefined}
                >
                  <TableCell>
                    <input
                      type="checkbox"
                      aria-label={`Select ${item.fullName}`}
                      checked={selected.has(item.applicationId)}
                      onChange={() => toggleOne(item.applicationId)}
                      className="size-4 rounded accent-[var(--signal-text)]"
                    />
                  </TableCell>
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
      <ConfirmDialog
        open={pendingStage !== null}
        onOpenChange={(open) => {
          if (!open) setPendingStage(null);
        }}
        title={`Move ${selectedLabel}`}
        description={
          pendingStage
            ? `Move ${selectedLabel} to ${statusMeta(pendingStage).label}? Each moved candidate is emailed exactly as a single move emails them.`
            : ""
        }
        confirmLabel="Move"
        destructive={pendingStage === "rejected"}
        pending={bulk.isPending}
        onConfirm={() => void onBulkMove()}
      />
    </HireShell>
  );
}

export default Applicants;
