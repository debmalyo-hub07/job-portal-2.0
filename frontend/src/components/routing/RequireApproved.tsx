import type { ReactNode } from "react";
import { Clock } from "lucide-react";

import Navbar from "@/components/shared/Navbar";
import { PageShell } from "@/components/layout/PageShell";
import { EmptyState } from "@/components/layout/EmptyState";
import { useAppSelector } from "@/redux/store";

/**
 * The client half of the API's `requireApproved`.
 *
 * A recruiter registers as `pending` and stays there until an admin approves
 * them, and every recruiter-owned mutation answers 403
 * RECRUITER_PENDING_APPROVAL until then. Without this the workspace renders in
 * full — a post-job form that cannot submit and a company form that 403s on
 * save, with nothing on screen explaining why.
 *
 * It wraps the whole workspace rather than its entry page: the gate belongs
 * where the API puts it, on every route, not on the one a recruiter happens to
 * land on first. Presentation only — the API is what actually refuses the write.
 *
 * The Navbar stays so a pending recruiter can still reach the account menu and
 * sign out. Without it this is a page with no way off it.
 *
 * It lives in `routing/` rather than beside the workspace pages because it is a
 * gate, not a page — and `ProtectedRoute` next to it serves the admin console
 * too, which must not import from a directory named for the other portal.
 */
export function RequireApproved({ children }: { children: ReactNode }) {
  const { user } = useAppSelector((state) => state.auth);

  if (user?.portal === "recruiter" && user.status === "pending") {
    return (
      <>
        <Navbar />
        <PageShell density="compact" width="default">
          <EmptyState
            icon={Clock}
            title="Awaiting approval"
            description="An admin is reviewing your recruiter account. You'll get an email as soon as it's approved, and you can post roles then."
          />
        </PageShell>
      </>
    );
  }

  return <>{children}</>;
}

export default RequireApproved;
