# Location Foundation (P2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the platform's location foundation — a consent-based, keyless
reverse-geocoding service and a stored seeker city — that P3 (phone country
codes) and P4 ("near you") build on.

**Architecture:** Browser geolocation (consent) sends coordinates once to a new
`GET /location/reverse` endpoint, which proxies OpenStreetMap Nominatim behind
a per-IP rate limit and a rounded-coordinate cache, and normalizes the city
against the board's own vocabulary. The seeker profile stores the normalized
city + country (never coordinates). A `GET /location/country` endpoint exposes
the request's country (`x-vercel-ip-country`, forwarded verbatim by the
same-origin proxy) for P3's dial-code preselection.

**Tech Stack:** Express 5 route + service (existing patterns), global `fetch`,
zod schemas in `packages/shared`, React hook with the browser Geolocation API.

**Spec:** `docs/superpowers/specs/2026-08-31-location-aware-platform-design.md`
(P2 section). The spec's security posture is binding: coordinates are transient,
city-level PII only, location is never a security input.

## Global Constraints

- No API keys, no new external dependencies beyond `libphonenumber-js` (which
  is P3, not this plan). Nominatim is called with a descriptive `User-Agent`.
- All schemas that cross the API boundary live in `packages/shared`
  (AGENTS.md rule). Build shared before isolated backend typechecks:
  `npm run build --workspace @jobportal/shared`.
- Backend relative imports include `.js`; frontend imports do not.
- Every task: focused test first (it must fail), then implementation, then the
  test passes, then commit. Commit messages carry no Co-Authored-By trailer.
- Colour gate is a hard zero: frontend changes use design tokens only.
- Test commands: backend `npx vitest run tests/<file> --workspace` from
  `backend/` (i.e. `cd backend; npx vitest run tests/location.test.ts`);
  shared from `packages/shared`; frontend from `frontend/`.

---

### Task 1: Shared — city normalization and the location schemas

**Files:**
- Create: `packages/shared/src/location.ts`
- Modify: `packages/shared/src/index.ts` (add `export * from "./location.js";`
  beside the existing module exports)
- Modify: `packages/shared/src/domain.ts:344` (`profileUpdateBodySchema` gains
  an optional `location` field)
- Test: `packages/shared/tests/location.test.ts`

**Interfaces:**
- Consumes: `JOB_LOCATIONS` from `./catalogue.js`.
- Produces (later tasks import these from `@jobportal/shared`):
  `CITY_ALIASES: Record<string, string>`,
  `normalizeCity(raw: string | null | undefined): { city: string; matched: boolean } | null`,
  `countrySchema` (zod, ISO-3166 alpha-2),
  `seekerLocationSchema` (zod `{ city, country }`),
  `type SeekerLocation = { city: string; country: string }`,
  `type ReverseLocationDto = { city: string | null; region: string | null; country: string | null; matched: boolean; source: "openstreetmap" }`.

- [ ] **Step 1: Write the failing test** — `packages/shared/tests/location.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { JOB_LOCATIONS } from "../src/index.js";
import {
  CITY_ALIASES,
  normalizeCity,
  seekerLocationSchema,
} from "../src/index.js";

describe("normalizeCity", () => {
  it("matches a board city directly", () => {
    expect(normalizeCity("Bengaluru")).toEqual({ city: "Bengaluru", matched: true });
  });

  it("maps aliases onto the board's vocabulary", () => {
    // The catalogue's own comment: Noida and Gurugram are both "Delhi NCR".
    expect(normalizeCity("Noida")).toEqual({ city: "Delhi NCR", matched: true });
    expect(normalizeCity("Gurugram")).toEqual({ city: "Delhi NCR", matched: true });
    expect(normalizeCity("Bangalore")).toEqual({ city: "Bengaluru", matched: true });
  });

  it("passes an unknown city through verbatim, unmatched", () => {
    expect(normalizeCity("Jaipur")).toEqual({ city: "Jaipur", matched: false });
  });

  it("returns null for nothing usable", () => {
    expect(normalizeCity(null)).toBeNull();
    expect(normalizeCity("   ")).toBeNull();
  });

  it("never maps an alias to a city outside the board vocabulary", () => {
    for (const target of Object.values(CITY_ALIASES)) {
      expect(JOB_LOCATIONS).toContain(target);
    }
  });
});

describe("seekerLocationSchema", () => {
  it("accepts a city and an ISO country code", () => {
    expect(seekerLocationSchema.parse({ city: "Bengaluru", country: "IN" })).toEqual({
      city: "Bengaluru",
      country: "IN",
    });
  });

  it("rejects a non-alpha-2 country and an empty city", () => {
    expect(seekerLocationSchema.safeParse({ city: "Bengaluru", country: "IND" }).success).toBe(false);
    expect(seekerLocationSchema.safeParse({ city: "", country: "IN" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/shared && npx vitest run tests/location.test.ts`
