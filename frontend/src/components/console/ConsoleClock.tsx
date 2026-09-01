import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { ZONE_CHOICES, detectTimeZone } from "@/lib/timeZone";

/**
 * The console's live clock and calendar — P1 of the location-aware phase.
 *
 * The console previously had no clock at all, only the dashboard's server-
 * stamped "as of" minute, which jumped on each refetch — a stamp since
 * removed from the header, so this is where the console's time lives: a
 * ticking clock, the full date, and a month calendar in the console's side
 * band, on every screen.
 *
 * The timezone is the browser's own (`Intl` — exact, offline, free) with
 * **Asia/Kolkata as the default** when the runtime reports nothing, per the
 * phase decision. The choice is per-browser (localStorage) because it is a
 * viewer convenience, not platform state.
 *
 * A section of the band, not a card on it. The band is the surface — the nav
 * above sits on it the same way — and every pixel of a card's own chrome or
 * padding was a pixel off the calendar grid: a boxed card with `px-4` left
 * 133px for a grid whose cells want 168px, and the fixed `size-6` cells
 * overlapped each other by ~5px at every desktop width. The section carries
 * no padding of its own and the cells size to their tracks, so the calendar
 * renders the same 24px cells from the 13rem desktop band down to a phone.
 *
 * The tick is a plain one-second interval, not the shared rAF motion clock:
 * a wall clock has no frames to align and no animation to honour — the display
 * is text that changes value, which is motion-safe by construction, so nothing
 * here branches on `prefers-reduced-motion`.
 */

const STORAGE_KEY = "console-clock-zone";

function readStoredZone(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? detectTimeZone();
  } catch {
    // Private-mode browsers can refuse storage; the clock still works.
    return detectTimeZone();
  }
}

const timeFormatter = (zone: string) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    // 24-hour: a bare 12-hour time is ambiguous, and stripping the meridiem
    // after the fact was already tried — en-IN renders it lowercase ("pm"),
    // which an uppercase-only regex never caught, so the wider string is what
    // pushed the desktop band's clock onto two lines.
    hourCycle: "h23",
  });

const dateFormatter = (zone: string) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: zone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/** "GMT+5:30" — the honest label; abbreviations like IST are locale-dependent. */
function offsetLabel(zone: string, at: number): string {
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: zone,
    timeZoneName: "shortOffset",
  }).formatToParts(at);
  return parts.find((part) => part.type === "timeZoneName")?.value ?? zone;
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Day-of-month grid for a month cursor, Monday-first, zero-padded for blanks. */
function monthGrid(year: number, month: number): (number | null)[] {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leading = (first.getDay() + 6) % 7; // Monday = 0
  const cells: (number | null)[] = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
  return cells;
}

export function ConsoleClock() {
  const [zone, setZone] = useState<string>(readStoredZone);
  const [now, setNow] = useState<number>(() => Date.now());
  const [cursor, setCursor] = useState<{ year: number; month: number }>(() => {
    const at = new Date();
    return { year: at.getFullYear(), month: at.getMonth() };
  });

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const changeZone = (next: string) => {
    setZone(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage refused (private mode): the choice lasts this visit only.
    }
  };

  const current = new Date(now);
  const today = { day: current.getDate(), month: current.getMonth(), year: current.getFullYear() };
  const inCursorMonth =
    today.year === cursor.year && today.month === cursor.month;

  const time = useMemo(() => timeFormatter(zone).format(now), [zone, now]);
  const date = useMemo(() => dateFormatter(zone).format(now), [zone, now]);

  const shiftMonth = (delta: number) =>
    setCursor((currentCursor) => {
      const next = new Date(currentCursor.year, currentCursor.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });

  const zoneChoices = useMemo(() => {
    // The detected zone leads the list when it is not already a choice, so the
    // viewer's own zone is one click away even outside the curated set.
    const detected = detectTimeZone();
    const extra = ZONE_CHOICES.some((choice) => choice.id === detected)
      ? []
      : [{ id: detected, label: detected }];
    return [...extra, ...ZONE_CHOICES];
  }, []);

  return (
    <div
      data-testid="clock-section"
      className="mt-6 border-t border-line pt-4 lg:mt-8"
    >
      {/* aria-live is deliberately absent: a clock that announced itself
          every second would talk over everything else on the page. */}
      <p
        data-testid="clock-time"
        className="font-display text-3xl font-semibold leading-none tabular-nums text-ink"
      >
        {time}
      </p>
      <p data-testid="clock-date" className="mt-2 text-xs text-ink-muted">
        {date}
      </p>
      <p data-testid="clock-zone" className="mt-1 text-xs font-medium text-signal-text">
        {offsetLabel(zone, now)}
      </p>

      <label className="mt-4 block">
        <span className="sr-only">Timezone</span>
        <select
          value={zone}
          onChange={(event) => changeZone(event.target.value)}
          className="w-full rounded-sharp border border-line bg-paper px-2 py-1.5 text-xs text-ink"
        >
          {zoneChoices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.label}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-4 border-t border-line pt-3">
        <div className="flex items-center justify-between">
          <p data-testid="clock-month" className="text-xs font-semibold text-ink">
            {MONTHS[cursor.month]} {cursor.year}
          </p>
          <div className="flex gap-1">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => shiftMonth(-1)}
              className="flex size-6 items-center justify-center rounded-sharp text-ink-muted hover:bg-paper hover:text-ink"
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => shiftMonth(1)}
              className="flex size-6 items-center justify-center rounded-sharp text-ink-muted hover:bg-paper hover:text-ink"
            >
              <ChevronRight aria-hidden="true" className="size-4" />
            </button>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-7 gap-y-1 text-center">
          {WEEKDAYS.map((weekday) => (
            <span key={weekday} className="text-[0.625rem] font-medium uppercase text-ink-muted">
              {weekday}
            </span>
          ))}
          {monthGrid(cursor.year, cursor.month).map((day, index) => (
            <span
              key={index}
              data-testid={inCursorMonth && day === today.day ? "clock-today" : undefined}
              className={cn(
                // The cell takes its track's width, capped at 24px, rather
                // than a fixed size: a fixed cell cannot shrink, and at lg
                // the 13rem band's tracks are the width the grid has —
                // fixed 24px cells in 19px tracks overlapped each other by
                // ~5px on every desktop console screen.
                "mx-auto flex aspect-square w-full max-w-6 items-center justify-center rounded-full text-[0.6875rem] tabular-nums",
                day === null && "opacity-0",
                inCursorMonth && day === today.day
                  ? "bg-signal font-semibold text-signal-fg"
                  : "text-ink-muted",
              )}
            >
              {day ?? 0}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ConsoleClock;
