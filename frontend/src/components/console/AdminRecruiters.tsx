import { useState } from "react";
import { Inbox } from "lucide-react";
import { toast } from "sonner";

import AdminShell from "./AdminShell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/layout/EmptyState";
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
import { usePendingRecruiters, useRecruiterDecision } from "@/hooks/useAdminConsole";
import { getApiErrorMessage } from "@/lib/apiError";

/**
 * The approval queue.
 *
 * This screen is why the console exists: recruiters register `pending` and
 * `requireApproved` gates every recruiter mutation, so until something called
 * these endpoints, approval could only be driven with curl.
 *
 * Approve is one click. Deny takes a reason, because it is the outcome the
 * recruiter cannot resolve by waiting and it sends them an email — a denial
 * they cannot interpret is indistinguishable from the queue being broken.
 */
export function AdminRecruiters() {
  const { data, isPending, isError, error } = usePendingRecruiters();
  const decision = useRecruiterDecision();
  const [denying, setDenying] = useState<{ id: string; email: string } | null>(null);
  const [reason, setReason] = useState("");

  const closeDeny = () => {
    setDenying(null);
    setReason("");
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

  return (
    <AdminShell
      title="Recruiters"
      description="Recruiters awaiting approval, oldest first. Approving lets them create a company and post roles."
    >
      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-14 rounded-surface" />
          ))}
        </div>
      ) : isError ? (
        <p role="alert" className="text-sm text-danger-text">
          Could not load the queue: {error instanceof Error ? error.message : "unknown error"}
        </p>
      ) : data.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Nothing waiting"
          description="Every recruiter who has registered is already approved or denied."
        />
      ) : (
        /* The table scrolls inside its own container rather than the page:
           at 375px the email column alone is wider than the viewport. */
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Registered</TableHead>
                <TableHead className="text-right">Decision</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((recruiter) => (
                <TableRow key={recruiter.id}>
                  <TableCell className="font-medium">{recruiter.fullName}</TableCell>
                  <TableCell>{recruiter.email}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {recruiter.createdAt.split("T")[0]}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="signal"
                        size="sm"
                        disabled={decision.isPending}
                        onClick={() => approve(recruiter.id, recruiter.email)}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={decision.isPending}
                        onClick={() =>
                          setDenying({ id: recruiter.id, email: recruiter.email })
                        }
                      >
                        Deny
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={denying !== null} onOpenChange={(open) => !open && closeDeny()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deny this recruiter?</DialogTitle>
            <DialogDescription>
              {denying?.email} will be emailed the reason below and will not be able to post
              roles.
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
    </AdminShell>
  );
}

export default AdminRecruiters;
