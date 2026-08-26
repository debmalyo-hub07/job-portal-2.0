import { Briefcase, Building2, FileText, UserPlus } from "lucide-react";
import { Link } from "react-router";
import type { AdminActivityDto, AdminActivityKind } from "@jobportal/shared";

import { CardEmpty, DashboardCard } from "./DashboardCard";

/**
 * What happened recently, across every collection.
 *
 * A row links only where a console screen actually resolves it. An application
 * has no admin screen, so that row is text — a link to nowhere is worse than no
 * link, and rendering every row as one would promise four destinations where
 * three exist.
 *
 * The rows carry no contact details. That is enforced on the server (see
 * `adminConsole.service.ts`) rather than trimmed here, so a field added to a
 * domain DTO later cannot leak into the feed by way of this component.
 */
const ICONS: Record<AdminActivityKind, typeof Briefcase> = {
  recruiter_registered: UserPlus,
  job_posted: Briefcase,
  company_created: Building2,
  application_submitted: FileText,
};

const VERBS: Record<AdminActivityKind, string> = {
  recruiter_registered: "Recruiter registered",
  job_posted: "Job posted",
  company_created: "Company added",
  application_submitted: "Application submitted",
};

/**
 * Coarse relative time. Minutes, hours, then days — the feed answers "recently or
 * not", and "3 days ago" is as precise as that question needs.
 *
 * `Intl.RelativeTimeFormat` rather than a hand-rolled table so the strings follow
 * the reader's locale like every other date on the platform.
 */
const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

function ago(iso: string): string {
  const minutes = Math.round((Date.parse(iso) - Date.now()) / 60_000);
  const absolute = Math.abs(minutes);
  if (absolute < 60) return RELATIVE.format(minutes, "minute");
  if (absolute < 60 * 24) return RELATIVE.format(Math.round(minutes / 60), "hour");
  return RELATIVE.format(Math.round(minutes / (60 * 24)), "day");
}

export function ActivityFeed({ items }: { items: AdminActivityDto["items"] }) {
  return (
    <DashboardCard title="Recent activity" hint="The newest events across every portal.">
      {items.length === 0 ? (
        <CardEmpty>Nothing has happened yet.</CardEmpty>
      ) : (
        // Capped with an internal scroll so the rail has a predictable height.
        // Uncapped, twelve events made this card half again as tall as the whole
        // left column and opened a void beside it. The cap is on a list, not on a
        // plot — nothing here has an axis to clip.
        <ul className="grid max-h-96 gap-3 overflow-y-auto pr-1">
          {items.map((item) => {
            const Icon = ICONS[item.kind];
            const body = (
              <>
                <span className="block truncate text-sm font-medium text-ink">{item.label}</span>
                <span className="block truncate text-xs text-ink-muted">
                  {VERBS[item.kind]}
                  {item.detail ? ` · ${item.detail}` : ""}
                </span>
              </>
            );

            return (
              <li key={item.id} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-signal-muted">
                  <Icon aria-hidden="true" className="size-3.5 text-signal-text" />
                </span>
                <span className="min-w-0 flex-1">
                  {item.href ? (
                    <Link
                      to={item.href}
                      className="block rounded-sharp outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-signal-ring"
                    >
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </span>
                <time
                  dateTime={item.at}
                  // Prose, not a figure: mono + tabular is for columns of
                  // numbers, and "2 hours ago" is neither.
                  className="mt-0.5 shrink-0 text-xs text-ink-faint"
                >
                  {ago(item.at)}
                </time>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardCard>
  );
}

export default ActivityFeed;
