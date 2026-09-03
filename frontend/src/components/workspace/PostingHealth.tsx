import { useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import type { PostingHealthDto } from "@jobportal/shared";

/**
 * Posting health: how this role is doing at attracting applicants.
 *
 * The console's JobsTrend pattern re-implemented on workspace tokens, because
 * the same three rules hold here:
 *
 * It must not label every point. Fifty-six numbers is chaos and goes unread,
 * so the summary line carries the aggregate and the tooltip carries the detail.
 *
 * The tooltip must not be the only way to read a value. A hover-gated number
 * is unreachable by keyboard and in print, so the `<details>` table below is
 * the accessible twin, and every daily value lives there too.
 *
 * The hit target must not be the mark. At 56 points a per-point target is
 * under the ~24px floor, so hovering resolves to the NEAREST point across the
 * whole plot instead.
 *
 * The empty state is an invitation, not a blank: a posting with no applicants
 * gets the link to share, not a flat line pretending to be a trend.
 */

/** Plot geometry in user units. The viewBox scales; the stroke widths do not. */
const W = 560;
const H = 140;
const PAD = { top: 8, right: 8, bottom: 4, left: 8 };

const shortDate = (iso: string): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

export function PostingHealth({
  health,
  jobId,
  jobCreatedAt,
}: {
  health: PostingHealthDto;
  jobId: string | undefined;
  jobCreatedAt?: string;
}) {
  const gradientId = useId();
  const plotRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<number | null>(null);

  const total = health.total;
  // The window's sum, not the all-time total: a role whose applicants all
  // arrived nine weeks ago has a real total and nothing to draw.
  const windowTotal = useMemo(
    () => health.series.reduce((sum, p) => sum + p.count, 0),
    [health.series],
  );
  const peak = useMemo(
    () => health.series.reduce((m, p) => Math.max(m, p.count), 0),
    [health.series],
  );

  // Time-to-first is the client's subtraction, not a server opinion: the job's
  // `createdAt` is one field the caller already has.
  const firstAfterDays =
    health.firstApplicationAt && jobCreatedAt
      ? Math.floor(
          (Date.parse(health.firstApplicationAt) - Date.parse(jobCreatedAt)) / 86_400_000,
        )
      : null;

  const geometry = useMemo(() => {
    // `length - 1` is a divisor, so a short series would produce Infinity. The
    // API guarantees 56 dense points; this guards the contract changing.
    if (health.series.length < 2) return null;
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    // Headroom above the peak, so the busiest day is a point on the plot
    // rather than a line pinned along the top edge. `+1` at small peaks, 15%
    // above larger ones: proportional headroom on a peak of 4 is half an
    // application, which rounds away to no headroom at all.
    const scaleMax = peak <= 8 ? peak + 1 : peak * 1.15;
    const x = (i: number) => PAD.left + (i / (health.series.length - 1)) * innerW;
    const y = (v: number) => PAD.top + innerH - (v / scaleMax) * innerH;
    const points = health.series.map((p, i) => ({ x: x(i), y: y(p.count) }));
    const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
    const area = `${line} L${points.at(-1)!.x} ${PAD.top + innerH} L${points[0]!.x} ${PAD.top + innerH} Z`;
    return { points, line, area, baseline: PAD.top + innerH };
  }, [health.series, peak]);

  if (total === 0) {
    return (
      <section
        aria-label="Posting health"
        className="w-full shrink-0 rounded-surface border border-line bg-paper-raised px-4 py-3 lg:w-80"
      >
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Posting health
        </h3>
        <p className="mt-2 text-sm font-medium text-ink">No applicants yet</p>
        <p className="mt-1 text-sm text-ink-muted">
          Share the role's public page to put it in front of candidates —{" "}
          {jobId ? (
            <Link className="text-signal-text underline" viewTransition to={`/description/${jobId}`}>
              view the live posting
            </Link>
          ) : null}
        </p>
      </section>
    );
  }

  const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const svg = plotRef.current;
    if (!svg || !geometry) return;
    const box = svg.getBoundingClientRect();
    // Ratio rather than pixels: the viewBox scales with the block's width, so
    // a pixel offset would drift from the plotted coordinate at every size.
    const ratio = (event.clientX - box.left) / box.width;
    const userX = ratio * W;
    let nearest = 0;
    for (let i = 1; i < geometry.points.length; i += 1) {
      if (
        Math.abs(geometry.points[i]!.x - userX) < Math.abs(geometry.points[nearest]!.x - userX)
      ) {
        nearest = i;
      }
    }
    setActive(nearest);
  };

  const hovered = active === null ? null : health.series[active];
  const hoveredPoint = active === null || !geometry ? null : geometry.points[active];
  const last = geometry?.points.at(-1);

  const firstLine =
    firstAfterDays === null
      ? null
      : firstAfterDays <= 0
        ? "First applicant within a day of posting"
        : `First applicant after ${firstAfterDays} ${firstAfterDays === 1 ? "day" : "days"}`;

  return (
    <section
      aria-label="Posting health"
      className="w-full shrink-0 rounded-surface border border-line bg-paper-raised px-4 py-3 lg:w-80"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Posting health
        </h3>
        <span className="font-mono text-sm font-semibold tabular-nums text-ink">
          {total} {total === 1 ? "applicant" : "applicants"}
        </span>
      </div>

      {windowTotal === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">No applications in the last eight weeks.</p>
      ) : (
        <div className="relative">
          <svg
            ref={plotRef}
            viewBox={`0 0 ${W} ${H}`}
            className="mt-2 block h-32 w-full touch-none"
            role="img"
            aria-label={`Applications per day over the last eight weeks. ${total} in total, busiest day ${peak}.`}
            onPointerMove={onMove}
            onPointerLeave={() => setActive(null)}
          >
            <defs>
              {/* A ~10% wash, not a saturated block: the fill exists to give
                  the line a body, and `--signal-muted` is the token for it. */}
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
      )}

      {health.series.length > 0 ? (
        <div className="mt-1 flex justify-between text-xs text-ink-muted">
          <span>{shortDate(health.series[0]!.date)}</span>
          <span>{shortDate(health.series.at(-1)!.date)}</span>
        </div>
      ) : null}

      <p className="mt-2 text-xs text-ink-muted">
        {firstLine}
        {windowTotal > 0 ? ` · Busiest day: ${peak}` : ""}
      </p>

      {/* The table twin. A dense series cannot label every point, so this is
          what keeps every value reachable without a pointer. */}
      {windowTotal > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer rounded-sharp text-xs font-medium text-ink-muted outline-none hover:text-ink focus-visible:ring-[3px] focus-visible:ring-signal-ring">
            View as table
          </summary>
          <div className="mt-3 max-h-56 overflow-y-auto">
            <table className="w-full text-left text-xs" aria-label="Applications per day">
              <thead className="sticky top-0 bg-paper-raised">
                <tr className="text-ink-muted">
                  <th scope="col" className="py-1 pr-3 font-medium">
                    Date
                  </th>
                  <th scope="col" className="py-1 font-medium">
                    Applied
                  </th>
                </tr>
              </thead>
              <tbody>
                {health.series.map((point) => (
                  <tr key={point.date} className="border-t border-line">
                    <td className="py-1 pr-3 font-mono tabular-nums text-ink-muted">{point.date}</td>
                    <td className="py-1 font-mono tabular-nums text-ink">{point.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </section>
  );
}

export default PostingHealth;
