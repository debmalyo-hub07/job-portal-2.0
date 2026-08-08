import type { ScoreBreakdown } from "./weights.js";

/**
 * Turn a breakdown into human-readable reason lines, ordered by how much each
 * factor cost the score (largest shortfall first — that's what a person wants
 * explained). A factor that earned its ceiling is working *for* the score, so
 * it's named too; the reader sees both "why it ranks" and "why it doesn't".
 */
export function explain(breakdown: ScoreBreakdown): string[] {
  const sorted = [...breakdown.factors].sort(
    // Factor with the biggest gap between ceiling and earned first.
    (a, b) => b.max - b.earned - (a.max - a.earned),
  );
  return sorted.map((f) => `${cap(f.key)}: ${f.reason}`);
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
