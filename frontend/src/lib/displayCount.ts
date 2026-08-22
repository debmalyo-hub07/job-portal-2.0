/**
 * A count as a marketing surface should print it, or an em dash when there is no
 * figure worth printing.
 *
 * Lives here rather than beside the component that renders it for two reasons.
 * `react-refresh/only-export-components` fails the lint on a component file that
 * exports anything else, and this needs to be exported: both the empty case and
 * the failed-request case render the same dash the loading state does, so an
 * assertion made through the DOM would pass whether or not the number was ever
 * wired to anything. A pure function is the only honest seam for those cases.
 *
 * Zero collapses to the dash deliberately. "0 open roles" on the landing page of
 * a job marketplace is worse than declining to say — the same judgement
 * `usePublicJobCount` makes for the auth panel, where a count below a floor is
 * dropped in favour of value-proposition copy. The difference here is that the
 * tile carries two other real figures beside this one, so there is no floor: a
 * genuine "7" reads fine next to them, where a lone "7" did not.
 *
 * `undefined` covers loading and failure together on purpose. The distinction
 * matters to a retry affordance, and this tile has none — it is a figure on a
 * marketing strip, and a dash is the truthful rendering of "we cannot say right
 * now" in both cases.
 */
export function displayCount(total: number | undefined): string {
  return total && total > 0 ? String(total) : "—";
}
