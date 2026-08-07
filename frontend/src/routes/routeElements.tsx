import { Navigate, Outlet, useLocation } from "react-router";

import { PortalScope } from "@/components/theme/PortalScope";

/**
 * The components the route table mounts directly.
 *
 * They live here rather than beside the table because `appRoutes` is a plain
 * value, and a module that exports both a component and a non-component loses
 * Fast Refresh for the component — the same reason `portalForPath` sits in its
 * own module rather than next to `PortalScope`.
 */

export function RootLayout() {
  return (
    <PortalScope>
      <Outlet />
    </PortalScope>
  );
}

/**
 * Rewrites a pre-3A workspace URL onto its /hire equivalent.
 *
 * A prefix swap rather than a fixed target, because the workspace paths most
 * worth bookmarking are the parameterised ones — a company setup page or a
 * job's applicant list. Enumerating literal redirects would silently drop
 * exactly those. Query and hash ride along so a shared link keeps its state.
 */
export function WorkspaceRedirect() {
  const { pathname, search, hash } = useLocation();
  return <Navigate to={`${pathname.replace(/^\/admin/, "/hire")}${search}${hash}`} replace />;
}

/**
 * The admin console's front door.
 *
 * There is no admin marketing page and there will not be one — it is an
 * internal surface. But AuthLayout links every portal's wordmark at its own
 * home, so /admin has to resolve to something. The sign-in is the only door
 * the console has.
 */
export function AdminHomeRedirect() {
  return <Navigate to="/admin/login" replace />;
}
