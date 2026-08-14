import type { ReactNode } from "react";

import { WorkbenchShell } from "@/components/layout/WorkbenchShell";

export function HireShell({
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
      portal="recruiter"
      navLabel="Workspace sections"
      eyebrow="Hiring workspace"
      title={title}
      description={description}
      actions={actions}
    >
      {children}
    </WorkbenchShell>
  );
}

export default HireShell;
