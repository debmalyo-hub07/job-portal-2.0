import type { AdminInsightsDto } from "@jobportal/shared";

import { DashboardCard } from "./DashboardCard";

/**
 * Demand against capacity — whether the marketplace is actually clearing.
 *
 * Two figures, and the second is the honest one. Applications per open role is
 * the headline, but an average hides its own distribution: one viral posting with
 * forty applications and ninety-seven with none averages to a healthy-looking
 * 0.4. Coverage — how many open roles have attracted anybody at all — is what
 * separates those two worlds, so it sits directly underneath as a meter.
 *
 * `applicationsPerJob` is `null` when there are no open roles to divide by, and
 * that renders as an em dash with a sentence, never as `0.00`. Zero applications
 * per role is a finding about demand; "nothing to measure" is a fact about the
 * catalogue, and a dashboard that draws them identically is lying about one.
 *
 * This one figure is the exception to the screen's Geist Mono numerals, and it is
 * deliberate: `tabular-nums` gives every glyph the width of a `0`, which at this
 * size rendered `0.00` as a spaced-out `0 . 00`. Mono and tabular earn their keep
 * in the tile grid, where figures are compared down a column. A lone value has
 * nothing to align with, so it takes the proportional sans.
 */
export function LiquidityCard({ liquidity }: { liquidity: AdminInsightsDto["liquidity"] }) {
  const { openJobs, jobsWithApplications, applicationsPerJob } = liquidity;
  const coverage = openJobs > 0 ? Math.round((jobsWithApplications / openJobs) * 100) : null;

  return (
    <DashboardCard
      title="Marketplace liquidity"
      hint="Whether open roles are attracting candidates."
    >
      <p className="font-sans text-[2.75rem] leading-none font-semibold text-ink">
        {applicationsPerJob === null ? (
          <span className="text-ink-muted" aria-label="not measurable">
            &mdash;
          </span>
        ) : (
          applicationsPerJob.toFixed(2)
        )}
      </p>
      <p className="mt-1 text-xs text-ink-muted">
        {applicationsPerJob === null
          ? "No open roles to measure against yet."
          : "Applications per open role"}
      </p>

      {coverage === null ? null : (
        <div className="mt-6">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold uppercase text-ink-muted">Coverage</span>
            <span className="font-mono text-xs tabular-nums text-ink">{coverage}%</span>
          </div>
          {/* The track is a wash of the same hue the fill uses, so the whole bar
              reads as one object at any value — the meter contract. */}
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-signal-muted"
            role="img"
            aria-label={`${jobsWithApplications} of ${openJobs} open roles have at least one application`}
          >
            <div
              className="h-full rounded-r-[4px] bg-signal-text"
              style={{ width: `${coverage}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            <span className="font-mono tabular-nums text-ink">
              {jobsWithApplications.toLocaleString()}
            </span>{" "}
            of {openJobs.toLocaleString()} open roles have at least one application
          </p>
        </div>
      )}
    </DashboardCard>
  );
}

export default LiquidityCard;
