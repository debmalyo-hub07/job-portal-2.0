import { useSearchParams } from "react-router";
import { portalSchema, type Portal } from "@jobportal/shared";

/**
 * The `?portal=` query parameter, validated.
 *
 * Never throws and never returns the raw string: this value becomes a URL
 * segment on the next request, so a hand-edited `?portal=../../admin` must
 * degrade to the default rather than travel.
 *
 * Validation goes through `portalSchema`, not a hand-written comparison. The
 * previous version read `=== "recruiter" ? "recruiter" : "seeker"`, written
 * when there were two portals; 3A added the third and this hook was not part
 * of that change. Every `?portal=admin` link therefore resolved to `seeker`,
 * silently — and the failure was invisible by design, because the endpoints it
 * then called are deliberately non-committal about whether an account exists.
 * An admin following "Forgot password?" got a uniform success and no email,
 * for as long as it took someone to read the query string. Deriving the set
 * from the schema means a fourth portal cannot reintroduce this.
 */
export function usePortalParam(): Portal {
  const [params] = useSearchParams();
  const parsed = portalSchema.safeParse(params.get("portal"));
  return parsed.success ? parsed.data : "seeker";
}
