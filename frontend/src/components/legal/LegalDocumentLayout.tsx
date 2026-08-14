import type { ReactNode } from "react";

import { PageShell } from "@/components/layout/PageShell";
import { LegalDraftNotice } from "@/components/legal/LegalDraftNotice";

type SectionLink = { id: string; title: string };

export function LegalDocumentLayout({
  title,
  description,
  updated,
  noticePage,
  sections,
  children,
}: {
  title: string;
  description: string;
  updated: string;
  noticePage: string;
  sections: SectionLink[];
  children: ReactNode;
}) {
  return (
    <PageShell width="wide" motion="standard">
      <header className="grid gap-8 border-b border-line pb-10 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase text-signal-text">Legal</p>
          <h1 className="mt-3 max-w-3xl font-display text-display-lg font-semibold text-balance text-ink">
            {title}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-ink-muted">{description}</p>
        </div>
        <dl className="grid gap-3 border-l border-line pl-5 text-sm">
          <div>
            <dt className="text-xs uppercase text-ink-muted">Last updated</dt>
            <dd className="mt-1 font-medium text-ink">{updated}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-ink-muted">Status</dt>
            <dd className="mt-1 font-medium text-ink">Working draft</dd>
          </div>
        </dl>
      </header>

      <LegalDraftNotice page={noticePage} />

      <div className="mt-(--space-section) grid gap-12 lg:grid-cols-[15rem_minmax(0,42rem)] lg:gap-16">
        <aside className="self-start lg:sticky lg:top-28">
          <p className="text-xs font-semibold uppercase text-ink-muted">On this page</p>
          <nav aria-label={`${title} sections`} className="mt-4">
            <ol className="border-l border-line">
              {sections.map((section, index) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="group flex gap-3 border-l-2 border-transparent py-2 pl-4 text-sm text-ink-muted transition-[color,border-color,transform] duration-(--dur-fast) hover:translate-x-1 hover:border-signal hover:text-ink focus-visible:border-signal focus-visible:text-ink focus-visible:outline-none"
                  >
                    <span className="font-mono text-xs text-ink-muted/70">{String(index + 1).padStart(2, "0")}</span>
                    <span>{section.title}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <article className="min-w-0 space-y-(--space-section)">{children}</article>
      </div>
    </PageShell>
  );
}
