import { Building2, Briefcase, FileText, KeyRound, Loader2, RefreshCw, Users } from "lucide-react";
import { Link } from "react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import AdminShell from "./AdminShell";
import { ActivityFeed } from "./ActivityFeed";
import { CompositionCard } from "./CompositionCard";
import { JobsTrend } from "./JobsTrend";
import { LiquidityCard } from "./LiquidityCard";
import { PipelineFunnel } from "./PipelineFunnel";
import { TriageBand } from "./TriageBand";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAdminActivity,
  useAdminInsights,
  useAdminOverview,
  useCreateAdmin,
} from "@/hooks/useAdminConsole";
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
import { PasswordInput } from "@/components/ui/password-input";
import { getApiErrorMessage } from "@/lib/apiError";

/**
 * One reference figure.
 *
 * Deliberately smaller and quieter than it was. These seven counts used to BE the
 * dashboard — seven hero tiles at identical weight, so the one number with an
 * action attached looked exactly like six inert ones. They are context now: the
 * triage band above carries the work and the charts carry the story, so a count
 * is a figure you glance at rather than the screen's whole content.
 *
 * Geist Mono and `tabular-nums` on the value, which CLAUDE.md sanctions precisely
 * for figures meant to be compared down a column — and read as a grid, that is
 * what these are.
 *
 * The figure animates on change. Approving a recruiter invalidates this query, so
 * a count moves while the admin is still looking at it: seeing 7 become 6 is
 * confirmation the action landed.
 */
function StatTile({
  icon: Icon,
  label,
  value,
  delay = 0,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  delay?: number;
}) {
  return (
    <Reveal delay={delay}>
      <div className="rounded-surface border border-line bg-paper-raised px-4 py-3.5 shadow-[var(--elevate-1)]">
        <div className="flex items-center gap-2 text-ink-muted">
          <Icon aria-hidden="true" className="size-3.5" />
          <span className="truncate text-xs font-medium">{label}</span>
        </div>
        <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-ink">
          <AnimatedNumber value={value} />
        </p>
      </div>
    </Reveal>
  );
}

/**
 * A titled group of reference counts. Two groups, so the grid reads as two ideas.
 *
 * The groups stack rather than sitting side by side. Side by side, four tiles
 * shared half the content width — about 117px each — and every single label
 * truncated: "Active rec...", "Job seek...", "Jobs pos...". A tile whose label is
 * cut off is a number with no subject.
 */
function StatGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase text-ink-muted">{title}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{children}</div>
    </div>
  );
}

/**
 * The console's landing page and the admin's post-login destination.
 *
 * Reads three endpoints rather than one. `/overview` carries the counters,
 * `/insights` the aggregations, `/activity` the feed — split by how fast each
 * goes stale, so a refresh of the feed does not re-run eleven aggregations.
 *
 * The screen answers two questions in order, and the layout is that order: "is
 * there work waiting for me" (the triage band, first, full width) and then "is
 * the platform healthy" (the charts, then the reference counts). Before this it
 * answered only the second, in a grid of seven identical tiles.
 */
