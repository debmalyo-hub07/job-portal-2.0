import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The dashboard's card chrome, and the one place a panel's shape is decided.
 *
 * Extracted because five panels share it and the counters already drifted once:
 * `StatTile` grew its own border, radius and shadow inline, so a sixth panel
 * would have been a sixth copy of three utilities that must agree.
 *
 * `foot` sits below a hairline rather than inside the body, so a summary line
 * reads as a caption on the panel rather than as another row of its content.
 */
export function DashboardCard({
  title,
  hint,
  action,
  foot,
  className,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  foot?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex flex-col rounded-surface border border-line bg-paper-raised p-5 shadow-[var(--elevate-1)]",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {hint ? <p className="mt-1 text-xs leading-5 text-ink-muted">{hint}</p> : null}
        </div>
        {action}
      </div>
      <div className="mt-5 flex-1">{children}</div>
      {foot ? (
        <p className="mt-5 border-t border-line pt-3 text-xs leading-5 text-ink-muted">{foot}</p>
      ) : null}
    </section>
  );
}

/**
 * A panel with nothing to draw.
 *
 * Not a styling convenience — it is the alternative to a chart of zeros. Every
 * demand-side figure on this dashboard is empty on a fresh platform, and seven
 * zero-width bars beside a "0" is a measurement the data does not support. This
 * says which, and why, in words.
 */
export function CardEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-sharp bg-paper-sunken px-4 py-6 text-center text-sm leading-6 text-ink-muted">
      {children}
    </p>
  );
}

/**
 * One row of a bar list: label, thin bar, value at the tip.
 *
 * The marks follow the shared chart spec and two of them are load-bearing:
 *
 * The fill is `--signal-text`, NOT `--signal`. Measured against `--paper-raised`,
 * `--signal` is 5.28:1 in the admin portal and **1.66:1** in the recruiter one —
 * gold on bone all but disappears, and a recruiter analytics screen is on the
 * roadmap. `--signal-text` clears 4.5:1 on every surface in all three portals and
 * is already gated there by check-colour-contrast.mjs.
 *
 * The track is `--signal-muted`, a ~10% wash of the same hue — the "lighter step
 * of the same ramp" a meter's unfilled track is supposed to be, so the row reads
 * as one object rather than a mark sitting on unrelated grey.
 *
 * The bar is 8px, well under the 24px cap: a saturated fill belongs to small
 * marks, never large blocks. In dark mode `--signal-text` is a bright step
 * (L 0.80), which is exactly why it must stay thin and why any large area on this
 * screen uses the wash instead.
 */
export function BarRow({
  label,
  value,
  max,
  suffix,
  className,
}: {
  label: string;
  value: number;
  max: number;
  suffix?: string;
  className?: string;
}) {
  // A zero-count row still renders its label and its 0 — the row is the
  // information. Guarding the divisor keeps an all-zero list from NaN.
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;

  return (
    <li
      className={cn(
        "grid grid-cols-[minmax(7rem,13rem)_1fr_auto] items-center gap-3",
        className,
      )}
    >
      <span className="truncate text-sm text-ink" title={label}>
        {label}
      </span>
      <span className="h-2 w-full overflow-hidden rounded-full bg-signal-muted">
        {/* Square at the baseline, 4px rounded at the data end. */}
        <span
          className="block h-full rounded-r-[4px] bg-signal-text"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="font-mono text-sm tabular-nums text-ink-muted">
        {value.toLocaleString()}
        {suffix}
      </span>
    </li>
  );
}
