import { ArrowRight, CheckCircle2, UserCheck, Building2 } from "lucide-react";
import { Link } from "react-router";
import type { AdminInsightsDto } from "@jobportal/shared";

/**
 * What is waiting for a decision.
 *
 * This band exists because the dashboard's question is "is there work for me",
 * and the previous screen answered it with the pending count sitting as tile #1
 * of seven identical tiles — the one number with an action attached, drawn at the
 * same weight as six inert ones.
 *
 * Every item is a link to the screen that resolves it. An item at zero is not
 * rendered: a triage list is a list of work, so a cleared item is absence, not a
 * zero to display. When everything is clear the band says so in words — a row of
 * 0s reads as a broken panel rather than as good news.
 */
const ITEMS = [
  {
    key: "pendingRecruiters" as const,
    icon: UserCheck,
    href: "/admin/recruiters",
    // Written as a function of the count so the singular is not "1 recruiters".
    label: (n: number) => `${n} ${n === 1 ? "recruiter" : "recruiters"} awaiting approval`,
    hint: "Approve or deny to unblock posting",
  },
  {
    key: "companiesMissingBranding" as const,
    icon: Building2,
    href: "/admin/review/companies",
    label: (n: number) => `${n} ${n === 1 ? "company" : "companies"} with an incomplete profile`,
    hint: "Missing a logo or a website",
  },
];

export function TriageBand({ triage }: { triage: AdminInsightsDto["triage"] }) {
  const waiting = ITEMS.filter((item) => triage[item.key] > 0);

  if (waiting.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-surface border border-line bg-paper-raised px-5 py-4 shadow-[var(--elevate-1)]">
        <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-ok-text" />
        <p className="text-sm text-ink-muted">
          <span className="font-medium text-ink">Nothing waiting.</span> No recruiters to review and
          every employer profile is complete.
        </p>
      </div>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {waiting.map(({ key, icon: Icon, href, label, hint }) => (
        <li key={key}>
          <Link
            to={href}
            className="group flex items-center gap-3 rounded-surface border border-signal-edge bg-signal-muted px-5 py-4 outline-none transition-colors duration-(--dur-fast) hover:bg-paper-raised focus-visible:ring-[3px] focus-visible:ring-signal-ring"
          >
            <Icon aria-hidden="true" className="size-4 shrink-0 text-signal-text" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">{label(triage[key])}</span>
              <span className="block text-xs text-ink-muted">{hint}</span>
            </span>
            <ArrowRight
              aria-hidden="true"
              className="size-4 shrink-0 text-ink-muted transition-transform duration-(--dur-fast) group-hover:translate-x-0.5"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default TriageBand;
