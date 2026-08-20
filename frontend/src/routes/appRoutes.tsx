import { lazy, Suspense, type ReactNode } from "react";
import { type RouteObject } from "react-router";

import Home from "@/components/Home";
import Jobs from "@/components/Jobs";
import Profile from "@/components/Profile";
import NotFound from "@/components/NotFound";
import JobDescription from "@/components/JobDescription";
import WorkspaceCompanies from "@/components/workspace/WorkspaceCompanies";
import CompanyCreate from "@/components/workspace/CompanyCreate";
import CompanyEdit from "@/components/workspace/CompanyEdit";
import WorkspaceJobs from "@/components/workspace/WorkspaceJobs";
import JobCreate from "@/components/workspace/JobCreate";
import Applicants from "@/components/workspace/Applicants";
import ProtectedRoute from "@/components/routing/ProtectedRoute";
import RequireApproved from "@/components/routing/RequireApproved";
import AdminDashboard from "@/components/console/AdminDashboard";
import AdminRecruiters from "@/components/console/AdminRecruiters";
import AdminJobsConsole from "@/components/console/AdminJobsConsole";
import AdminCompanies from "@/components/console/AdminCompanies";
import VerifyEmail from "@/components/auth/VerifyEmail";
import ForgotPassword from "@/components/auth/ForgotPassword";
import ResetPassword from "@/components/auth/ResetPassword";
import AuthComplete from "@/components/auth/AuthComplete";
import LinkPending from "@/components/auth/LinkPending";
import ConfirmGoogleLink from "@/components/auth/ConfirmGoogleLink";
import AuthError from "@/components/auth/AuthError";
import { buildAuthRoutes } from "@/routes/authRoutes";
import {
  AdminHomeRedirect,
  BrowseRedirect,
  RecruiterHome,
  RootLayout,
  WorkspaceRedirect,
} from "@/routes/routeElements";
import About from "@/pages/About";
import Contact from "@/pages/Contact";
import Help from "@/pages/Help";
import Privacy from "@/pages/Privacy";
import Terms from "@/pages/Terms";
import Updates from "@/pages/Updates";
import { PublicLayout } from "@/components/layout/PublicLayout";

const DesignGallery = import.meta.env.DEV
  ? lazy(() => import("@/components/design/DesignGallery"))
  : null;

/**
 * Every recruiter workspace page carries the same two gates, in the same order
 * the API applies them: the portal check first (`authenticate("recruiter")`),
 * then the approval check (`requireApproved`). Composing them here rather than
 * per route is what keeps a new workspace page from shipping with one of them
 * missing.
 */
const workspace = (page: ReactNode) => (
  <ProtectedRoute portal="recruiter">
    <RequireApproved>{page}</RequireApproved>
  </ProtectedRoute>
);

/**
 * Every admin console page carries the portal gate and nothing else. There is
 * no approval concept for admins — the collection has no self-service door, so
 * an admin row exists only because `seed:admin` or another admin created it.
 *
 * Composed here for the same reason `workspace` is: a console page added later
 * inherits the gate instead of being one forgotten wrapper away from rendering
 * a moderation table to a seeker.
 */
const adminConsole = (page: ReactNode) => <ProtectedRoute portal="admin">{page}</ProtectedRoute>;

/**
 * The route table, extracted from App.tsx so tests can assert against it
 * without mounting a router. A mistyped workspace path is a dead link rather
 * than a type error, so the table is worth asserting on directly.
 */
