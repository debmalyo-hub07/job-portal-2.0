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
  const { user } = useAppSelector((state) => state.auth);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user || user.role !== "recruiter") {
      navigate("/");
    }
  }, [user, navigate]);

  return <>{children}</>;
};

export default ProtectedRoute;
