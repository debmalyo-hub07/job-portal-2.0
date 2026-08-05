import Login from "./components/auth/Login";
import Signup from "./components/auth/Signup";
import Navbar from "./components/shared/Navbar";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
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

const appRouter = createBrowserRouter([
  {
    path: "/",
    element: <Home />,
  },
  {
    path: "/login",
    element: <Login />,
  },
  {
    path: "/signup",
    element: <Signup />,
  },
  // Public auth pages. All of them read `?portal=` and validate it.
  {
    path: "/verify-email",
    element: <VerifyEmail />,
  },
  {
    path: "/forgot-password",
    element: <ForgotPassword />,
  },
  {
    path: "/reset-password",
    element: <ResetPassword />,
  },
  {
    path: "/auth/complete",
    element: <AuthComplete />,
  },
  {
    path: "/auth/link-pending",
    element: <LinkPending />,
  },
  {
    path: "/auth/confirm-google-link",
    element: <ConfirmGoogleLink />,
  },
  {
    path: "/auth/error",
    element: <AuthError />,
  },
  {
    path: "/jobs",
    element: <Jobs />,
  },
  {
    path: "/description/:id",
    element: <JobDescription />,
  },
  {
    path: "/browse",
    element: <Browse />,
  },
  {
    path: "/profile",
    element: <Profile />,
  },
  // for admin
  {
    path: "/admin/companies",
    element: <ProtectedRoute><Companies /></ProtectedRoute>,
  },
  {
    path: "/admin/companies/create",
    element: <ProtectedRoute><CompanyCreate /></ProtectedRoute>,
  },
  {
    path: "/admin/companies/:id",
    element: <ProtectedRoute><CompanySetup /></ProtectedRoute>,
  },
  {
    path: "/admin/jobs",
    element: <ProtectedRoute><AdminJobs /></ProtectedRoute>,
  },
  {
    path: "/admin/jobs/create",
    element: <ProtectedRoute><PostJob /></ProtectedRoute>,
  },
  {
    path: "/admin/jobs/:id/applicants",
    element: <ProtectedRoute><Applicants /></ProtectedRoute>,
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
