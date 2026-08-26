/**
 * The field surface for the controls with no primitive of their own —
 * `<textarea>` and `<select>`.
 *
 * Deliberately the same surface `Input` paints, and it lives in one place
 * because it had already drifted: two byte-identical copies of this string sat
 * in `JobForm` and `CompanyEdit`, one of them under a comment warning that
 * repeating it "is how the two drift". Neither copy styled a placeholder at all,
 * so every textarea and select in the workspace fell back to the browser's
 * default grey in both themes.
 *
 * A module of its own rather than an export from `input.tsx`, for the same
 * reason `portalRoutes.ts` sits apart from `PortalScope`: a file that exports
 * both a component and a non-component loses Fast Refresh for the component,
 * and eslint's `react-refresh/only-export-components` fails the build over it.
 *
 * `placeholder:text-ink-faint` is the 3:1 caption grade, not `ink-muted`. See
 * the ink ramp in index.css: a placeholder at the secondary-copy weight reads as
 * a value someone typed.
 */
export const FIELD_SURFACE =
  "w-full rounded-surface border border-line-strong bg-paper px-3 py-2 text-sm text-ink " +
  "placeholder:text-ink-faint " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-ring";
