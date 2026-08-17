import { Building2, Briefcase, FileText, KeyRound, Loader2, UserCheck, Users } from "lucide-react";
import { Link } from "react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import AdminShell from "./AdminShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminOverview } from "@/hooks/useAdminConsole";
import { useCreateAdmin } from "@/hooks/useAdminConsole";
import { Reveal } from "@/lib/motion";
import { AnimatedNumber } from "@/lib/numberFlow";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormField } from "@/components/layout/FormField";
import { Input } from "@/components/ui/input";
import { getApiErrorMessage } from "@/lib/apiError";

/**
 * One counter. Geist Mono on the number because these are figures meant to be
 * compared down a column — the one use CLAUDE.md sanctions for the mono face.
 *
 * The figure animates on change. Approving a recruiter invalidates this query, so
 * the pending count drops while the admin is still looking at it: seeing 7 become
 * 6 is confirmation the action landed, which is the same job the toast does and
 * this does without asking for attention. On the `response` tier a `Reveal`
 * resolves to an opacity-only arrival — the whisper the tier exists to express.
 */
function StatTile({
  icon: Icon,
  label,
  value,
  emphasis = false,
  delay = 0,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  emphasis?: boolean;
  delay?: number;
}) {
  return (
    <Reveal delay={delay}>
      <div className="rounded-surface border border-line bg-paper-raised p-5 shadow-sm">
        <div className="flex items-center gap-2 text-ink-muted">
          <Icon aria-hidden="true" className="size-4" />
          <span className="text-sm font-medium">{label}</span>
        </div>
        <p
          className={
            emphasis && value > 0
              ? "mt-5 font-mono text-4xl font-semibold tabular-nums text-signal-text"
              : "mt-5 font-mono text-4xl font-semibold tabular-nums text-ink"
          }
        >
          <AnimatedNumber value={value} />
        </p>
      </div>
    </Reveal>
  );
}

/**
 * The console's landing page and the admin's post-login destination.
 *
 * Before this existed, `Login.tsx` sent a signed-in admin to `/`, the seeker job
 * board. The dashboard's whole job is answering "is there work waiting", so the
 * pending count is the one figure that carries the signal colour and the only
 * one with an action attached.
 */
export function AdminDashboard() {
  const { data, isPending, isError, error } = useAdminOverview();
  const createAdmin = useCreateAdmin();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({ fullName: "", email: "", provisioningKey: "" });

  const submitInvite = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createAdmin.mutate(invite, {
      onSuccess: (response) => {
        toast.success(response.message);
        setInvite({ fullName: "", email: "", provisioningKey: "" });
        setInviteOpen(false);
      },
      onError: (cause) => toast.error(getApiErrorMessage(cause, "Could not invite admin")),
    });
  };

  return (
    <AdminShell
      title="Console"
      description="Moderation and oversight across every portal."
      actions={
        <>
          <Button variant="outline" onClick={() => setInviteOpen(true)}>
            <KeyRound data-icon="inline-start" />
            Invite admin
          </Button>
          {data && data.recruiters.pending > 0 ? (
            <Button asChild variant="signal">
              <Link to="/admin/recruiters">
                Review {data.recruiters.pending} pending
              </Link>
            </Button>
          ) : null}
        </>
      }
    >
      {isPending ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-surface" />
          ))}
        </div>
      ) : isError ? (
        <p role="alert" className="text-sm text-danger-text">
          Could not load the overview: {error instanceof Error ? error.message : "unknown error"}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatTile
            icon={UserCheck}
            label="Recruiters awaiting approval"
            value={data.recruiters.pending}
            emphasis
          />
          <StatTile
            icon={Users}
            label="Active recruiters"
            value={data.recruiters.active}
            delay={0.04}
          />
          <StatTile
            icon={Users}
            label="Suspended recruiters"
            value={data.recruiters.suspended}
            delay={0.08}
          />
          <StatTile icon={Users} label="Job seekers" value={data.seekers.total} delay={0.12} />
          <StatTile icon={Briefcase} label="Jobs posted" value={data.jobs.total} delay={0.16} />
          <StatTile icon={Building2} label="Companies" value={data.companies.total} delay={0.2} />
          <StatTile
            icon={FileText}
            label="Applications"
            value={data.applications.total}
            delay={0.24}
          />
        </div>
      )}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent data-density="compact">
          <DialogHeader>
            <DialogTitle>Invite an admin</DialogTitle>
            <DialogDescription>
              The new admin receives a short-lived password setup code. No password is entered or shared here.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitInvite}>
            <FormField label="Full name" htmlFor="admin-full-name" required>
              <Input
                id="admin-full-name"
                name="fullName"
                autoComplete="name"
                value={invite.fullName}
                onChange={(event) => setInvite((current) => ({ ...current, fullName: event.target.value }))}
                placeholder="Admin's full name"
                required
              />
            </FormField>
            <FormField label="Email" htmlFor="admin-email" required>
              <Input
                id="admin-email"
                name="email"
                type="email"
                autoComplete="email"
                spellCheck={false}
                value={invite.email}
                onChange={(event) => setInvite((current) => ({ ...current, email: event.target.value }))}
                placeholder="admin@example.com"
                required
              />
            </FormField>
            <FormField
              label="Provisioning key"
              htmlFor="admin-provisioning-key"
              hint="Use the private key supplied by the platform owner. It is verified only by the server."
              required
            >
              <Input
                id="admin-provisioning-key"
                name="provisioningKey"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={invite.provisioningKey}
                onChange={(event) => setInvite((current) => ({ ...current, provisioningKey: event.target.value }))}
                placeholder="Provisioning key"
                required
              />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="signal" disabled={createAdmin.isPending}>
                {createAdmin.isPending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
                {createAdmin.isPending ? "Sending invite..." : "Send invite"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}

export default AdminDashboard;
