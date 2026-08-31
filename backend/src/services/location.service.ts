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
 *
 * Coordinates never leave this module's arguments: the cached and returned
 * value is the normalized city-level DTO and nothing else.
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
  // Nominatim names the settlement by size class, not one field: a suburb of
  // Bengaluru reports city=Bengaluru, a village outside reports village=X.
  // First present wins; normalizeCity decides what the board calls it.
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
    // Insertion-order eviction: a Map iterates oldest key first.
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
 *
 * Accepts both header shapes this codebase meets: a fetch `Headers` in tests
 * and Express's plain lower-cased record on a live request.
 */
export function countryFromRequest(
  headers: Headers | Record<string, string | string[] | undefined>,
  timeZone: string | null | undefined,
): string {
  const header =
    headers instanceof Headers
      ? headers.get("x-vercel-ip-country")
      : ((headers["x-vercel-ip-country"] as string | string[] | undefined) ?? null);
  const value = Array.isArray(header) ? header[0] : header;
  if (value && /^[A-Za-z]{2}$/.test(value)) return value.toUpperCase();
  if (timeZone && TIMEZONE_COUNTRY[timeZone]) return TIMEZONE_COUNTRY[timeZone];
  return "IN";
}
