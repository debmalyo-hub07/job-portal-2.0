import type { ReactNode } from "react";

/**
 * Every page gets one of these. Before 2B the workspace screens had no heading
 * at all — a filter input and a table, starting cold — which is why this is a
 * primitive rather than a convention.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-(--space-card) flex items-start justify-between gap-6">
      <div className="min-w-0">
        {/* text-display-sm = 1.777rem, above the 20px Fraunces floor. */}
        <h1 className="font-display text-display-sm font-semibold text-balance text-ink">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-prose text-sm text-ink-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
