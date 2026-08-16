import type { RouteObject } from "react-router";
import type { Portal } from "@jobportal/shared";

import Login from "@/components/auth/Login";
import Signup from "@/components/auth/Signup";
import GuestRoute from "@/components/routing/GuestRoute";

/**
 * One component set, mounted twice — the same shape as the API's
 * `buildAuthRouter(portal)` mounted at /seeker/auth and /recruiter/auth.
 *
 * The prefix is the ONLY place a portal is named on the client, and App.tsx
 * passes it as a literal. That is what keeps Portal a route literal: there is no
 * code path where a request value reaches this function.
 *
 * The seven shared pages (verify-email, forgot-password, reset-password and the
 * four OAuth landings) are NOT built here. They are reached by redirect from the
 * Google callback, which targets portal-neutral paths carrying ?portal=, so
 * duplicating them per portal would require a backend change.
 *
 * `withSignup` is false for admin, mirroring the API: `buildAuthRouter("admin")`
 * mounts no /register, so a signup page here would post to an endpoint that does
 * not exist. Omitting the route rather than hiding the link means a typed URL
 * cannot reach it either.
 */
export function buildAuthRoutes(
  portal: Portal,
  prefix: string,
  { withSignup = true }: { withSignup?: boolean } = {},
): RouteObject[] {
  const routes: RouteObject[] = [
    {
      path: `${prefix}/login`,
      element: (
        <GuestRoute>
          <Login portal={portal} />
        </GuestRoute>
      ),
    },
  ];
  if (withSignup) {
    routes.push({
      path: `${prefix}/signup`,
      element: (
        <GuestRoute>
          <Signup portal={portal} />
        </GuestRoute>
      ),
    });
  }
  return routes;
}
