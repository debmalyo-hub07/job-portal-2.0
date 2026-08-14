import { useId } from "react";
import type { Factor, ScoreBreakdown } from "@jobportal/shared";

import { Badge } from "./ui/badge";
import { cn } from "@/lib/utils";

/**
 * One rounding rule for both surfaces.
 *
 * The pipeline keeps one decimal, so a badge rounding independently of the
 * breakdown under it would show 88% above a column adding to 87.5.
 */
const points = (n: number) => Math.round(n);

/** The factor that cost the most — what `explain` already sorts by. */
function largestShortfall(factors: Factor[]): Factor | null {
  let worst: Factor | null = null;
  for (const f of factors) {
    const lost = f.max - f.earned;
    if (lost <= 0) continue;
    if (!worst || lost > worst.max - worst.earned) worst = f;
  }
  return worst;
}

/**
 * A compact, non-interactive fit summary.
 *
 * Deliberately not interactive. The job card is a single `<Link>` — a tooltip
 * trigger or a "why?" button inside it would nest a control in a link and add a
 * second tab stop to every result — so the reason is text, and the one that gets
 * the space is the factor that cost the most. A badge explaining "Location
 * differs" while the seeker is missing every required skill explains the wrong
 * thing.
 *
 * It explains an order; it does not set one. The seeker board stays newest-first
 * in Mongo, while the recruiter endpoint ranks the complete applicant set before
 * pagination. The component only presents the score either service chose to
 * carry.
 *
 * `fit` is absent for an anonymous visitor and for a recruiter — both reach the
 * same public routes — and absent renders nothing rather than 0%. On the
 * applicant table, null means the seeker row no longer resolves. Recruiter rows
 * pass their own all-clear label; factor reasons already use the voice selected
 * by the shared scoring direction.
 */
export function FitBadge({
  fit,
  className,
  perfectLabel = "Matches everything you asked for",
}: {
  fit?: ScoreBreakdown | null;
  className?: string;
  perfectLabel?: string;
}) {
  if (!fit) return null;
  const worst = largestShortfall(fit.factors);

  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1.5", className)}>
      {/*
        `outline`, not the ok/warn/danger variants. Those carry a semantic state
        and the convention pairs them with an icon and a label; a fit score is a
        scalar, and painting 40% in the danger colour would call a job an error
        when it is simply a worse match than another.
      */}
      <Badge variant="signal" className="font-mono tabular-nums">
        {points(fit.score)}% fit
      </Badge>
      <span className="text-xs text-ink-muted">
        {worst ? worst.reason : perfectLabel}
      </span>
    </div>
  );
}

/**
 * The whole arithmetic, for the surface that has room for it.
 *
 * A score nobody can check is a number to be argued with; five weighted rows
 * that add up to it are a claim that can be read. The points column is the one
 * case the type convention allows Geist Mono — aligned numeric comparison — and
 * the totals row is the pipeline's own `score`, never a sum re-derived here,
 * which would drift from its rounding.
 */
export function FitBreakdown({ fit, className }: { fit?: ScoreBreakdown; className?: string }) {
  // A generated id, not a literal: `aria-labelledby` needs one, and a hardcoded
  // string would collide the day a second breakdown appears on a page.
  const headingId = useId();
  if (!fit) return null;

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "rounded-surface border border-line bg-paper-raised p-5 shadow-sm",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-4 border-b border-line pb-4">
        <h2 id={headingId} className="font-display text-xl font-semibold text-ink">
          How you fit
        </h2>
        <p className="font-mono text-sm text-ink">{points(fit.score)} / 100</p>
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        Worked out from your profile. Anything you have not set simply stops counting.
      </p>
      <dl className="mt-2 divide-y divide-line">
        {fit.factors.map((f) => (
          <div key={f.key} className="flex items-baseline justify-between gap-4 py-2">
            <div className="min-w-0">
              <dt className="text-sm font-medium text-ink capitalize">{f.key}</dt>
              <dd className="text-xs text-ink-muted">{f.reason}</dd>
            </div>
            <p className="shrink-0 font-mono text-sm text-ink-muted">
              {points(f.earned)} / {points(f.max)}
            </p>
          </div>
        ))}
      </dl>
    </section>
  );
}
