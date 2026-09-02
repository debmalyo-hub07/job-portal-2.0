import type { DailySeriesPoint } from "@jobportal/shared";

/**
 * Dense daily series, shared by the console's jobs-posted trend and the
 * workspace's posting health.
 *
 * The contract every consumer rests on: every day of the window present,
 * zero-filled, ascending, keyed on UTC `YYYY-MM-DD`. A sparse series makes
 * the client infer the gaps, and a chart that silently closes one draws a
 * trend the data does not contain.
 */

/** Eight weeks. Long enough to show a trend, short enough to stay one screen. */
export const SERIES_DAYS = 56;

/** Midnight UTC, `daysBack` days ago. Series are keyed on UTC dates. */
export function utcMidnight(daysBack: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d;
}

export const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

export function denseDailySeries(countByDay: Map<string, number>): DailySeriesPoint[] {
  return Array.from({ length: SERIES_DAYS }, (_, i) => {
    const date = isoDay(utcMidnight(SERIES_DAYS - 1 - i));
    return { date, count: countByDay.get(date) ?? 0 };
  });
}
