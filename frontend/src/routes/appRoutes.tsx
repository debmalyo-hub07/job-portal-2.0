import { lazy, Suspense } from "react";
import { type RouteObject } from "react-router-dom";

import Home from "@/components/Home";
import Jobs from "@/components/Jobs";
import Browse from "@/components/Browse";
import Profile from "@/components/Profile";
import JobDescription from "@/components/JobDescription";
import Companies from "@/components/admin/Companies";
import CompanyCreate from "@/components/admin/CompanyCreate";
import CompanySetup from "@/components/admin/CompanySetup";
import AdminJobs from "@/components/admin/AdminJobs";
import PostJob from "@/components/admin/PostJob";
import Applicants from "@/components/admin/Applicants";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import VerifyEmail from "@/components/auth/VerifyEmail";
import ForgotPassword from "@/components/auth/ForgotPassword";
import ResetPassword from "@/components/auth/ResetPassword";
import AuthComplete from "@/components/auth/AuthComplete";
import LinkPending from "@/components/auth/LinkPending";
import ConfirmGoogleLink from "@/components/auth/ConfirmGoogleLink";
import AuthError from "@/components/auth/AuthError";
import { buildAuthRoutes } from "@/routes/authRoutes";
import { RootLayout, WorkspaceRedirect } from "@/routes/routeElements";
import HireLanding from "@/pages/HireLanding";

const DesignGallery = import.meta.env.DEV
  ? lazy(() => import("@/components/design/DesignGallery"))
  : null;

/**
 * The route table, extracted from App.tsx so tests can assert against it
 * without mounting a router. A mistyped workspace path is a dead link rather
 * than a type error, so the table is worth asserting on directly.
 */
export const appRoutes: RouteObject[] = [
  {
    element: <RootLayout />,
    children: [
      { path: "/", element: <Home /> },
      // One component set, two mounts. The prefix is the only place a portal is
      // named on the client, and every call site passes a literal.
      ...buildAuthRoutes("seeker", ""),
      ...buildAuthRoutes("recruiter", "/hire"),
      { path: "/hire", element: <HireLanding /> },
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
      { path: "/browse", element: <Browse /> },
      { path: "/profile", element: <Profile /> },
      // The recruiter workspace. Under /hire since Phase 3A — /admin belongs to
      // the admin portal now, so the whole recruiter surface (marketing, auth,
      // workspace) sits under one prefix and resolves one signal colour.
      {
        path: "/hire/companies",
        element: (
          <ProtectedRoute portal="recruiter">
            <Companies />
          </ProtectedRoute>
        ),
      },
      {
        path: "/hire/companies/create",
        element: (
          <ProtectedRoute portal="recruiter">
            <CompanyCreate />
          </ProtectedRoute>
        ),
      },
      {
        path: "/hire/companies/:id",
        element: (
          <ProtectedRoute portal="recruiter">
            <CompanySetup />
          </ProtectedRoute>
        ),
      },
      {
        path: "/hire/jobs",
        element: (
          <ProtectedRoute portal="recruiter">
            <AdminJobs />
          </ProtectedRoute>
        ),
      },
      {
        path: "/hire/jobs/create",
        element: (
          <ProtectedRoute portal="recruiter">
            <PostJob />
          </ProtectedRoute>
        ),
      },
      {
        path: "/hire/jobs/:id/applicants",
        element: (
          <ProtectedRoute portal="recruiter">
            <Applicants />
          </ProtectedRoute>
        ),
      },
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
    ],
  },
];
