import { useState } from "react";
import { History, ShieldOff, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";

import AdminShell from "./AdminShell";
import AccountHistoryDialog from "./AccountHistoryDialog";
import { ListControls, Pager } from "@/components/layout/ListControls";
import { EmptyState } from "@/components/layout/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminSeekers, useAccountStatusChange } from "@/hooks/useAdminConsole";
import { getApiErrorMessage } from "@/lib/apiError";

/**
 * Candidate oversight (Project D): every seeker on the platform, with the two
 * actions the console was missing — suspend with a reason, reinstate — and
 * the history of every decision.
 *
 * The derived `minor` badge is the one consent-era signal a moderation
 * decision might want; the DOB itself stays in the seeker's own portal.
 */
export function AdminSeekers() {
  const { data, isPending, isError, error, keyword, setKeyword, setPage } = useAdminSeekers();
  const statusChange = useAccountStatusChange();
  const [suspending, setSuspending] = useState<{ id: string; label: string } | null>(null);
  const [reason, setReason] = useState("");
  const [historyFor, setHistoryFor] = useState<{ id: string; label: string } | null>(null);

  const closeSuspend = () => {
    setSuspending(null);
    setReason("");
  };

  const submitSuspend = () => {
    if (!suspending || !reason.trim()) return;
    const target = suspending;
    statusChange.mutate(
      { portal: "seeker", id: target.id, action: "suspend", reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success(`Suspended ${target.label}.`);
          closeSuspend();
        },
        onError: (err) => toast.error(getApiErrorMessage(err, "Could not suspend")),
      },
    );
  };

  const reinstate = (id: string, label: string) => {
    statusChange.mutate(
      { portal: "seeker", id, action: "reinstate" },
      {
        onSuccess: () => toast.success(`Reinstated ${label}.`),
        onError: (err) => toast.error(getApiErrorMessage(err, "Could not reinstate")),
      },
    );
  };

  return (
    <AdminShell
      title="Candidates"
      description="Every candidate on the platform. Suspending an account stops its sessions and applications; the reason is shown to its owner at sign-in."
    >
      <ListControls label="Search candidates" keyword={keyword} onKeyword={setKeyword}>
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
        <p role="alert" className="text-sm text-danger-text">
          Could not load candidates: {error instanceof Error ? error.message : "unknown error"}
        </p>
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={Users}
          title={keyword ? "No candidates match that search" : "No candidates yet"}
          description={keyword ? "Try a different name or email." : "Candidates appear here as they register."}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Applications</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((seeker) => (
              <TableRow key={seeker.id}>
                <TableCell className="font-medium">
                  {seeker.fullName}
                  {seeker.minor ? (
                    <Badge variant="warn" className="ml-2">
                      Under 18
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell>{seeker.email}</TableCell>
                <TableCell>
                  {seeker.status === "active" ? (
                    <Badge variant="ok">Active</Badge>
                  ) : (
                    <Badge variant="danger">Suspended</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono">{seeker.applicationCount}</TableCell>
                <TableCell className="font-mono text-sm">
                  {seeker.createdAt.split("T")[0]}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setHistoryFor({ id: seeker.id, label: seeker.fullName })}
                    >
                      <History className="size-4" />
                      History
                    </Button>
                    {seeker.status === "active" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={statusChange.isPending}
                        onClick={() => setSuspending({ id: seeker.id, label: seeker.fullName })}
                      >
                        <ShieldOff className="size-4" />
                        Suspend
                      </Button>
                    ) : (
                      <Button
                        variant="signal"
                        size="sm"
                        disabled={statusChange.isPending}
                        onClick={() => reinstate(seeker.id, seeker.fullName)}
                      >
                        <ShieldCheck className="size-4" />
                        Reinstate
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={suspending !== null} onOpenChange={(open) => !open && closeSuspend()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend this account?</DialogTitle>
            <DialogDescription>
              {suspending?.label} will be signed out everywhere and unable to sign in or apply.
              Their applications stay as they are. The reason below is shown to them at sign-in and
              emailed to them.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="suspend-reason">Reason</Label>
            <Input
              id="suspend-reason"
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Repeatedly spamming applications."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeSuspend}>
              Cancel
            </Button>
            <Button
              variant="signal"
              disabled={!reason.trim() || statusChange.isPending}
              onClick={submitSuspend}
            >
              Suspend
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AccountHistoryDialog portal="seeker" account={historyFor} onClose={() => setHistoryFor(null)} />
    </AdminShell>
  );
}

export default AdminSeekers;