Expected: FAIL — module `../src/index.js` has no `location` export.

- [ ] **Step 3: Implement** — create `packages/shared/src/location.ts`:

```ts
import { z } from "zod";

import { JOB_LOCATIONS } from "./catalogue.js";

/**
 * Location vocabulary shared by every surface that names a place — P2 of the
 * location-aware phase. The board's `JOB_LOCATIONS` is the whole reachable
 * vocabulary (exact-equality facets), so a geocoder's answer is only useful
 * once it speaks that vocabulary.
 */

/**
 * Cities the board spells differently than geocoders do. Keys are the raw
 * names Nominatim returns; values are always board cities — asserted by test.
 * "Remote" is a way of working, not a place, so nothing maps to it.
 */
export const CITY_ALIASES: Record<string, string> = {
  Delhi: "Delhi NCR",
  "New Delhi": "Delhi NCR",
  Noida: "Delhi NCR",
  Gurugram: "Delhi NCR",
  Ghaziabad: "Delhi NCR",
  Faridabad: "Delhi NCR",
  "Navi Mumbai": "Mumbai",
  Thane: "Mumbai",
  Bangalore: "Bengaluru",
  Secunderabad: "Hyderabad",
  Madras: "Chennai",
  Calcutta: "Kolkata",
  "Pimpri-Chinchwad": "Pune",
};

export type NormalizedCity = { city: string; matched: boolean };

/**
 * Resolve a raw place name against the board's vocabulary. A direct hit or an
 * alias is `matched: true`; anything else passes through verbatim with
 * `matched: false` so callers can label honestly rather than guess.
 */
export function normalizeCity(raw: string | null | undefined): NormalizedCity | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  if ((JOB_LOCATIONS as readonly string[]).includes(trimmed)) {
    return { city: trimmed, matched: true };
  }
  const alias = CITY_ALIASES[trimmed];
  if (alias) return { city: alias, matched: true };
  return { city: trimmed, matched: false };
}

/** ISO 3166-1 alpha-2, the only country representation stored or sent. */
export const countrySchema = z
  .string()
  .regex(/^[A-Z]{2}$/, "must be an ISO 3166-1 alpha-2 country code, e.g. IN");

/** What a seeker's profile stores — a city and a country, never coordinates. */
export const seekerLocationSchema = z.object({
  city: z.string().trim().min(1).max(80),
  country: countrySchema,
});

export type SeekerLocation = z.infer<typeof seekerLocationSchema>;

/** `GET /location/reverse`'s answer. `city` is null when nothing usable came back. */
export type ReverseLocationDto = {
  city: string | null;
  region: string | null;
  country: string | null;
  matched: boolean;
  source: "openstreetmap";
};
```

Then add to `packages/shared/src/index.ts` beside the other module exports:

```ts
export * from "./location.js";
```

And in `packages/shared/src/domain.ts`, inside `profileUpdateBodySchema`
(the `z.object` at line 344), add one field alongside the existing optionals:

```ts
  /** P2: the seeker's consented location. City-level only; never coordinates. */
  location: seekerLocationSchema.optional(),
```

