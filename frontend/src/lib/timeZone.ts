/**
 * Timezone resolution for the console's live clock — P1 of the
 * location-aware phase.
 *
 * A lib module rather than part of the component file, because a module
 * exporting both a component and a plain function loses Fast Refresh for the
 * component (the same rule `lib/motion.tsx` records for its own constants).
 *
 * The browser's `Intl` API is the source: exact, offline, free, and the same
 * signal any platform uses. Asia/Kolkata is the default when the runtime
 * reports nothing — the phase decision of 2026-08-31 — so the clock always has
 * an answer, and an India-based admin sees IST before they ever touch the
 * picker.
 */

/** The fallback zone: IST, per the phase decision of 2026-08-31. */
export const DEFAULT_ZONE = "Asia/Kolkata";

/** Curated choices: the common working zones for a platform run from India. */
export const ZONE_CHOICES = [
  { id: "Asia/Kolkata", label: "IST — India" },
  { id: "UTC", label: "UTC" },
  { id: "Asia/Dubai", label: "GST — Dubai" },
  { id: "Asia/Singapore", label: "SGT — Singapore" },
  { id: "Europe/London", label: "BST — London" },
  { id: "Europe/Berlin", label: "CET — Berlin" },
  { id: "America/New_York", label: "ET — New York" },
  { id: "America/Los_Angeles", label: "PT — Los Angeles" },
  { id: "Australia/Sydney", label: "AET — Sydney" },
] as const;

/**
 * The browser's zone, or the IST default when the runtime reports nothing or
 * throws. The check is existence, not membership: a zone outside the curated
 * list is still the viewer's own zone and is offered in the picker.
 *
 * The resolver is injectable because Node's no-arg `Intl.DateTimeFormat()`
 * resolves the default timezone through an internal fast path that never
 * calls the JS-visible `resolvedOptions` — so the fallback cannot be tested
 * by spying on the prototype (three CI runs were red before that was
 * understood). The default preserves the production behaviour exactly.
 */
export function detectTimeZone(
  resolve: () => Intl.ResolvedDateTimeFormatOptions = () => Intl.DateTimeFormat().resolvedOptions(),
): string {
  try {
    return resolve().timeZone || DEFAULT_ZONE;
  } catch {
    return DEFAULT_ZONE;
  }
}
