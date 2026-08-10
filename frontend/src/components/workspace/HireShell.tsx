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
 * has them: this is work, not marketing, so Tier 3 feedback only — no ambient
 * loops, no scroll narrative. `/hire` itself stays spacious, because density
 * follows the surface's job rather than the portal.
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
