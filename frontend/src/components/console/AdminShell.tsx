import type { ReactNode } from "react";
import { NavLink } from "react-router";

import Navbar from "@/components/shared/Navbar";
import PageShell from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { navLinksFor } from "@/components/shared/navLinks";
import { cn } from "@/lib/utils";

/**
 * The admin console's frame.
 *
 * `motion="response"` was the spec's success criterion 6 — Tier 3 feedback only,
 * nothing ambient, no scroll narrative. Phase 5 reverses that criterion: motion
 * reaches every surface, and `response` becomes the **cap** rather than the
 * refusal. It resolves `--motion-reveal-distance` to `0px`, so a `Reveal` here is
 * an opacity-only arrival, and the dashboard's figures animate when a moderation
 * action changes them — which is feedback about the action, not decoration.
 *
 * The console still gets no `Atmosphere`, on a measurement rather than a
 * judgement: `Atmosphere.tsx` records the admin signal composited over paper at
 * alpha 0.15 measuring 4.39:1, below the 4.5:1 floor every other pairing clears.
 * The admin signal is the one that cannot carry a field. Nothing animates behind
 * a moderation table either.
 *
 * `density="compact"` for the original reason; these are dense moderation
 * screens, not a landing page.
 *
 * The sub-navigation reads `navLinksFor("admin")` rather than listing routes
 * again, so the console's own tabs, the desktop navbar and the mobile sheet can
 * never disagree about what pages exist.
 */
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
  const links = navLinksFor("admin");

  return (
    <>
      <Navbar />
      <PageShell density="compact" width="wide" motion="response">
        <PageHeader title={title} description={description} actions={actions} />

        <nav aria-label="Admin sections" className="mb-(--space-card) border-b border-line">
          <ul className="flex flex-wrap gap-1">
            {links.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  end
                  className={({ isActive }) =>
                    cn(
                      "inline-block rounded-t-sharp px-3 py-2 text-sm font-medium transition-colors",
                      // The active tab is marked by weight and a signal
                      // underline, never by colour alone — same rule the
                      // Badge variants follow.
                      isActive
                        ? "border-b-2 border-signal text-signal-text"
                        : "border-b-2 border-transparent text-ink-muted hover:text-ink",
                    )
                  }
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {children}
      </PageShell>
    </>
  );
}

export default AdminShell;
