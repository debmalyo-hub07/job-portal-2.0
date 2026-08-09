import { Building2, Briefcase, FileText, UserCheck, Users } from "lucide-react";
import { Link } from "react-router";

import AdminShell from "./AdminShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminOverview } from "@/hooks/useAdminConsole";

/**
 * One counter. Geist Mono on the number because these are figures meant to be
 * compared down a column — the one use CLAUDE.md sanctions for the mono face.
 */
function StatTile({
  icon: Icon,
  label,
  value,
  emphasis = false,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-surface border border-line bg-paper-raised p-(--space-card)">
      <div className="flex items-center gap-2 text-ink-muted">
        <Icon aria-hidden="true" className="size-4" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p
        className={
          emphasis && value > 0
            ? "mt-3 font-mono text-3xl font-semibold text-signal-text"
            : "mt-3 font-mono text-3xl font-semibold text-ink"
        }
      >
        {value}
      </p>
    </div>
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

  return (
    <AdminShell
      title="Console"
      description="Moderation and oversight across every portal."
      actions={
        data && data.recruiters.pending > 0 ? (
          <Button asChild variant="signal">
            <Link to="/admin/recruiters">
              Review {data.recruiters.pending} pending
            </Link>
          </Button>
        ) : undefined
      }
    >
      {isPending ? (
        <div className="grid grid-cols-1 gap-(--space-row) sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-surface" />
          ))}
        </div>
      ) : isError ? (
        <p role="alert" className="text-sm text-danger">
          Could not load the overview: {error instanceof Error ? error.message : "unknown error"}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-(--space-row) sm:grid-cols-2 lg:grid-cols-3">
          <StatTile
            icon={UserCheck}
            label="Recruiters awaiting approval"
            value={data.recruiters.pending}
            emphasis
          />
          <StatTile icon={Users} label="Active recruiters" value={data.recruiters.active} />
          <StatTile icon={Users} label="Suspended recruiters" value={data.recruiters.suspended} />
          <StatTile icon={Users} label="Job seekers" value={data.seekers.total} />
          <StatTile icon={Briefcase} label="Jobs posted" value={data.jobs.total} />
          <StatTile icon={Building2} label="Companies" value={data.companies.total} />
          <StatTile icon={FileText} label="Applications" value={data.applications.total} />
        </div>
      )}
    </AdminShell>
  );
}

export default AdminDashboard;