export function AdminDashboard() {
  const overview = useAdminOverview();
  const insights = useAdminInsights();
  const activity = useAdminActivity();
  const createAdmin = useCreateAdmin();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({ fullName: "", email: "", provisioningKey: "" });
  // True only between a manual refresh and its completion. Background refetches
  // fire every 30-60s and must be invisible — the page used to dim for each
  // one, which read as the console stuttering twice a minute.
  const [manualRefresh, setManualRefresh] = useState(false);

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

  const refreshAll = () => {
    setManualRefresh(true);
    Promise.allSettled([overview.refetch(), insights.refetch(), activity.refetch()]).finally(() =>
      setManualRefresh(false),
    );
  };

  const busy = overview.isFetching || insights.isFetching || activity.isFetching;
  const generatedAt = insights.data?.generatedAt;

  return (
    <AdminShell
      title="Console"
      description="Moderation and oversight across every portal."
      actions={
        <>
          {/* The "as of" the numbers describe, from the server's clock rather than
              the browser's — see AdminInsightsDto.generatedAt. Visible at every
              width: a phone is where a stale figure is hardest to notice and a
              refresh is most likely to be the reason the dashboard was opened.
              It survives narrow screens by wrapping inside the actions row
              rather than hiding. */}
          {generatedAt ? (
            <span className="text-xs text-ink-muted">
              as of{" "}
              {new Date(generatedAt).toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          ) : null}
          <Button variant="ghost" size="icon-sm" onClick={refreshAll} aria-label="Refresh">
            <RefreshCw aria-hidden="true" className={busy ? "animate-spin" : undefined} />
          </Button>
          {/* Demoted from the primary slot. Inviting an admin is a rare privileged
              action and was sitting at the same weight as the review CTA. */}
          <Button variant="outline" onClick={() => setInviteOpen(true)}>
            <KeyRound data-icon="inline-start" />
            Invite admin
          </Button>
          {overview.data && overview.data.recruiters.pending > 0 ? (
            <Button asChild variant="signal">
              <Link to="/admin/recruiters">Review {overview.data.recruiters.pending} pending</Link>
            </Button>
          ) : null}
        </>
      }
    >
      {insights.isError || overview.isError ? (
        <p role="alert" className="text-sm text-danger-text">
          Could not load the console:{" "}
          {(insights.error ?? overview.error) instanceof Error
            ? (insights.error ?? overview.error)!.message
            : "unknown error"}
        </p>
      ) : (
        // Held at reduced opacity through a MANUAL refresh only, where the
        // button's spinner already says "working". A background refetch keeps
        // the page exactly as it was — React Query holds the data, so there is
        // nothing to communicate, and dimming for each 30-second poll was the
        // console's stutter.
        <div
          className={
            manualRefresh && insights.data
              ? "opacity-60 transition-opacity duration-(--dur-fast)"
              : "transition-opacity duration-(--dur-fast)"
          }
        >
          {insights.isPending || !insights.data ? (
            <div className="grid gap-4">
              <Skeleton className="h-20 rounded-surface" />
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
                <Skeleton className="h-72 rounded-surface" />
                <Skeleton className="h-72 rounded-surface" />
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              <TriageBand triage={insights.data.triage} />

              <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
                <div className="grid gap-4">
                  <JobsTrend series={insights.data.jobsPostedSeries} />
                  <PipelineFunnel pipeline={insights.data.pipeline} />
                </div>

                <div className="grid gap-4">
                  <LiquidityCard liquidity={insights.data.liquidity} />
                  <ActivityFeed items={activity.data ?? []} />
                </div>
              </div>

              {/* Full width rather than in the left column: two ranked lists in a
                  narrow column truncated every label past about twelve
                  characters, and "Operations & Supply Chain" is the platform's
                  second-largest department. */}
              <CompositionCard
                composition={insights.data.composition}
                openJobs={insights.data.liquidity.openJobs}
              />

              {overview.data ? (
                <div className="grid gap-6 pt-2">
                  <StatGroup title="People">
                    <StatTile icon={Users} label="Active recruiters" value={overview.data.recruiters.active} />
                    <StatTile
                      icon={Users}
                      label="Suspended"
                      value={overview.data.recruiters.suspended}
                      delay={0.04}
                    />
                    <StatTile
                      icon={Users}
                      label="Job seekers"
                      value={overview.data.seekers.total}
                      delay={0.08}
                    />
                    <StatTile
                      icon={FileText}
                      label="Applications"
                      value={overview.data.applications.total}
                      delay={0.12}
                    />
                  </StatGroup>
                  <StatGroup title="Marketplace">
                    <StatTile icon={Briefcase} label="Jobs posted" value={overview.data.jobs.total} />
                    <StatTile
                      icon={Briefcase}
                      label="Open now"
                      value={insights.data.liquidity.openJobs}
                      delay={0.04}
                    />
                    <StatTile
                      icon={Building2}
                      label="Companies"
                      value={overview.data.companies.total}
                      delay={0.08}
                    />
                    <StatTile
                      icon={Briefcase}
                      label="Remote"
                      value={insights.data.composition.remoteOpenJobs}
                      delay={0.12}
                    />
                  </StatGroup>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent data-density="compact">
          <DialogHeader>
            <DialogTitle>Invite an admin</DialogTitle>
            <DialogDescription>
              The new admin gets an email with a link to the setup screen and a short-lived
              code to enter there. No password is entered or shared here.
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
              <PasswordInput
                id="admin-provisioning-key"
                name="provisioningKey"
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
