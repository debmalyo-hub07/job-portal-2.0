# ADR-0008: Portal-scoped browser sessions

**Status:** Accepted (2026-08-16).

## Context

The application has separate seeker, recruiter, and admin account collections.
Their access and refresh cookies were already named per portal, but the browser
held one Redux user, one bootstrap flag, one CSRF token, and one refresh promise.
Signing into another portal could replace client state and CSRF state for the
first portal. The old client guard also sent a wrong-role user to their own
home, which made the requested portal's access rule unclear.

Public job discovery must remain available. Applying is an authenticated seeker
action. Recruiter and admin workspaces must never render from a typed URL without
the matching session, even though the server remains the authorization boundary.

## Decision

- Keep three independent browser session families. Access, refresh, and CSRF
  cookies use `jp_<portal>_*` names, with `__Host-` prefixes in production.
- Store users, bootstrap state, in-memory CSRF tokens, and refresh promises per
  portal. Persist cached users only; do not persist bootstrap state.
- Bootstrap only the portal required by the current route through
  `/<portal>/auth/me`. A matching portal session opens its workspace. Anonymous
  and wrong-role visitors go to that portal's login.
- Treat `/hire` and `/admin` as protected session doors. Their login and signup
  routes remain public; admin has no signup route. A seeker may therefore create
  a separate recruiter account without ending the seeker session.
- Keep job browsing public. An anonymous Apply action navigates to seeker login
  with a validated job-detail return path. The API independently requires a
  seeker session before it creates an application.
- Logout clears only the selected portal's cookies, cached user, CSRF token, and
  refresh state.

## Consequences

Users can work in more than one role in the same browser without cross-portal
CSRF failures or accidental logout. A wrong-role URL no longer briefly renders
the requested workspace or redirects somewhere unrelated to the request.

There is more explicit state and more `/me` calls than a single global session,
but each call establishes the correct server authority after a reload. Browser
state and URL routing are defense in depth only. Every API route continues to
authenticate its literal portal and enforce ownership or approval server-side.

The admin path is not a secret. Hiding or encrypting it would add obscurity, not
authorization; the server-side admin cookie and route middleware remain the
security controls.

## Alternatives considered

**One active browser session.** Rejected because a person may legitimately be a
seeker and recruiter, and login/logout in one role would disrupt the other.

**One global CSRF cookie.** Rejected because signing into a second portal
overwrites the token needed by the first portal's mutations.

**Redirect wrong-role users to their own home.** Rejected because it hides the
requested portal's rule and loses the intended destination.

**Hide the admin URL.** Rejected because a path is visible to every browser and
is not an authorization mechanism.
