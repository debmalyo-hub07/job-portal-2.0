import { createBrowserRouter, Outlet, RouterProvider } from "react-router-dom";
import Home from "./components/Home";
import Jobs from "./components/Jobs";
import Browse from "./components/Browse";
import Profile from "./components/Profile";
import JobDescription from "./components/JobDescription";
import Companies from "./components/admin/Companies";
import CompanyCreate from "./components/admin/CompanyCreate";
import CompanySetup from "./components/admin/CompanySetup";
import AdminJobs from "./components/admin/AdminJobs";
import PostJob from "./components/admin/PostJob";
import Applicants from "./components/admin/Applicants";
import ProtectedRoute from "./components/admin/ProtectedRoute";
import VerifyEmail from "./components/auth/VerifyEmail";
import ForgotPassword from "./components/auth/ForgotPassword";
import ResetPassword from "./components/auth/ResetPassword";
import AuthComplete from "./components/auth/AuthComplete";
import LinkPending from "./components/auth/LinkPending";
import ConfirmGoogleLink from "./components/auth/ConfirmGoogleLink";
import AuthError from "./components/auth/AuthError";
import { useAuthBootstrap } from "./hooks/useAuthBootstrap";
import { PortalScope } from "./components/theme/PortalScope";
import { buildAuthRoutes } from "./routes/authRoutes";
import HireLanding from "./pages/HireLanding";
import { lazy, Suspense } from "react";

const DesignGallery = import.meta.env.DEV
  ? lazy(() => import("./components/design/DesignGallery"))
  : null;

function RootLayout() {
  return (
    <PortalScope>
      <Outlet />
    </PortalScope>
  );
}

const appRouter = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: "/", element: <Home /> },
      // One component set, two mounts. The prefix is the only place a portal is
      // named on the client, and both call sites pass a literal.
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
      // for admin
      { path: "/admin/companies", element: <ProtectedRoute><Companies /></ProtectedRoute> },
      { path: "/admin/companies/create", element: <ProtectedRoute><CompanyCreate /></ProtectedRoute> },
      { path: "/admin/companies/:id", element: <ProtectedRoute><CompanySetup /></ProtectedRoute> },
      { path: "/admin/jobs", element: <ProtectedRoute><AdminJobs /></ProtectedRoute> },
      { path: "/admin/jobs/create", element: <ProtectedRoute><PostJob /></ProtectedRoute> },
      { path: "/admin/jobs/:id/applicants", element: <ProtectedRoute><Applicants /></ProtectedRoute> },
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
]);
function App() {
  // Above the router, not inside a route component: a component that unmounts
  // on navigation would re-fire /me on every route change.
  useAuthBootstrap();
  return (
    <div>
      <RouterProvider router={appRouter} />
    </div>
  );
}

export default App;
