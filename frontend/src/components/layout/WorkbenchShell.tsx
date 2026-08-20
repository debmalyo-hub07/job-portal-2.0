import type { ReactNode } from "react";
import type { Portal } from "@jobportal/shared";
import { NavLink } from "react-router";

import Navbar from "@/components/shared/Navbar";
import PageShell from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { navLinksFor } from "@/components/shared/navLinks";
import { cn } from "@/lib/utils";

export function WorkbenchShell({
  portal,
  navLabel,
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  portal: Extract<Portal, "recruiter" | "admin">;
  navLabel: string;
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const links = navLinksFor(portal, "session");

  return (
    <>
      <Navbar />
      <PageShell density="compact" width="wide" motion="response" className="py-0">
        <div className="grid min-h-[calc(100svh-4.5rem)] lg:grid-cols-[13rem_minmax(0,1fr)]">
          {/* The 30% band. A workbench is mostly chrome, so the portal's hue
              belongs here as a large quiet field rather than only in the small
              accents — that is what makes the recruiter and admin consoles
              legible as different places at a glance. */}
          <aside className="border-b border-line bg-container px-4 py-5 lg:border-r lg:border-b-0 lg:py-8 lg:pr-6">
            <p className="mb-3 text-xs font-semibold uppercase text-signal-text">
              {eyebrow}
            </p>
            <nav aria-label={navLabel}>
              <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
                {links.map((link) => (
                  <li key={link.to}>
                    <NavLink
                      to={link.to}
                      end
                      className={({ isActive }) =>
                        cn(
                          "flex min-h-10 items-center rounded-sharp px-3 text-sm font-medium whitespace-nowrap transition-colors",
                          // Active lifts out of the band onto a raised surface
                          // rather than tinting it further: a signal wash over
                          // an already-tinted field is a tint on a tint, and
                          // nothing measures that pairing.
                          isActive
                            ? "bg-paper-raised text-ink shadow-sm"
                            : "text-ink-muted hover:bg-paper-raised hover:text-ink",
                        )
                      }
                    >
                      {link.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          <main className="min-w-0 py-7 md:py-8 md:pl-8">
            <PageHeader title={title} description={description} actions={actions} />
            {children}
          </main>
        </div>
      </PageShell>
    </>
  );
}