with `seekerLocationSchema` imported from `./location.js` at the top of
`domain.ts` (follow the file's existing import style).

- [ ] **Step 4: Run the tests** — `cd packages/shared && npx vitest run`
Expected: all pass (including the pre-existing suite).

- [ ] **Step 5: Build shared and commit**

```bash
npm run build --workspace @jobportal/shared
git add packages/shared/src/location.ts packages/shared/src/index.ts packages/shared/src/domain.ts packages/shared/tests/location.test.ts
git commit -m "feat(shared): city normalization and the seeker location schemas"
```

---

### Task 2: Backend — the location service (cache, Nominatim, country)

**Files:**
- Create: `backend/src/services/location.service.ts`
- Test: `backend/tests/location.service.test.ts`

**Interfaces:**
- Consumes: `normalizeCity`, `ReverseLocationDto` from `@jobportal/shared`;
  `AppError` from `../lib/AppError.js`.
- Produces (Task 3's route imports these):
  `reverseGeocode(lat: number, lng: number, fetchImpl?: typeof fetch): Promise<ReverseLocationDto>`,
  `countryFromRequest(headers: Headers, timeZone?: string | null): string`,
  plus test seams `clearLocationCache()` and `locationCacheSize()`.

- [ ] **Step 1: Write the failing test** — `backend/tests/location.service.test.ts`:

```ts
import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  clearLocationCache,
  countryFromRequest,
  locationCacheSize,
  reverseGeocode,
} from "../src/services/location.service.js";
import { AppError } from "../src/lib/AppError.js";

/** A Nominatim-shaped payload the fake fetch serves. */
const nominatim = (address: Record<string, string>) =>
  new Response(JSON.stringify({ address }), { status: 200 });

describe("reverseGeocode", () => {
  beforeEach(() => clearLocationCache());

  it("normalizes the geocoder's city against the board vocabulary", async () => {
    const fetchImpl = vi.fn(async () =>
      nominatim({ city: "Whitefield", state: "Karnataka", country_code: "in" }),
    );
    const dto = await reverseGeocode(12.9698, 77.75, fetchImpl);
    // Nominatim reports the suburb as its own city field for Whitefield; the
    // alias table is what makes the board's "Bengaluru" out of it.
    expect(dto).toMatchObject({ city: "Bengaluru", matched: true, country: "IN" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("passes an unknown city through unmatched", async () => {
    const fetchImpl = vi.fn(async () => nominatim({ city: "Jaipur", country_code: "in" }));
    const dto = await reverseGeocode(26.9, 75.8, fetchImpl);
    expect(dto).toMatchObject({ city: "Jaipur", matched: false });
  });

  it("survives a geocoder answer with no city: nulls, not a crash", async () => {
    const fetchImpl = vi.fn(async () => nominatim({ country_code: "in" }));
    const dto = await reverseGeocode(1, 1, fetchImpl);
    expect(dto.city).toBeNull();
    expect(dto.matched).toBe(false);
  });

  it("answers the second lookup in the same ~1km box from cache", async () => {
    const fetchImpl = vi.fn(async () => nominatim({ city: "Pune", country_code: "in" }));
    await reverseGeocode(18.5204, 73.8567, fetchImpl);
    const dto = await reverseGeocode(18.5210, 73.8572, fetchImpl);
    expect(dto.city).toBe("Pune");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(locationCacheSize()).toBe(1);
  });

  it("throws a 502 AppError when the geocoder is down", async () => {
    const fetchImpl = vi.fn(async () => new Response("boom", { status: 503 }));
    await expect(reverseGeocode(1, 1, fetchImpl)).rejects.toMatchObject({
      statusCode: 502,
      code: "GEOCODER_UNAVAILABLE",
    });
  });

  it("sends a descriptive User-Agent, as Nominatim's usage policy requires", async () => {
    const fetchImpl = vi.fn(async () => nominatim({ city: "Pune", country_code: "in" }));
    await reverseGeocode(18.5, 73.8, fetchImpl);
    const [, init] = fetchImpl.mock.calls[0]!;
    expect(String(init?.headers?.["User-Agent"])).toMatch(/cairn/i);
  });
});

describe("countryFromRequest", () => {
  it("prefers the proxy-forwarded edge country header", () => {
    const headers = new Headers({ "x-vercel-ip-country": "AE" });
    expect(countryFromRequest(headers, "Asia/Kolkata")).toBe("AE");
  });

  it("falls back to the caller's timezone, then India", () => {
    expect(countryFromRequest(new Headers(), "Europe/Berlin")).toBe("DE");
    expect(countryFromRequest(new Headers(), "nowhere/nowhere")).toBe("IN");
    expect(countryFromRequest(new Headers(), null)).toBe("IN");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx vitest run tests/location.service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — create `backend/src/services/location.service.ts`:

```ts
import { normalizeCity, type ReverseLocationDto } from "@jobportal/shared";

import { AppError } from "../lib/AppError.js";

/**
 * The platform's one geocoding path — P2 of the location-aware phase.
 *
 * Coordinates arrive from a consented browser lookup, are answered through
 * OpenStreetMap Nominatim (keyless, free), and are normalized against the
 * board's own vocabulary before anything else sees them. The cache makes the
 * second consented lookup in the same neighbourhood free, and the single
 * instance (numInstances: 1, a security parameter) is why an in-memory map is
 * the whole cache design.
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";
// Nominatim's usage policy asks for a UA that identifies the application.
const USER_AGENT = "cairn-job-portal/1.0 (https://job-portal-debmalyo.vercel.app)";
const CACHE_TTL_MS = 30 * 24 * 3_600_000; // a month — cities do not move.
const CACHE_MAX = 512;

type CacheEntry = { value: ReverseLocationDto; at: number };
const cache = new Map<string, CacheEntry>();

/** Test seams: the cache is module state, and tests must start clean. */
export function clearLocationCache(): void {
  cache.clear();
}
export function locationCacheSize(): number {
  return cache.size;
}

/** ~1.1km boxes: close enough to be the same neighbourhood, coarse enough to share. */
function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

type NominatimAddress = {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  state?: string;
  country_code?: string;
};

/**
 * Reverse-geocode once and normalize. `fetchImpl` is injectable so tests never
 * touch the network; production uses the global fetch.
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
  fetchImpl: typeof fetch = fetch,
): Promise<ReverseLocationDto> {
  const key = cacheKey(lat, lng);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const url = `${NOMINATIM_URL}?format=jsonv2&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`;
  const response = await fetchImpl(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!response.ok) {
    throw new AppError(502, "GEOCODER_UNAVAILABLE", "Could not resolve that location right now.");
  }
  const body = (await response.json()) as { address?: NominatimAddress };
  const address = body.address ?? {};
  const rawCity = address.city ?? address.town ?? address.village ?? address.municipality ?? null;
  const normalized = normalizeCity(rawCity);

  const dto: ReverseLocationDto = {
    city: normalized?.city ?? null,
    region: address.state ?? null,
    country: address.country_code?.toUpperCase() ?? null,
    matched: normalized?.matched ?? false,
    source: "openstreetmap",
  };

  if (cache.size >= CACHE_MAX) {
    // Insertion-order eviction: Map keeps the oldest key first.
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { value: dto, at: Date.now() });
  return dto;
}

/** The timezone→country fallback for the edge-header-less case. */
const TIMEZONE_COUNTRY: Record<string, string> = {
  "Asia/Kolkata": "IN",
  "Asia/Dubai": "AE",
  "Asia/Singapore": "SG",
  "Europe/London": "GB",
  "Europe/Berlin": "DE",
  "America/New_York": "US",
  "America/Los_Angeles": "US",
  "Australia/Sydney": "AU",
};

/**
 * The caller's country for a UI default (P3's dial-code preselection) — never
 * a security input. The edge header arrives through the same-origin proxy,
 * which forwards request headers verbatim; the timezone is the client's own
 * report, sent as a query param; India is the platform's default.
 */
export function countryFromRequest(headers: Headers, timeZone: string | null | undefined): string {
  const header = headers.get("x-vercel-ip-country");
  if (header && /^[A-Za-z]{2}$/.test(header)) return header.toUpperCase();
  if (timeZone && TIMEZONE_COUNTRY[timeZone]) return TIMEZONE_COUNTRY[timeZone];
  return "IN";
}
```

- [ ] **Step 4: Run the tests** — `cd backend && npx vitest run tests/location.service.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/location.service.ts backend/tests/location.service.test.ts
git commit -m "feat(api): keyless reverse geocoding with cache and vocabulary normalization"
```

---

### Task 3: Backend — the location routes

**Files:**
- Create: `backend/src/routes/location.route.ts`
- Modify: `backend/src/app.ts` (import + mount, beside the other routes)
- Test: `backend/tests/location.route.test.ts`

**Interfaces:**
- Consumes: `reverseGeocode`, `countryFromRequest` from Task 2; `rateLimit`
  from `../middleware/rateLimit.js` (factory `rateLimit({ windowMs, max })`,
  as `app.ts:36` uses it).
- Produces: `GET /api/v1/location/reverse?lat&lng` → `ReverseLocationDto`
  (unauthenticated, rate-limited 10/min per IP); `GET /api/v1/location/country?tz=`
  → `{ success: true, country: string }` (unauthenticated).

- [ ] **Step 1: Write the failing test** — `backend/tests/location.route.test.ts`:

```ts
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import { clearLocationCache } from "../src/services/location.service.js";
import * as locationService from "../src/services/location.service.js";

describe("GET /api/v1/location/reverse", () => {
  beforeEach(() => {
    clearLocationCache();
    vi.restoreAllMocks();
  });

  it("rejects out-of-range coordinates with a 400", async () => {
    for (const [lat, lng] of [[91, 0], [0, 181], ["abc", "0"]] as const) {
      const res = await request(buildApp()).get(`/api/v1/location/reverse?lat=${lat}&lng=${lng}`);
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    }
  });

  it("returns the normalized city for a consented lookup", async () => {
    vi.spyOn(locationService, "reverseGeocode").mockResolvedValue({
      city: "Bengaluru", region: "Karnataka", country: "IN",
      matched: true, source: "openstreetmap",
    });
    const res = await request(buildApp()).get("/api/v1/location/reverse?lat=12.97&lng=77.59");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, city: "Bengaluru", matched: true });
  });

  it("surfaces a geocoder outage as a 502 envelope, not a crash", async () => {
    vi.spyOn(locationService, "reverseGeocode").mockRejectedValue(
      Object.assign(new Error("down"), { statusCode: 502, code: "GEOCODER_UNAVAILABLE" }),
    );
    const res = await request(buildApp()).get("/api/v1/location/reverse?lat=1&lng=1");
    expect(res.status).toBe(502);
    expect(res.body.code).toBe("GEOCODER_UNAVAILABLE");
  });
});

