import type { ReactNode } from "react";
import { NavLink } from "react-router";

import Navbar from "@/components/shared/Navbar";
import PageShell from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { navLinksFor } from "@/components/shared/navLinks";
import { cn } from "@/lib/utils";

/**
 * The recruiter workspace's frame, mirroring `console/AdminShell`.
 *
 * `motion="response"` and `density="compact"` for the same reason the console
 * has them: this is work, not marketing. Since Phase 5 that tier is a **cap, not
 * a refusal** — 4A criterion 6 said Tier 3 only, and the reversal is deliberate.
 * `response` resolves `--motion-reveal-distance` to `0px` and ambient amplitude
 * to a quarter, so a `Reveal` on this surface is an opacity-only arrival and a
 * dashboard figure still animates when it changes. No page passes a flag or
 * shortens a duration by hand; the tier is the whole mechanism.
 *
 * What it does not get is an `Atmosphere`, and that is a measurement rather than
 * a preference: `Atmosphere.tsx` records the admin signal over paper at alpha
 * 0.15 landing on 4.39:1, under the 4.5:1 floor. Nothing animated goes behind a
 * data table either — the table is the subject.
 *
 * `/hire` itself stays spacious, because density follows the surface's job rather
 * than the portal.
 *
 * The sub-navigation reads `navLinksFor("recruiter")` rather than listing routes
 * again, so the shell's tabs, the desktop navbar and the mobile sheet can never
 * disagree about which pages exist.
 */
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
  const links = navLinksFor("recruiter");

  return (
    <>
      <Navbar />
      <PageShell density="compact" width="wide" motion="response">
        <PageHeader title={title} description={description} actions={actions} />

        <nav aria-label="Workspace sections" className="mb-(--space-card) border-b border-line">
          <ul className="flex flex-wrap gap-1">
            {links.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  end
                  className={({ isActive }) =>
                    cn(
                      "inline-block rounded-t-sharp px-3 py-2 text-sm font-medium transition-colors",
                      // Weight and a signal underline, never colour alone.
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

export default HireShell;
