import { useState } from "react";
import { Check, History, Inbox, ShieldCheck, ShieldOff, X } from "lucide-react";
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
import {
  useAccountStatusChange,
  useAdminRecruiters,
  useRecruiterDecision,
} from "@/hooks/useAdminConsole";
import { getApiErrorMessage } from "@/lib/apiError";

/**
 * Recruiter monitoring (Project D): every recruiter on the platform — pending,
 * active and suspended — where the approval queue used to show only pending.
 *
 * One table, three row shapes: pending rows carry Approve/Deny (the queue's
 * own actions, unchanged), active rows carry Suspend, suspended rows carry
 * Reinstate. The history dialog is shared with the candidates screen.
 */
export function AdminRecruiters() {
  const { data, isPending, isError, error, keyword, setKeyword, setPage } = useAdminRecruiters();
  const decision = useRecruiterDecision();
  const statusChange = useAccountStatusChange();

  const [denying, setDenying] = useState<{ id: string; email: string } | null>(null);
  const [reason, setReason] = useState("");
  const [suspending, setSuspending] = useState<{ id: string; email: string } | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [historyFor, setHistoryFor] = useState<{ id: string; label: string } | null>(null);

  const closeDeny = () => {
    setDenying(null);
    setReason("");
  };
  const closeSuspend = () => {
    setSuspending(null);
    setSuspendReason("");
  };

  const approve = (id: string, email: string) => {
    decision.mutate(
      { id, action: "approve" },
      {
        onSuccess: () => toast.success(`Approved ${email}.`),
        onError: (err) => toast.error(getApiErrorMessage(err, "Could not approve")),
      },
    );
  };

  const submitDeny = () => {
    if (!denying || !reason.trim()) return;
    const { id, email } = denying;
    decision.mutate(
      { id, action: "deny", reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success(`Denied ${email}.`);
          closeDeny();
        },
        onError: (err) => toast.error(getApiErrorMessage(err, "Could not deny")),
      },
    );
  };

  const submitSuspend = () => {
    if (!suspending || !suspendReason.trim()) return;
    const { id, email } = suspending;
    statusChange.mutate(
      { portal: "recruiter", id, action: "suspend", reason: suspendReason.trim() },
      {
        onSuccess: () => {
          toast.success(`Suspended ${email}.`);
          closeSuspend();
        },
        onError: (err) => toast.error(getApiErrorMessage(err, "Could not suspend")),
      },
    );
  };

  const reinstate = (id: string, email: string) => {
    statusChange.mutate(
      { portal: "recruiter", id, action: "reinstate" },
      {
        onSuccess: () => toast.success(`Reinstated ${email}.`),
        onError: (err) => toast.error(getApiErrorMessage(err, "Could not reinstate")),
      },
    );
  };

  return (
    <AdminShell
      title="Recruiters"
      description="Every recruiter on the platform. Pending rows await approval; suspending an active recruiter blocks new applications to their roles and signs them out everywhere."
    >
      <ListControls label="Search recruiters" keyword={keyword} onKeyword={setKeyword}>
        {data ? (
          <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
        ) : null}
      </ListControls>

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-14 rounded-surface" />
          ))}
        </div>
      ) : isError ? (
        <p role="alert" className="text-sm text-danger-text">
          Could not load recruiters: {error instanceof Error ? error.message : "unknown error"}
        </p>
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={keyword ? "No recruiters match that search" : "No recruiters yet"}
          description={
            keyword ? "Try a different name or email." : "Recruiters appear here as they register."
          }
        />
      ) : (
        /* Table's own container scrolls rather than the page: at 375px the email
           column alone is wider than the viewport. */
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Jobs</TableHead>
              <TableHead className="text-right">Applications</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((recruiter) => (
              <TableRow key={recruiter.id}>
                <TableCell className="font-medium">{recruiter.fullName}</TableCell>
                <TableCell>{recruiter.email}</TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    {recruiter.status === "pending" ? (
                      <Badge variant="warn">Pending</Badge>
                    ) : recruiter.status === "active" ? (
                      <Badge variant="ok">Active</Badge>
                    ) : (
                      <Badge variant="danger">Suspended</Badge>
                    )}
                    {/* P4's assisted-review signals, on the rows that are
                        waiting for a decision — the same computation the
                        auto-tier gates on, surfaced for the human. */}
                    {recruiter.status === "pending" && recruiter.matchingCompany ? (
                      <Badge variant="ok">Matches {recruiter.matchingCompany}</Badge>
                    ) : null}
                    {recruiter.status === "pending" &&
                    !recruiter.matchingCompany &&
                    recruiter.emailDomainKind === "free" ? (
                      <Badge variant="outline">Free mail</Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono">{recruiter.jobCount}</TableCell>
                <TableCell className="text-right font-mono">{recruiter.applicationCount}</TableCell>
                <TableCell className="font-mono text-sm">
                  {recruiter.createdAt.split("T")[0]}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setHistoryFor({ id: recruiter.id, label: recruiter.fullName })}
                    >
                      <History className="size-4" />
                      History
                    </Button>
                    {recruiter.status === "pending" ? (
                      <>
                        <Button
                          variant="signal"
                          size="sm"
                          disabled={decision.isPending}
                          onClick={() => approve(recruiter.id, recruiter.email)}
                        >
                          <Check className="size-4" />
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={decision.isPending}
                          onClick={() => setDenying({ id: recruiter.id, email: recruiter.email })}
                        >
                          <X className="size-4" />
                          Deny
                        </Button>
                      </>
                    ) : recruiter.status === "active" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={statusChange.isPending}
                        onClick={() => setSuspending({ id: recruiter.id, email: recruiter.email })}
                      >
                        <ShieldOff className="size-4" />
                        Suspend
                      </Button>
                    ) : (
                      <Button
                        variant="signal"
                        size="sm"
                        disabled={statusChange.isPending}
                        onClick={() => reinstate(recruiter.id, recruiter.email)}
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

      <Dialog open={denying !== null} onOpenChange={(open) => !open && closeDeny()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deny this recruiter?</DialogTitle>
            <DialogDescription>
              {denying?.email} will be emailed the reason below and will not be able to post roles.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="deny-reason">Reason</Label>
            <Input
              id="deny-reason"
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
              placeholder="We could not verify this company."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDeny}>
              Cancel
            </Button>
            <Button
              variant="signal"
              disabled={!reason.trim() || decision.isPending}
              onClick={submitDeny}
            >
              Deny
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={suspending !== null} onOpenChange={(open) => !open && closeSuspend()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend this recruiter?</DialogTitle>
            <DialogDescription>
              {suspending?.email} will be signed out everywhere and unable to sign in. Their jobs
              stay live but stop accepting applications. The reason below is shown to them at
              sign-in and emailed to them.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="suspend-recruiter-reason">Reason</Label>
            <Input
              id="suspend-recruiter-reason"
              value={suspendReason}
              maxLength={500}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="Suspected fake postings."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeSuspend}>
              Cancel
            </Button>
            <Button
              variant="signal"
              disabled={!suspendReason.trim() || statusChange.isPending}
              onClick={submitSuspend}
            >
              Suspend
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AccountHistoryDialog
        portal="recruiter"
        account={historyFor}
        onClose={() => setHistoryFor(null)}
      />
    </AdminShell>
  );
}

export default AdminRecruiters;
