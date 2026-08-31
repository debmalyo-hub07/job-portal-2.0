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
