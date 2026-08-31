import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ConsoleClock } from "@/components/console/ConsoleClock";
import { detectTimeZone } from "@/lib/timeZone";

const NOON_IST = new Date("2026-08-31T12:34:56"); // local-time naive on purpose

describe("detectTimeZone", () => {
  it("falls back to IST when the runtime reports nothing", () => {
    const spy = vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions");
    spy.mockReturnValue({ locale: "en", timeZone: undefined } as Intl.ResolvedDateTimeFormatOptions);
    expect(detectTimeZone()).toBe("Asia/Kolkata");
    spy.mockRestore();
  });

  it("keeps whatever the runtime reports when it is usable", () => {
    const spy = vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions");
    spy.mockReturnValue({ locale: "en", timeZone: "Europe/Berlin" } as Intl.ResolvedDateTimeFormatOptions);
    expect(detectTimeZone()).toBe("Europe/Berlin");
    spy.mockRestore();
  });
});

describe("ConsoleClock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOON_IST);
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("renders the live time, the full date, and a timezone label", () => {
    render(<ConsoleClock />);

    expect(screen.getByTestId("clock-time").textContent).toMatch(/^\d{1,2}:\d{2}/);
    // en-IN day-first, matching the platform's locale.
    expect(screen.getByTestId("clock-date").textContent).toMatch(/31 August 2026/);
    expect(screen.getByTestId("clock-zone").textContent).toMatch(/GMT[+-]\d{1,2}:\d{2}/);
  });

  it("ticks every second", () => {
    render(<ConsoleClock />);
    const before = screen.getByTestId("clock-time").textContent;

    act(() => {
      vi.advanceTimersByTime(2100);
    });
    expect(screen.getByTestId("clock-time").textContent).not.toBe(before);
  });

  it("shows IST by default when no zone was chosen and detection fails", () => {
    const spy = vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions");
    spy.mockReturnValue({ locale: "en", timeZone: undefined } as Intl.ResolvedDateTimeFormatOptions);
    render(<ConsoleClock />);
    spy.mockRestore();

    expect(screen.getByTestId("clock-zone").textContent).toMatch(/GMT\+5:30/);
  });

  it("switches zones from the picker and remembers the choice", () => {
    render(<ConsoleClock />);

    const before = screen.getByTestId("clock-time").textContent;
    fireEvent.change(screen.getByRole("combobox", { name: /timezone/i }), { target: { value: "UTC" } });

    // With the system time fixed, switching zone changes the rendered hour
    // (local noon vs UTC afternoon — or the reverse; either way not equal).
    const after = screen.getByTestId("clock-time").textContent;
    expect(after).not.toBe(before);
    expect(window.localStorage.getItem("console-clock-zone")).toBe("UTC");
  });

  it("renders the calendar month with today highlighted and navigates months", () => {
    render(<ConsoleClock />);

    expect(screen.getByTestId("clock-month").textContent).toBe("August 2026");
    expect(screen.getByTestId("clock-today").textContent).toBe("31");

    fireEvent.click(screen.getByRole("button", { name: /next month/i }));
    expect(screen.getByTestId("clock-month").textContent).toBe("September 2026");
    expect(screen.queryByTestId("clock-today")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /previous month/i }));
    fireEvent.click(screen.getByRole("button", { name: /previous month/i }));
    expect(screen.getByTestId("clock-month").textContent).toBe("July 2026");
  });
});
