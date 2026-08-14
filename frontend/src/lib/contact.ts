/**
 * The one support address, and the only place it is written.
 *
 * A support address hand-written per page is how three pages end up offering
 * three different mailboxes, two of which nobody reads. Both the contact page
 * and the legal pages route through here.
 *
 * It is a placeholder until the domain's mail is set up — kept obvious rather
 * than plausible, so it cannot be mistaken for a live mailbox. The compile-time
 * home for it means changing it is one edit.
 */
export const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL?.trim() || "hello@cairn.example";

/**
 * A `mailto:` with an optional prefilled subject.
 *
 * `encodeURIComponent` because a subject carries spaces and an ampersand would
 * otherwise start a second query parameter.
 */
export function mailtoHref(subject?: string): string {
  const base = `mailto:${SUPPORT_EMAIL}`;
  return subject ? `${base}?subject=${encodeURIComponent(`Cairn — ${subject}`)}` : base;
}
