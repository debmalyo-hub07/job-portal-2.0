import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import { useDeviceLocation } from "@/hooks/useDeviceLocation";
import { apiClient } from "@/lib/apiClient";

type PositionOk = (position: { coords: { latitude: number; longitude: number } }) => void;
type PositionErr = (error: { code: number; message: string }) => void;

describe("useDeviceLocation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("runs consent, the reverse lookup, and reports the normalized city", async () => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (ok: PositionOk) => ok({ coords: { latitude: 12.97, longitude: 77.59 } }),
      },
    });
    const get = vi.spyOn(apiClient, "get").mockResolvedValue({
      data: { success: true, city: "Bengaluru", country: "IN", matched: true, region: "Karnataka", source: "openstreetmap" },
    });

    const { result } = renderHook(() => useDeviceLocation());
    act(() => result.current.locate());

    await waitFor(() => expect(result.current.state).toBe("granted"));
    expect(result.current.city).toBe("Bengaluru");
    expect(result.current.country).toBe("IN");
    expect(get).toHaveBeenCalledWith("/location/reverse?lat=12.9700&lng=77.5900");
  });

  it("reports denied without any API call", async () => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (_ok: PositionOk, err: PositionErr) => err({ code: 1, message: "denied" }),
      },
    });
    const get = vi.spyOn(apiClient, "get");

    const { result } = renderHook(() => useDeviceLocation());
    act(() => result.current.locate());

    await waitFor(() => expect(result.current.state).toBe("denied"));
    expect(get).not.toHaveBeenCalled();
  });

  it("fails quietly when the browser has no geolocation at all", async () => {
    vi.stubGlobal("navigator", {});
    const { result } = renderHook(() => useDeviceLocation());
    act(() => result.current.locate());
    expect(result.current.state).toBe("failed");
  });

  it("reports failed when the reverse lookup errors, so a retry is possible", async () => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (ok: PositionOk) => ok({ coords: { latitude: 1, longitude: 1 } }),
      },
    });
    vi.spyOn(apiClient, "get").mockRejectedValue(new Error("network"));

    const { result } = renderHook(() => useDeviceLocation());
    act(() => result.current.locate());

    await waitFor(() => expect(result.current.state).toBe("failed"));
    expect(result.current.city).toBeNull();
  });

  it("always carries a timezone, from the browser, regardless of consent", () => {
    vi.stubGlobal("navigator", {});
    const { result } = renderHook(() => useDeviceLocation());
    expect(result.current.timezone).toBeTruthy();
  });

  it("resets to idle with nothing remembered", () => {
    vi.stubGlobal("navigator", {});
    const { result } = renderHook(() => useDeviceLocation());
    act(() => {
      result.current.locate();
      result.current.reset();
    });
    expect(result.current.state).toBe("idle");
    expect(result.current.city).toBeNull();
  });
});
