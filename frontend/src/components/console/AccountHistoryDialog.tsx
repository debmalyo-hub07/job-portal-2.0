import { History, Loader2 } from "lucide-react";
import type { AccountEventDto } from "@jobportal/shared";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/layout/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccountEvents } from "@/hooks/useAdminConsole";

/** The four event kinds, as the history renders them. */
const KIND_META: Record<
  AccountEventDto["kind"],
  { label: string; tone: "signal" | "secondary" | "danger" | "outline" }
> = {
  approved: { label: "Approved", tone: "signal" },
  reinstated: { label: "Reinstated", tone: "signal" },
  denied: { label: "Denied", tone: "danger" },
  suspended: { label: "Suspended", tone: "danger" },
};

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * The per-account status history dialog (Project D), shared by the seekers
 * and recruiters screens — the record of every oversight decision, newest
 * first, with the reason and the acting admin.
 *
 * Read-only by design: correcting a decision is a new decision (reinstate),
 * never an edit. An editable history is a rewritten one.
 */
export function AccountHistoryDialog({
  portal,
  account,
  onClose,
}: {
  portal: "seeker" | "recruiter";
  account: { id: string; label: string } | null;
  onClose: () => void;
}) {
  const { data, isPending, isError, error } = useAccountEvents(
    account ? portal : null,
    account?.id ?? null,
  );

  return (
    <Dialog open={account !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Status history</DialogTitle>
          <DialogDescription>
            Every oversight decision for {account?.label ?? "this account"}, newest first.
          </DialogDescription>
        </DialogHeader>

        {isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-12 rounded-surface" />
            ))}
          </div>
        ) : isError ? (
          <p role="alert" className="text-sm text-danger-text">
            Could not load the history: {error instanceof Error ? error.message : "unknown error"}
          </p>
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={History}
            title="No decisions recorded"
            description="Nothing has ever been approved, denied, suspended or reinstated for this account."
          />
        ) : (
          <ol className="max-h-96 space-y-3 overflow-y-auto">
            {data.map((event) => {
              const meta = KIND_META[event.kind];
              return (
                <li
                  key={event.id}
                  className="rounded-surface border border-line bg-paper-raised p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant={meta.tone}>{meta.label}</Badge>
                    <span className="font-mono text-xs text-ink-muted">
                      {dateFormatter.format(new Date(event.at))}
                    </span>
                  </div>
                  {event.reason ? (
                    <p className="mt-2 text-sm leading-6 text-ink">{event.reason}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-ink-muted">
                    {event.actorEmail ? `By ${event.actorEmail}` : "By script"}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default AccountHistoryDialog;
