import { useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router";
import type { Portal } from "@jobportal/shared";
import { useAppSelector } from "@/redux/store";

type ProtectedRouteProps = {
  children: ReactNode;
  /**
   * The portal this subtree belongs to. A route literal, exactly like the API's
   * `authenticate(portal)` — never read from state, a control or the URL. Since
   * Phase 3A there are three portals, so a subtree that assumed "recruiter"
   * would admit an admin to the recruiter workspace.
   */
  portal: Portal;
};

/**
 * Client-side guard only — it hides UI, it does not protect data. Every
 * recruiter and admin route is also authorized server-side.
 */
const ProtectedRoute = ({ children, portal }: ProtectedRouteProps) => {
  const { user, bootstrapped } = useAppSelector((state) => state.auth);
  const navigate = useNavigate();

  useEffect(() => {
    // Waiting for /me is not the same as being signed out. Without this, every
    // hard reload of a workspace page bounces the recruiter to the home page
    // before the answer arrives.
    if (!bootstrapped) return;
    if (!user || user.portal !== portal) navigate("/", { replace: true });
  }, [user, bootstrapped, navigate, portal]);

  // The inherited version rendered `children` while redirecting, so workspace
  // UI flashed on screen for the wrong portal and its data fetches fired.
  // Render nothing until the check passes.
  if (!bootstrapped || !user || user.portal !== portal) return null;
  return <>{children}</>;
};

export default ProtectedRoute;
