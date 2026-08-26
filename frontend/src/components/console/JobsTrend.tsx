import { useId, useMemo, useRef, useState } from "react";
import type { AdminSeriesPoint } from "@jobportal/shared";

import { CardEmpty, DashboardCard } from "./DashboardCard";

/**
 * Jobs posted per day, eight weeks.
 *
 * The only dense series the platform has — production holds 198 postings spread
 * across 55 days, about four a day — so this is the one panel here that is a real
 * time series rather than a bar list.
 *
 * A line, not 56 bars: at dashboard width each bar would be four pixels, which is
 * a texture rather than a chart.
 *
 * Three things this component must not do, each a documented failure:
 *
 * It must not label every point. Fifty-six numbers is chaos and goes unread, so
 * the summary line carries the aggregate and the tooltip carries the detail.
 *
 * The tooltip must not be the only way to read a value. A hover-gated number is
 * unreachable by keyboard, in print, and by anyone not using a mouse — so the
 * `<details>` table below is the WCAG-clean twin, and every daily value lives
 * there too.
 *
 * The hit target must not be the mark. At 56 points a per-point target is ~10px,
 * under the ~24px floor, so hovering resolves to the NEAREST point across the
 * whole plot instead — the prescribed approach for a dense series.
 */

/** Plot geometry in user units. The viewBox scales; the stroke widths do not. */
const W = 720;
const H = 180;
const PAD = { top: 8, right: 8, bottom: 4, left: 8 };

const shortDate = (iso: string): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