export const appRoutes: RouteObject[] = [
  {
    element: <RootLayout />,
    children: [
      // Surfaces that carry the site chrome — navbar and footer — mounted once
      // by the layout rather than by each page. The footer used to be imported
      // by `Home` alone while the navbar was hand-mounted in nine components,
      // so every link the footer carried was reachable from the landing page
      // and nowhere else.
      //
      // The signed-in working surfaces (workspace, console, auth) stay outside:
      // they have their own shells and sub-navigation, and a marketing footer
      // under an applicant table is noise. The informational URLs are public, so
      // they remain reachable from anywhere regardless.
      {
        element: <PublicLayout />,
        children: [
          {
            path: "/",
            element: <Home />,
          },
          { path: "/jobs", element: <Jobs /> },
          { path: "/description/:id", element: <JobDescription /> },
          {
            path: "/profile",
            element: (
              <ProtectedRoute portal="seeker">
                <Profile />
              </ProtectedRoute>
            ),
          },
          // The employer landing page. `/hire` is to the recruiter portal what `/`
          // is to the seeker one, so it carries the same chrome — the navbar
          // already treats it as a hero route and the footer links it as "Hire on
          // Cairn". Mounted through RecruiterHome rather than as the page itself
          // so a recruiter who already has a session gets their workspace.
          { path: "/hire", element: <RecruiterHome /> },
          // The informational surfaces. `siteNav.ts` lists the same paths for
          // the footer, and publicPages.test.tsx asserts the two agree — a page
          // mounted but unlinked is how /jobs stayed orphaned for a phase.
          { path: "/about", element: <About /> },
          { path: "/contact", element: <Contact /> },
          { path: "/help", element: <Help /> },
          { path: "/updates", element: <Updates /> },
          { path: "/privacy", element: <Privacy /> },
          { path: "/terms", element: <Terms /> },
        ],
      },
      // One component set, two mounts. The prefix is the only place a portal is
      // named on the client, and every call site passes a literal.
      ...buildAuthRoutes("seeker", ""),
      ...buildAuthRoutes("recruiter", "/hire"),
      // No signup on admin: the API's admin router mounts no /register either.
      ...buildAuthRoutes("admin", "/admin", { withSignup: false }),
      // The admin console has no marketing page, but `/admin` is still typed and
      // bookmarked, and it owns the whole console prefix. Resolves by session:
      // dashboard for an admin, the sign-in for anyone else.
      { path: "/admin", element: <AdminHomeRedirect /> },
      // Public auth pages. All of them read `?portal=` and validate it.
      { path: "/verify-email", element: <VerifyEmail /> },
      { path: "/forgot-password", element: <ForgotPassword /> },
      { path: "/reset-password", element: <ResetPassword /> },
      { path: "/auth/complete", element: <AuthComplete /> },
      { path: "/auth/link-pending", element: <LinkPending /> },
      { path: "/auth/confirm-google-link", element: <ConfirmGoogleLink /> },
      { path: "/auth/error", element: <AuthError /> },
      { path: "/jobs", element: <Jobs /> },
      { path: "/description/:id", element: <JobDescription /> },
      // The pre-4B board. Kept as a redirect because it was the destination of
      // the hero search and every category chip, so it is in browser histories
      // and shared links. See BrowseRedirect for why the query rides along.
      { path: "/browse", element: <BrowseRedirect /> },
      // The recruiter workspace. Under /hire since Phase 3A — /admin belongs to
      // the admin portal now, so the whole recruiter surface (marketing, auth,
      // workspace) sits under one prefix and resolves one signal colour.
      { path: "/hire/companies", element: workspace(<WorkspaceCompanies />) },
      { path: "/hire/companies/create", element: workspace(<CompanyCreate />) },
      { path: "/hire/companies/:id", element: workspace(<CompanyEdit />) },
      { path: "/hire/jobs", element: workspace(<WorkspaceJobs />) },
      { path: "/hire/jobs/create", element: workspace(<JobCreate />) },
      { path: "/hire/jobs/:id/applicants", element: workspace(<Applicants />) },
      // The admin console.
      //
      // Deliberately NOT /admin/jobs and /admin/companies: those two prefixes
      // belong to the pre-3A recruiter workspace redirects below, and a
      // recruiter's bookmark of /admin/jobs must keep resolving to /hire/jobs.
      // Taking the bare path for the console would break that silently — the
      // recruiter would land on a console page their portal cannot open, be
      // bounced by the gate, and never reach the workspace they asked for.
      // "review" names what these screens are: moderation, not the recruiter's
      // own listings.
      { path: "/admin/dashboard", element: adminConsole(<AdminDashboard />) },
      { path: "/admin/recruiters", element: adminConsole(<AdminRecruiters />) },
      { path: "/admin/review/jobs", element: adminConsole(<AdminJobsConsole />) },
      { path: "/admin/review/companies", element: adminConsole(<AdminCompanies />) },
      // Pre-3A workspace URLs. The workspace lived under /admin through 2B-1, so
      // a recruiter's bookmarks and any shared link still point there — and /admin
      // now resolves to the ADMIN portal, which would show them a console door
      // rather than a 404. The splat matches the bare prefix too, so
      // /admin/companies and /admin/companies/:id both land correctly.
      //
      // These are the only /admin literals outside the admin portal's own copy;
      // an in-component navigate() to one is a dead link, which is what
      // tests/workspaceRoutes.test.tsx scans the source for.
      { path: "/admin/companies/*", element: <WorkspaceRedirect /> },
      { path: "/admin/jobs/*", element: <WorkspaceRedirect /> },
      // DEV-only. `import.meta.env.DEV` is statically false in a production
      // build, so Rollup drops both this route and the dynamic import.
      ...(import.meta.env.DEV && DesignGallery
        ? [
            {
              path: "/_design",
              element: (
                <Suspense fallback={null}>
                  <DesignGallery />
                </Suspense>
              ),
            },
          ]
        : []),
      // Last, and it must stay last to read correctly — though react-router
      // ranks by specificity rather than declaration order, so `*` loses to
      // every literal path above regardless of where it sits.
      //
      // Mandatory since the SPA rewrite: the host answers an unresolved path
      // with 200 and index.html, so a mistyped URL arrives here instead of at
      // the host's 404 page. Without this entry the router matches nothing and
      // the visitor gets a blank page. See vercel.json and public/_redirects.
      { path: "*", element: <NotFound /> },
    ],
  },
];
