import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import type { Portal } from "@jobportal/shared";

import { completePathFor } from "@/lib/portalHome";
import { userForPortal } from "@/redux/authSlice";
import { useAppSelector } from "@/redux/store";

/**
 * The client half of the API's `requireProfileComplete`.
 *
 * Composed INSIDE `ProtectedRoute` rather than merged into it: ProtectedRoute
 * answers "is there a session", this answers "is it usable", and the completion
 * page itself needs the first without the second.
 *
 * It redirects rather than rendering an explainer the way `RequireApproved` does,
 * because unlike approval this is something the user can fix in ten seconds and
 * there is nothing to wait for.
 *
 * Presentation only. The API is what refuses the write — this exists so the
 * refusal is not the first the user hears of it.
 */
export function RequireProfileComplete({
  portal,
  children,
}: {
  portal: Extract<Portal, "seeker" | "recruiter">;
  children: ReactNode;
}) {
  const user = useAppSelector((state) => userForPortal(state.auth, portal));
  const location = useLocation();

  // `user &&` deliberately: with no session at all this renders through to
  // ProtectedRoute, whose job that is. Redirecting an anonymous visitor to a
  // completion step would replace a sign-in prompt with a form they cannot post.
  if (user && !user.profileComplete) {
    return (
      <Navigate
        to={completePathFor(portal)}
        replace
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
      />
    );
  }
  return <>{children}</>;
}

export default RequireProfileComplete;
