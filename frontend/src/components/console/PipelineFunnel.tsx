import type { AdminInsightsDto, ApplicationStatus } from "@jobportal/shared";

import { BarRow, CardEmpty, DashboardCard } from "./DashboardCard";

/**
 * Applications by stage, in pipeline order.
 *
 * Ordered by the pipeline, NOT ranked by count — the whole point is the shape of
 * the funnel, and sorting it by volume would destroy the one thing it shows. The
 * five progressive stages sit above a rule; `rejected` and `withdrawn` are
 * terminal outcomes and sit below it, because reading them as a continuation of
 * the funnel implies candidates pass *through* them.
 *
 * One series, so one hue and no legend — the card's title says what is plotted.
 * Neither terminal stage wears a status colour: a rejection is a normal outcome
 * of hiring, not an error state, and `--danger` would editorialise it. Status
 * tokens stay reserved for states the platform wants an admin to act on.
 */
const PROGRESSIVE: readonly ApplicationStatus[] = [
  "applied",
  "reviewed",
  "shortlisted",
  "interview",
  "offered",
];
const TERMINAL: readonly ApplicationStatus[] = ["rejected", "withdrawn"];

const LABELS: Record<ApplicationStatus, string> = {
  applied: "Applied",
  reviewed: "Reviewed",
  shortlisted: "Shortlisted",
  interview: "Interview",
  offered: "Offered",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export function PipelineFunnel({ pipeline }: { pipeline: AdminInsightsDto["pipeline"] }) {
  const { byStatus, total, live, decided } = pipeline;

  if (total === 0) {
    return (
      <DashboardCard
        title="Application pipeline"
        hint="Every stage a candidate can be in, across the platform."
      >
        <CardEmpty>
          No applications yet. Stages appear here as candidates move through them — the pipeline is
          seven stages wide and nobody has entered the first.
        </CardEmpty>
      </DashboardCard>
    );
  }

  // Scaled against the largest stage rather than the total: bars scaled to the
  // total are all short, and the comparison the reader wants is stage-to-stage.
  const max = Math.max(...Object.values(byStatus));

  return (
    <DashboardCard
      title="Application pipeline"
      hint="Every stage a candidate can be in, across the platform."
      foot={
        <>
          <span className="font-medium text-ink">{live.toLocaleString()} live</span> ·{" "}
          {decided.toLocaleString()} decided · {total.toLocaleString()} in total
        </>
      }
    >
      <ul aria-label="Application pipeline by stage" className="grid gap-2.5">
        {PROGRESSIVE.map((stage) => (
          <BarRow key={stage} label={LABELS[stage]} value={byStatus[stage]} max={max} />
        ))}
        {/* One list, because all seven are stages of the same pipeline. The rule
            is presentation: it marks where progression ends and outcome begins,
            without splitting the sequence a screen reader walks. */}
        {TERMINAL.map((stage, index) => (
          <BarRow
            key={stage}
            label={LABELS[stage]}
            value={byStatus[stage]}
            max={max}
            className={index === 0 ? "mt-1 border-t border-line pt-3.5" : undefined}
          />
        ))}
      </ul>
    </DashboardCard>
  );
}

export default PipelineFunnel;
