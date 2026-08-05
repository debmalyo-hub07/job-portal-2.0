import type { Portal } from "@jobportal/shared";
import { usePublicJobCount } from "@/hooks/usePublicJobCount";
import { AUTH_COPY } from "./authCopy";

/**
 * The portal-specific half of the auth split.
 *
 * ONE component. It differs by content and by the signal token the portal scope
 * already resolved — never by structure, and never by a `portal === ...` branch
 * that changes layout.
 */
export function PortalPanel({ portal }: { portal: Portal }) {
  const copy = AUTH_COPY[portal];
  const { count, ready } = usePublicJobCount();

  return (
    <aside className="relative hidden overflow-hidden bg-signal-muted md:flex md:flex-col md:justify-between md:p-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-signal opacity-10 blur-3xl"
      />
      <div className="relative">
        <p className="font-display text-display-sm font-semibold text-balance text-ink">
          {copy.headline}
        </p>
        <p className="mt-3 max-w-sm text-sm text-ink-muted">{copy.sub}</p>
      </div>

      {/* min-h reserves the line so a late count does not reflow the panel. */}
      <p className="relative min-h-10 text-sm text-ink-muted">
        {!ready ? null : count !== null ? (
          <>
            <span className="font-mono text-lg text-signal-text">
              {count.toLocaleString()}
            </span>{" "}
            open roles right now
          </>
        ) : (
          copy.fallbackProof
        )}
      </p>
    </aside>
  );
}