export function JobsTrend({ series }: { series: AdminSeriesPoint[] }) {
  const gradientId = useId();
  const plotRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<number | null>(null);

  const total = useMemo(() => series.reduce((sum, p) => sum + p.count, 0), [series]);
  const peak = useMemo(() => series.reduce((m, p) => Math.max(m, p.count), 0), [series]);

  const geometry = useMemo(() => {
    // `length - 1` is a divisor, so a one-point or empty series would produce
    // Infinity and a blank plot. The API guarantees 56 dense points; this guards
    // the contract changing rather than trusting it.
    if (series.length < 2) return null;
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    // Headroom above the peak, so the busiest day is a point on the plot rather
    // than a line pinned along the top edge. Without it a series that is nearly
    // flat at its own maximum — 198 postings at about four a day, which is
    // exactly what production holds — draws as a plateau welded to the frame and
    // reads as a rendering fault rather than as steady supply.
    //
    // `+1` at small peaks, 15% above larger ones: proportional headroom on a
    // peak of 4 is half a job, which rounds away to no headroom at all.
    const scaleMax = peak <= 8 ? peak + 1 : peak * 1.15;
    const x = (i: number) => PAD.left + (i / (series.length - 1)) * innerW;
    const y = (v: number) => PAD.top + innerH - (v / scaleMax) * innerH;
    const points = series.map((p, i) => ({ x: x(i), y: y(p.count) }));
    const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
    const area = `${line} L${points.at(-1)!.x} ${PAD.top + innerH} L${points[0]!.x} ${PAD.top + innerH} Z`;
    return { points, line, area, baseline: PAD.top + innerH };
  }, [series, peak]);

  if (series.length === 0 || total === 0) {
    return (
      <DashboardCard title="Jobs posted" hint="New postings per day, last eight weeks.">
        <CardEmpty>No roles posted in the last eight weeks.</CardEmpty>
      </DashboardCard>
    );
  }

  const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const svg = plotRef.current;
    if (!svg || !geometry) return;
    const box = svg.getBoundingClientRect();
    // Ratio rather than pixels: the viewBox scales with the card's width, so a
    // pixel offset would drift from the plotted coordinate at every breakpoint.
    const ratio = (event.clientX - box.left) / box.width;
    const userX = ratio * W;
    let nearest = 0;
    for (let i = 1; i < geometry.points.length; i += 1) {
      if (
        Math.abs(geometry.points[i]!.x - userX) <
        Math.abs(geometry.points[nearest]!.x - userX)
      ) {
        nearest = i;
      }
    }
    setActive(nearest);
  };

  const hovered = active === null ? null : series[active];
  const hoveredPoint = active === null || !geometry ? null : geometry.points[active];
  const last = geometry?.points.at(-1);

  return (
    <DashboardCard
      title="Jobs posted"
      hint="New postings per day, last eight weeks."
      foot={
        <>
          <span className="font-medium text-ink">{total.toLocaleString()} posted in the last 8 weeks</span>{" "}
          · Busiest day: {peak.toLocaleString()}
        </>
      }
    >
      <div className="relative">
        <svg
          ref={plotRef}
          viewBox={`0 0 ${W} ${H}`}
          className="block h-44 w-full touch-none"
          role="img"
          aria-label={`Jobs posted per day over the last eight weeks. ${total} in total, busiest day ${peak}.`}
          onPointerMove={onMove}
          onPointerLeave={() => setActive(null)}
        >
          <defs>
            {/* A ~10% wash, not a saturated block: the fill exists to give the
                line a body, and `--signal-muted` is the token for exactly that. */}
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--signal-muted)" />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
          </defs>

          {/* Hairline, solid, one step off the surface — never dashed. */}
          {[0, 0.5, 1].map((t) => (
            <line
              key={t}
              x1={PAD.left}
              x2={W - PAD.right}
              y1={PAD.top + t * (H - PAD.top - PAD.bottom)}
              y2={PAD.top + t * (H - PAD.top - PAD.bottom)}
              stroke="var(--line)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {geometry ? (
            <>
              <path d={geometry.area} fill={`url(#${gradientId})`} />
              <path
                d={geometry.line}
                data-mark="line"
                fill="none"
                stroke="var(--signal-text)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              {hoveredPoint ? (
                <>
                  <line
                    x1={hoveredPoint.x}
                    x2={hoveredPoint.x}
                    y1={PAD.top}
                    y2={geometry.baseline}
                    stroke="var(--line-strong)"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                  />
                  {/* 2px surface ring so the marker stays legible where it
                      crosses the line. */}
                  <circle
                    cx={hoveredPoint.x}
                    cy={hoveredPoint.y}
                    r="4.5"
                    fill="var(--signal-text)"
                    stroke="var(--paper-raised)"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                </>
              ) : last ? (
                <circle
                  cx={last.x}
                  cy={last.y}
                  r="4"
                  fill="var(--signal-text)"
                  stroke="var(--paper-raised)"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
            </>
          ) : null}
        </svg>

        {hovered ? (
          <p
            aria-hidden="true"
            className="pointer-events-none absolute top-0 right-0 rounded-sharp border border-line bg-overlay px-2 py-1 text-xs text-ink shadow-[var(--elevate-2)]"
          >
            <span className="font-medium">{shortDate(hovered.date)}</span>{" "}
            <span className="font-mono tabular-nums">{hovered.count}</span>
          </p>
        ) : null}
      </div>

      <div className="mt-2 flex justify-between text-xs text-ink-muted">
        <span>{shortDate(series[0]!.date)}</span>
        <span>{shortDate(series.at(-1)!.date)}</span>
      </div>

      {/* The table twin. A dense series cannot label every point, so this is what
          keeps every value reachable without a pointer. */}
      <details className="mt-4">
        <summary className="cursor-pointer rounded-sharp text-xs font-medium text-ink-muted outline-none hover:text-ink focus-visible:ring-[3px] focus-visible:ring-signal-ring">
          View as table
        </summary>
        <div className="mt-3 max-h-56 overflow-y-auto">
          <table className="w-full text-left text-xs" aria-label="Jobs posted per day">
            <thead className="sticky top-0 bg-paper-raised">
              <tr className="text-ink-muted">
                <th scope="col" className="py-1 pr-3 font-medium">
                  Date
                </th>
                <th scope="col" className="py-1 font-medium">
                  Posted
                </th>
              </tr>
            </thead>
            <tbody>
              {series.map((point) => (
                <tr key={point.date} className="border-t border-line">
                  <td className="py-1 pr-3 font-mono tabular-nums text-ink-muted">{point.date}</td>
                  <td className="py-1 font-mono tabular-nums text-ink">{point.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </DashboardCard>
  );
}

export default JobsTrend;
