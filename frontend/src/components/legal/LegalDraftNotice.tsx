import { AlertTriangle } from "lucide-react";

/**
 * The banner every legal page carries until counsel has reviewed it.
 *
 * `role="alert"` rather than a styled box: this is the one thing on the page a
 * reader must not skim past, and it is the assertion `publicPages.test.tsx`
 * makes — a legal page that loses its marker fails a named test rather than
 * quietly becoming a claim nobody made.
 *
 * The wording names what is missing (an operating entity, a jurisdiction, a
 * processor list) instead of saying "coming soon", because a reader deciding
 * whether to upload a CV needs to know which parts describe real behaviour and
 * which are unfilled blanks.
 */
export function LegalDraftNotice({ page }: { page: string }) {
  return (
    <div
      role="alert"
      className="mt-(--space-card) flex gap-3 rounded-surface border border-warn bg-warn-muted p-(--space-card)"
    >
      <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warn-text" />
      <div className="text-sm text-ink">
        <p className="font-semibold">This {page} is a working draft, pending legal review.</p>
        <p className="mt-1 text-ink-muted">
          The behaviour it describes is accurate — it was written from what the application
          actually does with data. What it does not yet carry is a named operating entity, a
          governing jurisdiction, or the full list of sub-processors. Those are for counsel to
          supply before Cairn accepts public sign-ups, and this notice stays until they do.
        </p>
      </div>
    </div>
  );
}
