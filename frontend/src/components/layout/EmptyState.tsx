import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Replaces the bare-text empty states the inherited pages used ("No jobs
 * found", "No skills listed", "No applied jobs found"). Centred deliberately —
 * a standalone empty state is one of the few genuinely centred moments the
 * left-axis rule allows.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-surface border border-line bg-paper-raised px-6 py-16 text-center">
      <Icon aria-hidden="true" className="mb-4 size-8 text-ink-muted" />
      <p className="text-lg font-medium text-ink">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
