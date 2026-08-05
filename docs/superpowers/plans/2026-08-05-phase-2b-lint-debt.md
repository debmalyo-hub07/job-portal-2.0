# Phase 2B lint debt

Violations surfaced when `frontend/eslint.config.js` gained a `**/*.{ts,tsx}`
block in Phase 2B-1 (Task 1). Before that, no `.tsx` file in the frontend was
linted at all — every one resolved to "File ignored because no matching
configuration was supplied" and `npm run lint` exited 0 vacuously.

These are in files Phase 2B-1 does not touch, so they are recorded rather than
fixed or silenced. Neither is an error; both are warnings and neither blocks
`npm run lint`.

## Open

| File | Rule | Note |
|---|---|---|
| `src/components/admin/AdminJobs.tsx:18` | `react-hooks/exhaustive-deps` | `useEffect` missing `dispatch` |
| `src/components/admin/Companies.tsx:18` | `react-hooks/exhaustive-deps` | `useEffect` missing `dispatch` |

Both are the same shape: an effect that dispatches a search-filter action on
every keystroke and omits `dispatch` from its dependency array. `dispatch` is
referentially stable in Redux Toolkit, so neither is a live bug — but the
warning is correct that the array is lying, and the honest fix is to include it.

Both files belong to the recruiter workspace, rebuilt in **Phase 2B-3**. Fix
them there rather than in a drive-by, since the effects themselves are likely
to be replaced.

## Resolved by configuration

`react-refresh/only-export-components` fired as an **error** on
`src/components/ui/badge.tsx:50` and `button.tsx:61`, which export a CVA
variants function beside their component.

Not suppressed — scoped. `eslint.config.js` allows exactly the names
`buttonVariants` and `badgeVariants` under `src/components/ui/**`, because
sibling files genuinely import them (`pagination.tsx` → `buttonVariants`,
`AppliedJobTable.tsx` → `badgeVariants`) and the rule guards Fast Refresh
ergonomics rather than correctness. Any *other* non-component export from those
files still errors; verified by probe.