describe("GET /api/v1/location/country", () => {
  it("answers the edge header's country when the proxy forwarded it", async () => {
    const res = await request(buildApp())
      .get("/api/v1/location/country")
      .set("x-vercel-ip-country", "AE");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, country: "AE" });
  });

  it("falls back to the caller's timezone, then India", async () => {
    const berlin = await request(buildApp()).get("/api/v1/location/country?tz=Europe/Berlin");
    expect(berlin.body.country).toBe("DE");
    const none = await request(buildApp()).get("/api/v1/location/country");
    expect(none.body.country).toBe("IN");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx vitest run tests/location.route.test.ts`
Expected: FAIL — 404 NOT_FOUND envelopes (routes don't exist).

- [ ] **Step 3: Implement** — create `backend/src/routes/location.route.ts`:

```ts
import express from "express";

import { countryFromRequest, reverseGeocode } from "../services/location.service.js";
import { rateLimit } from "../middleware/rateLimit.js";

/**
 * The location reads — P2 of the location-aware phase.
 *
 * Both are unauthenticated on purpose: they answer questions a signed-out
 * visitor's browser asks ("which city am I in?") with data that is not
 * personal. The reverse lookup is rate-limited tightly because it is the one
 * that spends an external service's goodwill; the country read is a header
 * glance that could never be worth throttling.
 */
const router = express.Router();

const reverseLimit = rateLimit({ windowMs: 60_000, max: 10 });

router.get("/reverse", reverseLimit, async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  // Number("") is 0 and Number("12abc") is NaN — both are wrong here, so the
  // range check does the rejecting rather than a separate type check.
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    res.status(400).json({ success: false, code: "VALIDATION_ERROR", message: "lat and lng must be numbers within range." });
    return;
  }
  const location = await reverseGeocode(lat, lng);
  res.status(200).json({ success: true, ...location });
});

