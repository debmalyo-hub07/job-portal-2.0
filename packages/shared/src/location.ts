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

/**
 * P4 — "near you". The region grouping behind the distance band: the board's
 * seven office cities into north/west/south/east. Keys are board vocabulary
 * (never "Remote" — that is a way of working, not a place).
 */
export const CITY_REGIONS: Record<string, "north" | "west" | "south" | "east"> = {
  "Delhi NCR": "north",
  Mumbai: "west",
  Pune: "west",
  Bengaluru: "south",
  Chennai: "south",
  Hyderabad: "south",
  Kolkata: "east",
};

export type DistanceBand = "same_city" | "same_region" | "elsewhere" | "remote";

export function distanceBand(seekerCity: string | null, jobCity: string, remote: boolean): DistanceBand {
  if (remote) return "remote";
  if (!seekerCity) return "elsewhere";
  if (seekerCity === jobCity) return "same_city";
  return CITY_REGIONS[seekerCity] === CITY_REGIONS[jobCity] ? "same_region" : "elsewhere";
}

/** Named, not magic — the spec locked these with the user on 2026-08-31. */
export const NEAR_ME_WEIGHTS = { distance: 0.5, fit: 0.35, recency: 0.15 } as const;

const BAND_VALUE: Record<DistanceBand, number> = { same_city: 3, same_region: 2, remote: 2, elsewhere: 1 };
const RECENCY_SPAN_MS = 56 * 86_400_000; // eight weeks

/**
 * The composed "near you" score, 0–1. Distance dominates, fit is close behind,
 * recency keeps fresh postings surfacing. Remote sits at the same-region band:
 * it outranks a far-city role but never the seeker's own city.
 */
export function nearMeScore(
  band: DistanceBand,
  fitScore0to100: number,
  postedAt: string | Date,
  now: Date = new Date(),
): number {
  const posted = postedAt instanceof Date ? postedAt : new Date(postedAt);
  const age = Math.max(0, now.getTime() - posted.getTime());
  const recency = Math.max(0, 1 - age / RECENCY_SPAN_MS);
  const score =
    NEAR_ME_WEIGHTS.distance * (BAND_VALUE[band] / 3) +
    NEAR_ME_WEIGHTS.fit * (Math.min(100, Math.max(0, fitScore0to100)) / 100) +
    NEAR_ME_WEIGHTS.recency * recency;
  return Math.round(score * 1000) / 1000;
}
