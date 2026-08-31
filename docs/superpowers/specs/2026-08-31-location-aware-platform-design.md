# Location Awareness — reverse geocoding, phone country codes, near-you ranking

**Status:** Specified 2026-08-31. Decisions locked with the user 2026-08-31.
P1 (the console smoothness fix and the premium clock/calendar) is bounded work
designed in conversation the same day and ships separately; this document is
the P2–P4 subsystem.

## Problem

Three surfaces assume the platform knows where a user is, and none of them can
ask:

- The admin console's only time display is a server-stamped "as of" that jumps
  on each refetch. (Fixed by P1, which this spec does not cover.)
- A phone number is validated by a raw E.164 regex: it cannot reject a
  landline, an impossible-for-country length, or help the user pick a country
  code. Nothing distinguishes a number the user controls from one they typed.
- Every seeker sees the same board in the same order regardless of where they
  live, although the board's entire location vocabulary is eight Indian cities
  and a seeker's city is the single strongest free relevance signal available.

## Decisions (locked with the user, 2026-08-31)

1. **The keyless open stack.** Browser Geolocation API (consent) for
   coordinates, OpenStreetMap **Nominatim** for the one-time reverse geocode
   behind our own rate-limited proxy, the browser's `Intl` API for timezone,
   Vercel's `x-vercel-ip-country` request header for the country default, and
   a bundled coordinate table for the board's own eight-city vocabulary. No API
   keys, no billing account, no per-call cost, lifetime. Google Maps was
   considered and rejected: its free tier requires a billing account with
   overage risk, which fails the user's "full free, lifetime" constraint.
2. **Phone is free-max validation, with OTP machinery built dormant.** The user
   accepted that proving control of a number costs money per message on every
   carrier-grade channel, so no SMS provider is configured. Validation becomes
   libphonenumber-driven (valid-for-country, mobile line type), and the OTP
   purpose/budget/template ship behind a config gate so a future key activates
   verification with zero rework.
3. **"Near you" ranking composes three free signals** — distance band from the
   seeker's stored city, the existing `scoreJobForSeeker` fit engine, and a
   recency decay — computed server-side. No new external data.
4. **IST is the clock's default timezone** (P1), overridable per admin; the
   browser's timezone is the default suggestion.

## Design

### P2 — the location foundation

**`useDeviceLocation()` (frontend).** Requests browser geolocation on an
explicit user action (never on load), converts coordinates through
`GET /location/reverse`, and returns `{ city, country, timezone }` in the
board's vocabulary. Degrades without error when consent is refused or the API
is unavailable: callers receive `null` and fall back to the browser timezone
for display and the request's country header for phone preselection. The hook
holds nothing: coordinates are used for the one request and dropped.

**`GET /location/reverse?lat=&lng=` (backend, unauthenticated).**

- Input: numeric lat/lng, range-checked (±90/±180); anything else is a 400.
- Rate limited per IP like the auth routes. The proxy must never become an
  open geocoder for someone else's traffic.
- **Cache**: rounded-coordinate box (2 decimals ≈ 1.1 km) as the key, in an
  in-memory bounded TTL map (the deploy is single-instance by design —
  `numInstances: 1` is a security parameter), with a long TTL. One consented
  lookup per user in practice; repeat lookups for the same neighbourhood
  answer from the cache.
- Calls Nominatim with a descriptive `User-Agent` per its usage policy, at
  most once per second, and maps the response to `{ city, state, country }`,
  then **normalizes the city against `JOB_LOCATIONS`**: a suburb or ward
  ("Whitefield", "Powai") resolves to its board city ("Bengaluru", "Mumbai");
  a city outside the vocabulary passes through verbatim with a `matched:
  false` flag so callers can treat it honestly.
- OpenStreetMap attribution ships in the About page and the API response
  (`source: "openstreetmap"`), per Nominatim's usage policy.

**Seeker profile storage.** The existing unused `seeker.location: String`
becomes a subdocument: `{ city: string, country: string, updatedAt: Date }`,
default `null`. **Coordinates are never stored** — the transient lat/lng dies
with the request. The DTO projects city and country only. Updating it is an
authenticated seeker action on the profile route; nothing else writes it.

**Country for phone preselection.** A transient signal, never stored:
`x-vercel-ip-country` where present, else the timezone→country map, else
India. The client uses it once to preselect a dial code.

### P3 — phone numbers with country codes

**Shared validation.** `phoneSchema` in `packages/shared/src/auth.ts` moves
from the E.164 regex to **libphonenumber-js**: parse, require `isValid()` for
its region, require `getType() === "mobile"`, and canonicalize to E.164. The
error message names the country it validated against. Stored numbers from
before this change (all few of them) are unaffected until their owners edit
them — validation runs on writes only, never on reads.