router.get("/country", (req, res) => {
  const tz = typeof req.query.tz === "string" ? req.query.tz : null;
  res.status(200).json({ success: true, country: countryFromRequest(req.headers, tz) });
});

export default router;
```

In `backend/src/app.ts`, beside the other imports and mounts:

```ts
import locationRoute from "./routes/location.route.js";
// ...
app.use("/api/v1/location", locationRoute);
```

(Place the mount after the `applicationRoute` line, following the file's order.)

- [ ] **Step 4: Run the tests** — `cd backend && npx vitest run tests/location.route.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/location.route.ts backend/src/app.ts backend/tests/location.route.test.ts
git commit -m "feat(api): /location/reverse and /location/country reads"
```

---

### Task 4: Seeker location storage — model, update flow, DTO

**Files:**
- Modify: `backend/src/models/seeker.model.ts:13` (`location` becomes a
  subdocument)
- Modify: `backend/src/controllers/user.controller.ts:118` (the seeker branch
  of `updateProfile` writes `location`)
- Modify: the `toProfileView` projection (grep its definition —
  `backend/src/services/auth.service.ts` exports it; the profile view gains
  `location: { city, country } | null`)
- Test: `backend/tests/profileLocation.test.ts`

**Interfaces:**
- Consumes: `seekerLocationSchema`'s parsed field on `profileUpdateBodySchema`
  (Task 1) — body key `location?: { city: string; country: string }`.
- Produces: `SeekerDocument["location"]` is
  `{ city: string; country: string; updatedAt: Date } | null`; the profile
  view's `location` projects `{ city, country }` only (no `updatedAt`, no
  coordinates — there are none to hide, but the projection says so).

- [ ] **Step 1: Write the failing test** — `backend/tests/profileLocation.test.ts`:

```ts
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { Recruiter } from "../src/models/recruiter.model.js";
import { Seeker } from "../src/models/seeker.model.js";

/** A verified seeker with a complete-enough profile to pass the gates. */
async function verifiedSeeker() {
  return Seeker.create({
    email: `seeker-${Date.now()}@x.test`,
    fullName: "Seeker Person",
    passwordHash: "x",
    emailVerifiedAt: new Date(),
    status: "active",
    dob: new Date("2000-01-01T00:00:00Z"),
  });
}

describe("seeker profile location", () => {
  let app: ReturnType<typeof buildApp>;
  let cookie: string[];

  beforeEach(async () => {
    app = buildApp();
    await Seeker.deleteMany({});
    await Recruiter.deleteMany({});
    const seeker = await verifiedSeeker();
    const login = await request(app)
      .post("/api/v1/seeker/auth/login")
      .send({ email: seeker.email, password: "correct horse battery staple" })
      .set("x-test-password", "x"); // placeholder — see note below
    cookie = login.headers["set-cookie"] ?? [];
  });

  it("stores a consented city and country, and projects them back", async () => {
    const res = await request(app)
      .post("/api/v1/user/profile/update")
      .set("Cookie", cookie)
      .send({ location: { city: "Bengaluru", country: "IN" } });
    expect(res.status).toBe(200);
    expect(res.body.profile.location).toEqual({ city: "Bengaluru", country: "IN" });

    const stored = await Seeker.findOne({ email: res.body.profile.email ?? /@x\.test/ });
    expect(stored?.location).toMatchObject({ city: "Bengaluru", country: "IN" });
    expect(stored?.location?.updatedAt).toBeInstanceOf(Date);
  });

  it("refuses a malformed country code", async () => {
    const res = await request(app)
      .post("/api/v1/user/profile/update")
      .set("Cookie", cookie)
      .send({ location: { city: "Bengaluru", country: "IND" } });
    expect(res.status).toBe(400);
  });
});
```

**Note for the implementer:** the login helper above is a sketch — read
`backend/tests/auth/login.test.ts` for the harness this suite already uses to
sign a seeker in (it may set the password hash properly and hit the real login
route, or seed a session another way). Use exactly that harness; only the
assertions above are the deliverable.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx vitest run tests/profileLocation.test.ts`
Expected: FAIL — `location` is not accepted/returned today.

