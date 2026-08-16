import { Navigate, Outlet, useLocation } from "react-router";

import { PortalScope } from "@/components/theme/PortalScope";
import { useAppSelector } from "@/redux/store";
import { useAuthBootstrap } from "@/hooks/useAuthBootstrap";
import { portalIsBootstrapped, userForPortal } from "@/redux/authSlice";

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
 * home, so /admin has to resolve to something.
 *
 * Signed in as an admin, that is the dashboard; otherwise the sign-in, which
 * was the only destination before the console existed. Reading the session here
 * rather than always sending to /login is what stops an admin who clicks the
 * wordmark from being shown a login form they have already completed.
 */
export function AdminHomeRedirect() {
  useAuthBootstrap("admin");
  const user = useAppSelector((state) => userForPortal(state.auth, "admin"));
  const bootstrapped = useAppSelector((state) => portalIsBootstrapped(state.auth, "admin"));
  // Waiting for /me is not being signed out: redirecting before the answer
  // arrives sends every hard reload of /admin to the login page.
  if (!bootstrapped) return null;
  return <Navigate to={user?.portal === "admin" ? "/admin/dashboard" : "/admin/login"} replace />;
}

/** The recruiter prefix is a session door, not a public workspace preview. */
export function RecruiterHomeRedirect() {
  useAuthBootstrap("recruiter");
  const user = useAppSelector((state) => userForPortal(state.auth, "recruiter"));
  const bootstrapped = useAppSelector((state) =>
    portalIsBootstrapped(state.auth, "recruiter"),
  );

  if (!bootstrapped) return null;
  return <Navigate to={user ? "/hire/companies" : "/hire/login"} replace />;
}

/**
 * Sends the retired `/browse` board to `/jobs`, carrying the search across.
 *
 * `/browse` was the pre-4B list: keyword-only, driven by a redux field, with no
 * facets, no pagination and no loading state. `/jobs` is the same list done
 * properly, so keeping both advertised two boards where one was strictly worse
 * — and the hero search and the category carousel both pointed at the weaker
 * one, which is how most searches ended up there.
 *
 * The query rides along rather than being dropped: `/browse?keyword=react` is a
 * link someone may have shared, and `/jobs` reads `keyword` from the URL as its
 * own state, so the search survives the move without translation.
 */
export function BrowseRedirect() {
  const { search, hash } = useLocation();
  return <Navigate to={`/jobs${search}${hash}`} replace />;
}
