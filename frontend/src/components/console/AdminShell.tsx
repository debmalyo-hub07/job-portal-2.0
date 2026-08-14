import type { ReactNode } from "react";

import { WorkbenchShell } from "@/components/layout/WorkbenchShell";

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
    >
      {children}
    </WorkbenchShell>
  );
}

export default AdminShell;
