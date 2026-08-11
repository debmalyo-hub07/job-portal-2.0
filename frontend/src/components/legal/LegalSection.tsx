/**
 * One numbered-feeling section of a legal document.
 *
 * The `id` is load-bearing rather than decoration: it is what makes a clause
 * linkable, and a policy you cannot point someone at a specific paragraph of is
 * a policy nobody cites. `scroll-mt` keeps the heading clear of the sticky navbar
 * when arriving by fragment.
 *
 * Prose spacing is applied here so the pages themselves stay a list of sections
 * with no per-page spacing decisions — same reasoning as `PageShell` owning
 * density.
 */
export function LegalSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-24">
      <h2
        id={`${id}-heading`}
        className="font-display text-display-sm font-semibold text-balance text-ink"
      >
        {title}
      </h2>
      <div className="mt-4 flex flex-col gap-4 text-ink-muted [&_code]:rounded-sharp [&_code]:bg-signal-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-sm [&_code]:text-signal-text [&_strong]:font-semibold [&_strong]:text-ink">
        {children}
      </div>
    </section>
  );
}
