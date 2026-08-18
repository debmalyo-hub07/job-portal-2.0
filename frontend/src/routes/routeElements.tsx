import { Navigate, Outlet, useLocation } from "react-router";

import { PortalScope } from "@/components/theme/PortalScope";
import HireLanding from "@/pages/HireLanding";
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
 * internal surface. `/admin` still has to resolve to something: it is a URL
 * people type and bookmark, and the prefix owns the whole console.
 *
 * Signed in as an admin, that is the dashboard; otherwise the sign-in. Reading
 * the session here rather than always sending to /login is what stops an admin
 * with a live session from being shown a login form they have already completed.
 *
 * No auth screen points here any more. `AUTH_COPY.admin.homeHref` is null
 * precisely because this redirect resolves to the sign-in for a signed-out
 * visitor, which made the wordmark and Back link on `/admin/login` no-ops.
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

/**
 * The recruiter portal's front door.
 *
 * `/hire` is the employer marketing page, and it is also what the wordmark and
 * the Back link on every recruiter auth screen point at — so it has to answer
 * for a visitor carrying no session at all. `HireLanding` is that answer.
 *
 * It redirected an anonymous visitor to `/hire/login` for a phase, which turned
 * both of those controls into no-ops: clicking Back on `/hire/login` navigated
 * to `/hire`, which sent you straight back to the page you were leaving. The
 * portal looked like it was holding a session it did not have, and the only way
 * out of the form was the cross-link to the seeker side. The footer's "Hire on
 * Cairn" and the navbar's "For employers" landed on a login form for the same
 * reason, and `HireLanding` sat mounted nowhere — the orphan pattern `/jobs` had.
 *
 * The session door survives where it earns its keep: a recruiter who *is*
 * signed in gets their workspace rather than a pitch to sign up. Protecting the
 * prefix was never what the redirect achieved — a marketing page reads no
 * workspace data, and every `/hire/*` page carries its own gates.
 */
export function RecruiterHome() {
  useAuthBootstrap("recruiter");
  const user = useAppSelector((state) => userForPortal(state.auth, "recruiter"));
  const bootstrapped = useAppSelector((state) =>
    portalIsBootstrapped(state.auth, "recruiter"),
  );

  // Deciding before /me answers would show the marketing page to a recruiter
  // reloading `/hire` and then yank it away. Anonymous visitors do not pay for
  // the wait: useAuthBootstrap marks a portal with no session hint bootstrapped
  // without making a request.
  if (!bootstrapped) return null;
  if (user) return <Navigate to="/hire/companies" replace />;
  return <HireLanding />;
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