- [ ] **Step 3: Implement**

In `backend/src/models/seeker.model.ts`, replace the plain String field:

```ts
      location: { type: String, default: null },
```

with the subdocument:

```ts
      /**
       * P2: the seeker's consented location, from a one-time browser geolocation
       * the reverse endpoint normalized. City-level only — coordinates are used
       * transiently by that endpoint and never stored. `updatedAt` records when
       * the consent last ran, so a stale city is at least a dated one.
       */
      location: {
        type: new Schema(
          {
            city: { type: String, required: true },
            country: { type: String, required: true },
            updatedAt: { type: Date, default: Date.now },
          },
          { _id: false },
        ),
        default: null,
      },
```

(add `Schema` to the file's existing `mongoose` import if needed).

In `backend/src/controllers/user.controller.ts`, in `updateProfile`'s
`portal === "seeker"` branch (line ~118), add beside the other field writes:

```ts
    // P2: city-level only, schema-validated; `updatedAt` refreshes so the
    // stored city is at least dated.
    if (body.location !== undefined) {
      seeker.location = { ...body.location, updatedAt: new Date() };
    }
```

In the `toProfileView` projection (find it with
`grep -rn "toProfileView" backend/src`), add to the seeker branch's return:

```ts
    location: seeker.location ? { city: seeker.location.city, country: seeker.location.country } : null,
```

- [ ] **Step 4: Run the tests** — `cd backend && npx vitest run tests/profileLocation.test.ts`
Expected: PASS. Also run `npx vitest run` for the suite — the profile DTO
change must not break the existing profile tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/models/seeker.model.ts backend/src/controllers/user.controller.ts backend/src/services/auth.service.ts backend/tests/profileLocation.test.ts
git commit -m "feat(api): the seeker profile stores a consented city-level location"
```

---

### Task 5: Frontend — the `useDeviceLocation` hook

**Files:**
- Create: `frontend/src/hooks/useDeviceLocation.ts`
- Test: `frontend/tests/useDeviceLocation.test.ts`

**Interfaces:**
- Consumes: `apiClient` from `@/lib/apiClient`
  (`apiClient.get<T>(url)`), `detectTimeZone` from `@/lib/timeZone`.
- Produces:
  `useDeviceLocation(): { state: "idle" | "locating" | "granted" | "denied" | "failed"; city: string | null; country: string | null; timezone: string; locate: () => void; reset: () => void }`.

- [ ] **Step 1: Write the failing test** — `frontend/tests/useDeviceLocation.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import { useDeviceLocation } from "@/hooks/useDeviceLocation";
import { apiClient } from "@/lib/apiClient";

describe("useDeviceLocation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("runs consent, reverse lookup, and reports the normalized city", async () => {
    const permission = { state: "granted" };
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (_ok: unknown, err: unknown, _opt: unknown) => err({ code: 1, message: "no" }),
      },
      permissions: { query: async () => permission },
    });
    const get = vi
      .spyOn(apiClient, "get")
      .mockResolvedValue({ data: { success: true, city: "Bengaluru", country: "IN", matched: true, region: "Karnataka", source: "openstreetmap" } });

    const { result } = renderHook(() => useDeviceLocation());
    act(() => result.current.locate());

    await waitFor(() => expect(result.current.state).toBe("granted"));
    expect(result.current.city).toBe("Bengaluru");
    expect(result.current.country).toBe("IN");
    expect(get).toHaveBeenCalledWith("/location/reverse?lat=12.97&lng=77.59");
    vi.unstubAllGlobals();
  });

  it("reports denied without any API call", async () => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (_ok: unknown, err: unknown) => err({ code: 1, message: "denied" }),
      },
    });
    const get = vi.spyOn(apiClient, "get");

    const { result } = renderHook(() => useDeviceLocation());
    act(() => result.current.locate());

    await waitFor(() => expect(result.current.state).toBe("denied"));
    expect(get).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("always carries a timezone, from the browser, regardless of consent", () => {
    vi.stubGlobal("navigator", {});
    const { result } = renderHook(() => useDeviceLocation());
    expect(result.current.timezone).toBeTruthy();
    vi.unstubAllGlobals();
  });
});
```

(The first test's `getCurrentPosition` shape is deliberate: see Step 3's
success path, which the implementer should exercise by having the stub call
`ok({ coords: { latitude: 12.97, longitude: 77.59 } })` in the granted case —
write the granted stub that way and keep the `err` shape only for the denied
test.)

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx vitest run tests/useDeviceLocation.test.ts`
Expected: FAIL — hook does not exist.

