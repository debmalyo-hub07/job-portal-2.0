import { useSearchParams } from "react-router";
import type { Portal } from "@jobportal/shared";

/**
 * The `?portal=` query parameter, validated.
 *
 * Never throws and never returns the raw string: this value becomes a URL
 * segment on the next request, so a hand-edited `?portal=../../admin` must
 * degrade to a default rather than travel. Anything that is not exactly
 * "recruiter" is a seeker.
 */
export function usePortalParam(): Portal {
  const [params] = useSearchParams();
  return params.get("portal") === "recruiter" ? "recruiter" : "seeker";
}
