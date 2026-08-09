# Phase 2B-2 — Seeker Pages — Design Specification

**Phase:** 2B-2 (seeker surface)
**Date:** 2026-08-10
**Status:** Implemented

---

## Summary

Collapse two job boards into one, and move the seeker pages onto the
compositional layer 2B-1 built. This is not a token-conversion phase — the
colour gate already reports "No non-token colours." on these files. The work is
structural.

---

## Current-state audit

### There are two job boards, and the landing page points at the wrong one

`/jobs` is the 4B rebuild: react-query, URL-as-state, faceted filters,
skeletons. `/browse` is the pre-4B original: redux `allJobs`, keyword-only, a
fixed `grid-cols-3` with no responsive fallback, no loading state, no
pagination.

The navbar lists **both** (`navLinks.ts:40-41`). Worse, the hero search
(`HeroSection.tsx:25`) and the category carousel (`CategoryCarousel.tsx:36`)
both `navigate("/browse")` — so every primary search path lands on the weaker
list, and the faceted board is reachable only by clicking "Jobs" directly.

Phase 4B built the board and never redirected the traffic.

### `FilterCard` clears filters it never sets

`clearAll` and `hasFilters` both handle `salaryMax`, `experienceMax` and
`remote` (lines 37–52), but the component renders no control for any of the
three. The backend's `jobListQuerySchema` supports all three today. So "Clear
all" can appear for a filter the rail gives the user no way to set.

### `Pager` is built and admin-only

It lives in `components/console/ListControls.tsx`. `useJobSearch` already
returns `page`/`pages`/`total`, and `toSearchParams` already round-trips `page`
— the seeker board just never renders it. This is the "no pagination UI on the
seeker job list" gap CLAUDE.md records; results 51+ are unreachable.

### `Profile` repeats the zero-content-circle bug

`Profile.tsx:56` renders `AvatarImage` with no `AvatarFallback` sibling — the
exact defect 2B-1 fixed in the navbar. `avatarUrl` is null for every account
created through the standard flow, so the avatar renders as an empty ring.
Profile also has no loading state, so fields pop in one at a time.

### `LatestJobs` is filtered by a stale search

`useGetAllJobs` passes redux `searchedQuery` as `keyword`, so after a search the
landing section still reads "Latest openings" while showing filtered results.

### Two dead controls on the job card

The Bookmark button and "Save For Later" both render as real controls and call
nothing. Saved jobs is Phase 3.

### Every page has two `<h1>`s

Found during the browser pass, not in the audit above. The navbar wordmark is an
`<h1>` (`Navbar.tsx:72`), so every route has two top-level headings: the site
name and the page's own title. `AuthLayout` already renders its wordmark as a
`<span>`; the navbar never caught up.

---

## Design

### 1 · Collapse the two boards

`/jobs` becomes the only seeker board. `/browse` becomes `BrowseRedirect`,
forwarding to `/jobs` with `search` and `hash` intact — `/jobs` reads `keyword`
from the URL as its own state, so a shared `/browse?keyword=react` link survives
without translation. The same prefix-swap shape as the pre-3A workspace
redirects.

Hero and carousel build URLs through one helper, `jobBoardPath(keyword)`, and
navigate to `/jobs`. `navLinks` drops "Browse". `Browse.tsx` is deleted.

The carousel's chips become `Link`s rather than buttons — a search is a URL now,
so middle-click and open-in-new-tab work and the destination shows on hover.

### 2 · Retire the redux search state

With hero and carousel writing the URL, `searchedQuery` has no writers left.
Delete it and `setSearchedQuery` from `jobSlice`. `useGetAllJobs` loses its
keyword param, so "Latest openings" always shows genuinely latest openings, and
requests `limit=6` (what it renders) rather than the API cap of 50.

`allJobs`/`setAllJobs` stay — the landing page is their only consumer.

### 3 · `Jobs` onto the composition layer

`PageShell density="compact" width="wide" motion="standard"`, `PageHeader` (the
page has no `<h1>` at all today), `EmptyState` for the no-match case replacing a
bare `<span>`.

`Navbar` sits **outside** `PageShell` — it is full-bleed, and the shell's inner
container would clamp it to the content column. Same composition `AdminShell`
uses.

Drop the `md:h-[88vh] md:overflow-y-auto` nested scroll container: it put a
second scrollbar inside the page, so the wheel stopped working once the pointer
left the column.

### 4 · Move `Pager` to `components/layout/` and wire it

Both the console and the seeker board import from there. A move, not a copy — a
second implementation is how the seeker pager keeps a bug the console's already
fixed. `page` is a URL param like every other filter, so paging is an ordinary
navigation and the back button works.

### 5 · Expose the three orphan facets

Salary ceiling, experience ceiling and a remote toggle, so `clearAll` clears
things a user can actually set.

Ceilings are radios with an explicit "Any" option rather than click-to-unset:
click-to-unset cannot be reached from a keyboard, and implementing it means
depending on whether React fires `onClick` before `onChange` for radios.

Clearing filters deliberately **keeps** `keyword` — it came from the hero or a
shared link, and discarding it is not what "clear filters" means.

### 6 · `Profile` onto `PageShell`, with a fallback and a skeleton

`initialsOf` lifts from the navbar to `src/lib/initials.ts` so the two surfaces
cannot drift. Loading is tracked separately from `profile === null`, which
cannot distinguish "still fetching" from "the fetch failed".

### 7 · Remove the two dead save affordances

They return with the feature. The card becomes one link rather than a card
containing a "Details" button — one tab stop per result.

### 8 · One `<h1>` per route

The navbar wordmark becomes a `<span>`, matching `AuthLayout`.

---

## Out of scope

- Fit scoring and the atmosphere layer — 4A's own remaining work
- `components/admin/*` — that is 2B-3, and it owns the two surviving
  `exhaustive-deps` warnings
- Saved jobs — Phase 3
- Putting `/profile` behind `ProtectedRoute`; recorded as a known gap

---

## Testing

`frontend/tests/seekerBoard.test.tsx`, 23 tests:

- `/browse` redirects to `/jobs` and carries the query
- "Browse" is gone from seeker navigation
- `jobBoardPath` encodes multi-word roles and omits an empty keyword
- `searchedQuery` is absent from the slice **and** has no reducer, so nothing
  can write it back
- `FilterCard` renders salary/experience/remote, reflects the URL, offers "Any",
  keeps the keyword on clear, drops the page on filter change
- The job card has no control that does nothing, is a single link, falls back to
  company initials
- The board names itself, and names the search when one is active
- Exactly one `<h1>` at `/jobs`, `/` and `/jobs?keyword=react`

Each assertion was verified to **fail** against the pre-2B-2 behaviour before
being kept — the redirect tests against the old route table, the absence tests
against a restored `searchedQuery`, the heading tests against the `<h1>`
wordmark.

---

## Incidental fix: `maxWorkers: 4`

The full web suite failed 3–5 tests per run, in files this phase never touched,
with the failing set changing between runs. Each passed in isolation.

Root cause is not test logic: Vitest forks one worker per core, this machine has
12 cores and 6.3 GB of RAM, and a jsdom environment carrying React,
framer-motion and embla costs a few hundred MB. Twelve at once made the machine
swap, and tests needing ~1s of wall-clock blew the 5s default timeout. The tell
was `environment 227s` across 17 files — ~13s of setup per file.

`maxWorkers: 4` in `vitest.config.ts` cut environment time to 98s with the same
total wall-clock, and two consecutive full runs passed 145/145. Raising the
timeout would have hidden the thrash rather than removing it.
