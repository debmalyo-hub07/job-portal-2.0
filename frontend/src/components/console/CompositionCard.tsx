import type { AdminInsightsDto } from "@jobportal/shared";

import { BarRow, CardEmpty, DashboardCard } from "./DashboardCard";

/**
 * What the open catalogue is made of.
 *
 * Two ranked lists, biggest first, plus the remote share. Ranked rather than
 * ordered, because a taxonomy has no inherent sequence — which is also why a
 * count of zero is omitted here and kept in the pipeline: a ranking lists what
 * exists, so a zero row is noise, while a named pipeline stage at zero says
 * nobody has reached it.
 *
 * The department list is capped and says so. A silently truncated list reads as
 * the whole taxonomy, and the platform has twelve departments against a card that
 * comfortably shows six.
 */
const VISIBLE_DEPARTMENTS = 6;

export function CompositionCard({
  composition,
  openJobs,
}: {
  composition: AdminInsightsDto["composition"];
  openJobs: number;
}) {
  const { byDepartment, byType, remoteOpenJobs } = composition;
  const shown = byDepartment.slice(0, VISIBLE_DEPARTMENTS);
  const hidden = byDepartment.length - shown.length;

  // A share needs something to divide by. With no open jobs there is no
  // percentage to state, and 0% would assert a measurement instead of declining
  // one — the same rule the API applies to applicationsPerJob.
  const remoteShare = openJobs > 0 ? Math.round((remoteOpenJobs / openJobs) * 100) : null;

  const departmentMax = shown[0]?.count ?? 0;
  const typeMax = byType[0]?.count ?? 0;

  return (
    <DashboardCard
      title="Open catalogue"
      hint="How the live postings are distributed."
      foot={
        remoteShare === null ? (
          <>No open postings to break down.</>
        ) : (
          <>
            <span className="font-medium text-ink">{remoteShare}% remote</span> —{" "}
            {remoteOpenJobs.toLocaleString()} of {openJobs.toLocaleString()} open roles
          </>
        )
      }
    >
      {byDepartment.length === 0 && byType.length === 0 ? (
        <CardEmpty>No open postings to break down yet.</CardEmpty>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
          {shown.length > 0 ? (
            <div>
              <p className="mb-3 text-xs font-semibold uppercase text-ink-muted">By department</p>
              <ul aria-label="Open jobs by department" className="grid gap-2.5">
                {shown.map((slice) => (
                  <BarRow
                    key={slice.label}
                    label={slice.label}
                    value={slice.count}
                    max={departmentMax}
                  />
                ))}
              </ul>
              {hidden > 0 ? (
                <p className="mt-3 text-xs text-ink-muted">
                  {hidden} more {hidden === 1 ? "department" : "departments"} not shown
                </p>
              ) : null}
            </div>
          ) : null}

          {byType.length > 0 ? (
            <div>
              <p className="mb-3 text-xs font-semibold uppercase text-ink-muted">By type</p>
              <ul aria-label="Open jobs by employment type" className="grid gap-2.5">
                {byType.map((slice) => (
                  <BarRow key={slice.label} label={slice.label} value={slice.count} max={typeMax} />
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </DashboardCard>
  );
}

export default CompositionCard;
