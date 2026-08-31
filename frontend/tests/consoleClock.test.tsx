import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ConsoleClock } from "@/components/console/ConsoleClock";
import { detectTimeZone } from "@/lib/timeZone";

const NOON_IST = new Date("2026-08-31T12:34:56"); // local-time naive on purpose

describe("detectTimeZone", () => {
  it("falls back to IST when the runtime reports nothing", () => {
    const reports = () => ({ locale: "en", timeZone: undefined }) as Intl.ResolvedDateTimeFormatOptions;
    expect(detectTimeZone(reports)).toBe("Asia/Kolkata");
  });

  it("falls back to IST when the runtime throws", () => {
    const throws = () => {
      throw new Error("no icu");
    };
    expect(detectTimeZone(throws)).toBe("Asia/Kolkata");
  });

  it("keeps whatever the runtime reports when it is usable", () => {
    const reports = () => ({ locale: "en", timeZone: "Europe/Berlin" }) as Intl.ResolvedDateTimeFormatOptions;
    expect(detectTimeZone(reports)).toBe("Europe/Berlin");
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
    // The offset label's SHAPE, not its digits: ICU versions differ on
    // zero offsets ("GMT+0" vs "GMT+0:00") and half-hour zones carry minutes,
    // so anything stricter than "GMT, a sign, a digit" is machine-dependent.
    expect(screen.getByTestId("clock-zone").textContent).toMatch(/^GMT[+-]\d/);
  });

  it("ticks every second", () => {
    render(<ConsoleClock />);
    const before = screen.getByTestId("clock-time").textContent;

    act(() => {
      vi.advanceTimersByTime(2100);
    });
    expect(screen.getByTestId("clock-time").textContent).not.toBe(before);
  });

  it("shows the detected zone by default, as the picker's selected value", () => {
    render(<ConsoleClock />);
    // The component's default must agree with detection — the fallback logic
    // itself is pinned at the lib level above, where it is injectable. (Node's
    // no-arg Intl fast path cannot be intercepted from a prototype spy, which
    // is why this is not tested by mocking detection at the component level.)
    const picker = screen.getByRole("combobox", { name: /timezone/i }) as HTMLSelectElement;
    expect(picker.value).toBe(detectTimeZone());
  });

  it("switches zones from the picker and remembers the choice", () => {
    render(<ConsoleClock />);
    const picker = screen.getByRole("combobox", { name: /timezone/i }) as HTMLSelectElement;

    fireEvent.change(picker, { target: { value: "UTC" } });

    // The switch and its persistence are the behavior. Whether the rendered
    // TIME changes depends on the runner's own timezone (on a UTC runner it
    // does not), so the time text is deliberately not asserted here.
    expect(picker.value).toBe("UTC");
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
