import { Check } from "lucide-react";
import type { Portal } from "@jobportal/shared";
import { usePublicJobCount } from "@/hooks/usePublicJobCount";
import { AUTH_COPY } from "./authCopy";

/**
 * The portal-specific half of the auth split.
 *
 * ONE component. It differs by content and by the signal token the portal scope
 * already resolved — never by structure, and never by a `portal === ...` branch
 * that changes layout.
 *
 * Three vertical zones: headline, capability points, proof. They are centred as
 * one block rather than spread with justify-between — on a tall viewport
 * `between` pushes the headline to the ceiling and the proof to the floor, which
 * reintroduces the dead space this layout exists to remove.
 */
export function PortalPanel({ portal }: { portal: Portal }) {
  const copy = AUTH_COPY[portal];
  const { count, ready } = usePublicJobCount();

  return (
    <aside className="relative hidden overflow-hidden bg-signal-muted md:flex md:flex-col md:justify-center md:p-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-signal opacity-10 blur-3xl"
      />
      <div className="relative max-w-sm">
        <p className="font-display text-display-sm font-semibold text-balance text-ink">
          {copy.headline}
        </p>
        <p className="mt-3 text-sm text-ink-muted">{copy.sub}</p>

        <ul className="mt-10 space-y-4">
          {copy.points.map((point) => (
            <li key={point} className="flex items-start gap-3">
              <Check
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-signal-text"
              />
              <span className="text-sm text-ink">{point}</span>
            </li>
          ))}
        </ul>

        {/* min-h reserves the line so a late count does not reflow the panel. */}
        <p className="mt-10 min-h-10 border-t border-line pt-6 text-sm text-ink-muted">
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
      </div>
    </aside>
  );
}
