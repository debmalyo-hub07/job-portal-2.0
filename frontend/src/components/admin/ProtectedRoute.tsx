import { useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAppSelector } from "@/redux/store";

type ProtectedRouteProps = {
  children: ReactNode;
};

/**
 * Client-side guard only — it hides UI, it does not protect data. Every
 * recruiter route must also be authorized server-side; see SECURITY.md, which
 * tracks the missing ownership checks scheduled for Phase 1C.
 */
const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { user, bootstrapped } = useAppSelector((state) => state.auth);
  const navigate = useNavigate();

  useEffect(() => {
    // Waiting for /me is not the same as being signed out. Without this, every
    // hard reload of an admin page bounces the recruiter to the home page
    // before the answer arrives.
    if (!bootstrapped) return;
    if (!user || user.portal !== "recruiter") navigate("/", { replace: true });
  }, [user, bootstrapped, navigate]);

  // The inherited version rendered `children` while redirecting, so admin UI
  // flashed on screen for non-recruiters and its data fetches fired. Render
  // nothing until the check passes.
  if (!bootstrapped || !user || user.portal !== "recruiter") return null;
  return <>{children}</>;
};

export default ProtectedRoute;