**`PhoneInput` (frontend).** A country picker (dial code + country name,
searchable) preselected from the detected country, a national-format input
with live validity feedback per country, and E.164 output on submit. It
replaces the plain phone input in the completion step and the profile editor
on **all three portals**. The component owns formatting; the schema owns the
rule, so client and server cannot disagree.

**Dormant OTP machinery.** The OTP system gains `verify_phone` alongside
`verify_email`/`reset_password`/`change_email`: purpose enum, budget, TTL, and
a template, mirroring the email design. The send/verify routes are **mounted
only when an SMS provider key is configured** — the same config-gated pattern
`TURNSTILE_SECRET_KEY` already uses, so an absent key is a route that does not
exist, not a 500 waiting to happen. `docs/deployment-runbook.md` documents the
activation path (choose provider, DLT registration for India, set the key).

### P4 — "jobs near you"

**Region map (shared).** The eight board cities group into regions:
Bengaluru/Chennai/Hyderabad (south), Mumbai/Pune (west), Delhi NCR (north),
Kolkata (east). One constant, tested.

**The score.** For a signed-in seeker with a stored location, each open job
gets:

```
distance: same city = 3 · same region = 2 · elsewhere/remote = 1 (remote always ≥ 2)
score    = 0.5 · distance + 0.35 · fit + 0.15 · recency
```

`fit` is the existing `scoreJobForSeeker` (already normalized to 0–1);
`recency` is a linear decay over 8 weeks, floored at 0. Remote jobs take
`distance = 2` regardless of city so they outrank far-city roles but not
same-city ones. Weights live as named constants in shared with the tests
pinning the orderings they produce.

**Surface.** `GET /job/near-me` — authenticated seeker, paginated, returns the
open jobs ranked by the composed score with each job's band
(`same_city`/`same_region`/`elsewhere`/`remote`) so the UI can label honestly.
The seeker's board gains a **"Near you"** rail above the facet board and a
**"Companies near you"** strip (same ranking, deduplicated by company). A
seeker with no stored location sees the rail replaced by a one-time,
dismissible **"Use my location"** consent prompt that runs the P2 flow; no
location, no prompt nagging.

## Security and privacy

- Geolocation runs only on explicit user action and consent; the prompt and
  its copy live in the UI, the permission lives with the browser.
- **City-level PII only.** Coordinates are transient and discarded; the stored
  subdocument is city + country + timestamp; the DTO projects city and
  country; logs never carry coordinates.
- Location is never an input to authentication, authorization, or any security
  decision. The IP-country header is a UI default, not a fact about the user.
- The Nominatim proxy is rate-limited per IP, cached, and range-checks its
  inputs; it answers only normalized city data, never raw geocoder payloads.
- No location data crosses to any third party beyond the single consented
  reverse-geocode call made by our server.

## Non-goals

- SMS delivery of any kind — the OTP machinery ships dormant; activation
  (provider choice, DLT registration, key) is its own future project.
- Google Maps or any keyed/paid geocoding, now or as a fallback.
- A visible map surface. OpenStreetMap tiles + Leaflet remain the free option
  if a map is ever wanted; nothing here blocks it.
- Storing coordinates, geofencing, or location history.
- Location for recruiters or admins — the foundation is generic, but the only
  profile surface that stores a location in this phase is the seeker's.
- Changing the board's eight-city vocabulary or its exact-equality facet.

## Testing

- Shared: libphonenumber `phoneSchema` (valid/invalid per country, landline
  rejection, E.164 canonicalization); region map; the composed score's
  orderings (same-city beats region beats elsewhere; remote band; fit breaking
  distance ties; recency decay).
- Backend: `/location/reverse` (input validation, rate limit, cache hit,
  vocabulary normalization, `matched:false` passthrough, Nominatim failure →
  502 with no crash); `near-me` (ranking, pagination, no-location 4xx);
  dormant OTP routes absent without a key.
- Frontend: `useDeviceLocation` fallback ladder (jsdom geolocation mock);
  `PhoneInput` preselection, formatting, and error copy; the consent prompt's
  dismissibility; the Near-you rail's states (populated, empty, prompt).
- P1 (out of spec scope) carries its own jsdom tests for the clock's IST
  fallback, ticking, and reduced-motion behaviour.

## Success criteria

- An admin sees a live ticking clock and calendar in the console with zero
  visible refetch artefacts (P1).
- A seeker who consents once gets a board that leads with same-city roles, and
  their profile stores a city — never coordinates.
- A user changing a phone number on any portal picks a country code
  preselected for them and cannot save a landline or an invalid-for-country
  number.
- No new API key, billing account, or external dependency exists anywhere in
  the system.
