import { useCallback, useState } from "react";

import type { ReverseLocationDto } from "@jobportal/shared";

import { apiClient } from "@/lib/apiClient";
import { detectTimeZone } from "@/lib/timeZone";

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
 *
 * The states are honest about cause: `denied` is the browser's answer (show
 * how to change it, offer nothing), `failed` is ours (offer a retry).
 */
export function useDeviceLocation() {
  const [state, setState] = useState<DeviceLocationState>("idle");
  const [city, setCity] = useState<string | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  // The browser's timezone needs no consent and no request — resolve once.
  const [timezone] = useState(detectTimeZone);

  const locate = useCallback(() => {
    setState("locating");
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
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
