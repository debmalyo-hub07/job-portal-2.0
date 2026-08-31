import type { ReactNode } from "react";

import { WorkbenchShell } from "@/components/layout/WorkbenchShell";
import { ConsoleClock } from "./ConsoleClock";

export function AdminShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <WorkbenchShell
      portal="admin"
      navLabel="Admin sections"
      eyebrow="Platform console"
      title={title}
      description={description}
      actions={actions}
      // The console's live clock and calendar, in the side band on every
      // console screen. Admin-only: the recruiter workspace keeps its band.
      sidebarExtra={<ConsoleClock />}
    >
      {children}
    </WorkbenchShell>
  );
}

export default AdminShell;
