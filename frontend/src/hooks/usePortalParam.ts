import { useSearchParams } from "react-router";
import type { Portal } from "@jobportal/shared";

import { portalFromSearch } from "@/lib/portalRoutes";

/**
 * The `?portal=` query parameter, validated.
 *
 * A thin hook over `portalFromSearch`, which is the single parser — the same one
 * `portalForPath` consults for the seven portal-neutral auth paths. Two readers
 * of one parameter is exactly where the last bug here lived: the validation was
 * fixed in the hook while the route→portal map, and therefore the signal colour,
 * kept resolving `seeker` for all three portals.
 *
 * It never throws and never returns the raw string: this value becomes a URL
 * segment on the next request, so a hand-edited `?portal=../../admin` must
 * degrade to the default rather than travel.
 */
export function usePortalParam(): Portal {
  const [params] = useSearchParams();
  return portalFromSearch(params);
}
