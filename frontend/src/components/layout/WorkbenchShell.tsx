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
        <div className="grid min-h-[calc(100svh-4.5rem)] md:grid-cols-[13rem_minmax(0,1fr)]">
          <aside className="border-b border-line py-5 md:border-r md:border-b-0 md:py-8 md:pr-6">
            <p className="mb-3 text-xs font-semibold uppercase text-signal-text">
              {eyebrow}
            </p>
            <nav aria-label={navLabel}>
              <ul className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
                {links.map((link) => (
                  <li key={link.to}>
                    <NavLink
                      to={link.to}
                      end
                      className={({ isActive }) =>
                        cn(
                          "flex min-h-10 items-center rounded-sharp px-3 text-sm font-medium whitespace-nowrap transition-colors",
                          isActive
                            ? "bg-signal-muted text-ink"
                            : "text-ink-muted hover:bg-paper-sunken hover:text-ink",
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