- [ ] **Step 3: Implement** — create `frontend/src/hooks/useDeviceLocation.ts`:

```ts
import { useCallback, useState } from "react";

import { apiClient } from "@/lib/apiClient";
import { detectTimeZone } from "@/lib/timeZone";
import type { ReverseLocationDto } from "@jobportal/shared";

type ReverseResponse = { success: boolean } & ReverseLocationDto;

export type DeviceLocationState = "idle" | "locating" | "granted" | "denied" | "failed";

/**
 * One consented location lookup — P2 of the location-aware phase.
 *
 * `locate()` is always a user action (a button): geolocation prompts read
 * better from a deliberate click, and a page that asked on load would spend
 * its one permission prompt on nobody's intent. Coordinates go to the reverse
 * endpoint and are never kept — the hook holds the normalized city, the
 * country, and the browser's timezone, and that is all any caller gets.
 */
export function useDeviceLocation() {
  const [state, setState] = useState<DeviceLocationState>("idle");
  const [city, setCity] = useState<string | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  // The browser's timezone needs no consent and no request — resolve once.
  const [timezone] = useState(detectTimeZone);

  const locate = useCallback(() => {
    setState("locating");
    if (!("geolocation" in navigator)) {
      setState("failed");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const res = await apiClient.get<ReverseResponse>(
            `/location/reverse?lat=${coords.latitude.toFixed(4)}&lng=${coords.longitude.toFixed(4)}`,
          );
          setCity(res.data.city);
          setCountry(res.data.country);
          setState("granted");
        } catch {
          // The lookup failed, not the consent: the user may retry.
          setState("failed");
        }
      },
      () => setState("denied"),
      { timeout: 10_000, maximumAge: 600_000 },
    );
  }, []);

  const reset = useCallback(() => {
    setState("idle");
    setCity(null);
    setCountry(null);
  }, []);

  return { state, city, country, timezone, locate, reset };
}
```

- [ ] **Step 4: Run the tests** — `cd frontend && npx vitest run tests/useDeviceLocation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useDeviceLocation.ts frontend/tests/useDeviceLocation.test.ts
git commit -m "feat(web): the consented device-location hook"
```

---

### Task 6: Frontend — the seeker profile's location row

**Files:**
- Modify: `frontend/src/components/Profile.tsx` (the seeker identity section
  gains a Location row; read the file first and follow its row pattern —
  the email row added for the email-change feature is the model)
- Test: `frontend/tests/profileLocation.test.tsx`

**Interfaces:**
- Consumes: `useDeviceLocation` (Task 5); the profile update call the page
  already makes (grep `profile/update` in `Profile.tsx`) — extend its body
  with `location: { city, country }`.
- Produces: a visible Location row with a "Use my location" button that runs
  the consent flow, shows the detected city + country, and saves it with the
  profile; `data-testid="profile-location"` on the row.

- [ ] **Step 1: Write the failing test** — `frontend/tests/profileLocation.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Profile from "@/components/Profile";
import { apiClient } from "@/lib/apiClient";

vi.mock("@/hooks/useAuthBootstrap", () => ({
  useAuthBootstrap: () => ({ user: { id: "s1", fullName: "Seeker", email: "s@x.test", portal: "seeker", status: "active", emailVerified: true, profileComplete: true }, bootstrapped: true }),
}));

describe("the seeker profile's location row", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("detects, shows, and saves the city", async () => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (ok: (p: { coords: { latitude: number; longitude: number } }) => void) =>
          ok({ coords: { latitude: 12.97, longitude: 77.59 } }),
      },
    });
    const get = vi.spyOn(apiClient, "get").mockResolvedValue({
      data: { success: true, city: "Bengaluru", country: "IN", matched: true, region: "Karnataka", source: "openstreetmap" },
    });
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ data: { success: true } });

    render(<Profile />);
    await userEvent.click(await screen.findByRole("button", { name: /use my location/i }));

    expect(await screen.findByTestId("profile-location")).toHaveTextContent("Bengaluru");
    expect(get).toHaveBeenCalledWith("/location/reverse?lat=12.97&lng=77.59");
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/user/profile/update", expect.objectContaining({
        location: { city: "Bengaluru", country: "IN" },
      })),
    );
    vi.unstubAllGlobals();
  });
});
```

**Note for the implementer:** read `Profile.tsx` and the existing profile-page
tests (grep `Profile` in `frontend/tests/`) first — mock exactly what they mock
(auth bootstrap, apiClient) and follow their render harness; the mock above is
the shape, and the page's real harness is authoritative.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx vitest run tests/profileLocation.test.tsx`
Expected: FAIL — no location row exists.

