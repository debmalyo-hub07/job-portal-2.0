/**
 * The view-transition names shared-element morphs pair on.
 *
 * A `view-transition-name` present on an element in both the outgoing and the
 * incoming snapshot makes the browser animate that element between its two
 * boxes while the rest of the page cross-fades — the native mechanism the
 * deleted framer `SharedElement` was built for and never did. The two sides
 * of a pair must produce the SAME name: a mismatch is not an error, just a
 * morph that never happens, which is why the name is built in exactly one
 * place rather than inlined at each surface.
 *
 * The inverse constraint is just as load-bearing: two LIVE elements sharing
 * one name abort the whole transition — the cross-fade itself stops working.
 * The board page is the standing hazard (the "Near you" rail repeats jobs the
 * list beneath it also shows), so only surfaces that show a job at most once
 * per page may name their avatars: the board row, the landing spotlight card,
 * and the detail band. `jobAvatarMorph.test.tsx` pins both directions.
 */
export function jobAvatarName(jobId: string): string {
  return `job-${jobId}-avatar`;
}
