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

    // 24-hour, seconds included, no meridiem. The first cut formatted 12-hour
    // and stripped the meridiem with /([AP]M)/ — uppercase-only, while every
    // real browser renders en-IN's meridiem lowercase — so "12:34:56 pm" was
    // what shipped, ~28px wider than the design meant, which is what pushed
    // the desktop band's clock onto two lines. Formatting h23 at the source
    // removed the hack and the ambiguity at once.
    expect(screen.getByTestId("clock-time").textContent).toMatch(/^\d{2}:\d{2}:\d{2}$/);
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

  it("is a flat section of the side band, sized by the band it lives in", () => {
    render(<ConsoleClock />);

    // jsdom cannot lay out a page, so this holds the line the real-browser
    // probe measured on 2026-09-01. At lg the side band is a fixed 13rem
    // (208px) track; after the band's own padding that is 168px of content
    // width. The clock used to be a raised card whose border, background and
    // px-4 trimmed that to 133px — while its calendar cells were a fixed
    // size-6 (24px) and the grid needs 7 × 24 = 168px. Every cell sat in a
    // 19px track and overlapped its neighbour by ~5px, the time wrapped onto
    // two lines, and the card's own content overflowed it (scrollWidth 171
    // against clientWidth 165). A card inside the already-surfaced band was
    // double chrome: the section now sits flat on the band like the nav does,
    // and its width is the band's, so the calendar renders the same 24px
    // cells at every width.
    const section = screen.getByTestId("clock-section");
    expect(section.className).toMatch(/border-t\b/);
    expect(section.className).not.toMatch(/bg-paper-raised/);
    expect(section.className).not.toMatch(/shadow/);
    // No horizontal padding of its own — the band already provides it, and
    // every px here is a px off the calendar grid.
    expect(section.className).not.toMatch(/\bpx-\d/);

    const today = screen.getByTestId("clock-today");
    expect(today.className).toMatch(/\bw-full\b/);
    expect(today.className).toMatch(/aspect-square/);
    expect(today.className).toMatch(/max-w-6/);
    // A fixed-size cell cannot shrink to its track; that fixed size is the
    // overlap. The cell takes the track's width, capped at the old 24px so
    // wide bands do not balloon it.
    expect(today.className).not.toMatch(/size-6/);
  });
});