- [ ] **Step 3: Implement** — in `frontend/src/components/Profile.tsx`, add a
  Location row to the seeker identity section following the page's existing
  row markup (the same `dt`/`dd` or field pattern the email row uses), driven
  by the hook:

```tsx
const location = useDeviceLocation();
// Inside the identity section's rows, beside the email row:
<div data-testid="profile-location" className={/* the page's row classes */}>
  <dt>Location</dt>
  <dd>
    {location.city ? (
      <span>
        {location.city}, {location.country}
      </span>
    ) : (
      <Button variant="outline" size="sm" onClick={location.locate} disabled={location.state === "locating"}>
        {location.state === "locating" ? "Locating…" : "Use my location"}
      </Button>
    )}
  </dd>
</div>
```

and extend the existing profile-save effect/call so that when
`location.state === "granted"` and the profile's stored city differs, the page
posts `location: { city: location.city, country: location.country }` to
`/user/profile/update` (the exact mechanism — effect vs. explicit save button —
follows however the page already persists edits; read it first, mirror it, and
keep the consent explicit: nothing posts without the button having been
clicked).

- [ ] **Step 4: Run the tests** — `cd frontend && npx vitest run tests/profileLocation.test.tsx`
Expected: PASS. Then `npx vitest run --maxWorkers=4` for the suite, and
`npm run lint:colour` (the row uses existing tokens only).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Profile.tsx frontend/tests/profileLocation.test.tsx
git commit -m "feat(web): the seeker profile detects and stores its location"
```

---

### Task 7: Docs, attribution, release note

**Files:**
- Modify: `ARCHITECTURE.md` (a "Location" subsection after the admin-console
  figures section: the keyless stack, the proxy's rate limit + cache, city-only
  storage, coordinates transient)
- Modify: `SECURITY.md` (a short paragraph under the data-handling section:
  city-level PII, coordinates never stored, location never a security input)
- Modify: `frontend/src/pages/About.tsx` (one attribution line: place data ©
  OpenStreetMap contributors)
- Modify: `frontend/src/data/updates.ts` (newest-first entry, id
  `"seeker-location"`, kind `Feature`, dated today — the ordering test asserts
  newest-first and the date horizon test caps at tomorrow UTC)

- [ ] **Step 1: Write the docs.** The ARCHITECTURE paragraph must name the
  real pieces: `GET /location/reverse`, the Nominatim proxy with its
  per-IP rate limit and 1km-box cache, `normalizeCity`'s vocabulary +
  aliases, `useDeviceLocation`'s consent-on-click, and the seeker
  subdocument. SECURITY.md's paragraph states the two invariants: coordinates
  are transient, and no location signal reaches an auth or authorization
  decision. About.tsx carries the attribution line "Place data ©
  OpenStreetMap contributors" in its existing copy style.

- [ ] **Step 2: Release note** — in `updates.ts`, newest first:

```ts
  {
    id: "seeker-location",
    date: "2026-08-31",
    kind: "Feature",
    title: "Your profile can now know where you are looking",
    summary:
      "Candidates can set their city once, with the browser's own permission, and the platform keeps only the city — never the coordinates.",
    details: [
      "A \"Use my location\" action on your profile asks your browser for permission, resolves your city, and saves it to your profile.",
      "Only the city and country are stored. The precise position your browser shares is used for that one lookup and then discarded.",
    ],
  },
```

(Adjust the `date` to the actual ship date.)

- [ ] **Step 3: Verify** — `cd frontend && npx vitest run tests/updates.test.tsx`
and `npm run lint:colour` both pass.

- [ ] **Step 4: Commit**

```bash
git add ARCHITECTURE.md SECURITY.md frontend/src/pages/About.tsx frontend/src/data/updates.ts
git commit -m "docs: the location foundation, its privacy posture, and OSM attribution"
```

---

## Self-Review (completed)

- **Spec coverage:** reverse endpoint ✓ (Task 3), cache + rate limit + UA ✓
  (Tasks 2–3), vocabulary normalization with `matched:false` passthrough ✓
  (Task 1), transient coordinates + city-only storage ✓ (Tasks 4–5), country
  signal for P3 ✓ (Task 3), consent-on-action ✓ (Tasks 5–6), OSM attribution ✓
  (Task 7), SECURITY/ARCHITECTURE docs ✓ (Task 7). Non-goals honored: no map,
  no keys, no recruiter/admin storage.
- **Placeholders:** the two "read the existing harness first" notes are
  deliberate pointers to authoritative patterns, not deferred work; every
  other step carries its code.
- **Type consistency:** `ReverseLocationDto` fields are identical in Tasks
  1–3; `seekerLocationSchema`/`SeekerLocation` names match across Tasks 1 and
  4; the hook's return shape in Task 5 is what Task 6 consumes.
