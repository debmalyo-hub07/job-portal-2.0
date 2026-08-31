import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";

import { apiClient } from "@/lib/apiClient";
import { detectTimeZone } from "@/lib/timeZone";

/**
 * A country-code picker plus a national-format number box, emitting E.164 —
 * P3 of the location-aware phase.
 *
 * The country is preselected from the platform's own country signal
 * (`/location/country`: the edge header, the timezone fallback, India
 * default) — one request, only while the value is empty. A full
 * international number typed or pasted into the national box is parsed and
 * switches the country with it, because that is what a browser autofill or a
 * copied number looks like.
 *
 * The box is a local typing buffer, not a mirror of the value: a parent that
 * feeds the emission straight back (every form here does) would otherwise
 * have the text morph under the user's cursor mid-keystroke. The buffer
 * re-derives only when the value changes for reasons other than our own last
 * emission — a prefill, a clear, a normalization.
 *
 * The component emits; it does not judge. Validity is `phoneSchema`'s call,
 * in shared, on the server as on the client — so the rule cannot drift
 * between what the form suggests and what the API accepts.
 */
export function PhoneInput({
  id,
  name,
  value,
  onChange,
  disabled = false,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const [country, setCountry] = useState<CountryCode>("IN");
  const [national, setNational] = useState(() => deriveNational(value));
  /** The last value this component emitted — its echo in `value` is not an external change. */
  const lastEmitted = useRef<string | null>(null);

  // The preselect: one request, only when there is nothing to parse yet.
  useEffect(() => {
    if (value) return;
    let cancelled = false;
    apiClient
      .get<{ success: boolean; country: string }>(
        `/location/country?tz=${encodeURIComponent(detectTimeZone())}`,
      )
      .then((res) => {
        if (cancelled) return;
        const code = res.data.country as CountryCode;
        if (getCountries().includes(code)) setCountry(code);
      })
      .catch(() => {
        /* The India default stands — the picker is right there. */
      });
    return () => {
      cancelled = true;
    };
    // Value-independent by design: the preselect runs once, at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (value !== lastEmitted.current) setNational(deriveNational(value));
  }, [value]);

  const emit = (nationalDigits: string) => {
    setNational(nationalDigits);
    const trimmed = nationalDigits.trim();
    if (!trimmed) {
      lastEmitted.current = "";
      onChange("");
      return;
    }
    const international = trimmed.startsWith("+")
      ? trimmed
      : `+${getCountryCallingCode(country)}${trimmed.replace(/\D/g, "")}`;
    lastEmitted.current = international;
    onChange(international);
  };

  const onNationalChange = (event: ChangeEvent<HTMLInputElement>) => {
    const digits = event.target.value;
    // A full international number switches the country with it.
    if (digits.startsWith("+")) {
      const parsed = parsePhoneNumberFromString(digits);
      if (parsed?.country) setCountry(parsed.country);
    }
    emit(digits);
  };

  const onCountryChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setCountry(event.target.value as CountryCode);
    emit(national);
  };

  const options = useMemo(() => {
    const display = new Intl.DisplayNames(["en"], { type: "region" });
    return getCountries()
      .map((code) => {
        const name = display.of(code) ?? code;
        return { code, label: `${name} (+${getCountryCallingCode(code)})`, name };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  return (
    <div className="flex gap-2">
      <label className="sr-only" htmlFor={`${id}-country`}>
        Country code
      </label>
      <select
        id={`${id}-country`}
        value={country}
        onChange={onCountryChange}
        disabled={disabled}
        className="min-h-11 w-auto rounded-sharp border border-line-strong bg-paper px-2 text-sm text-ink"
      >
        {options.map((option) => (
          <option key={option.code} value={option.code}>
            {option.label}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor={id}>
        Phone number
      </label>
      <input
        id={id}
        name={name}
        type="tel"
        autoComplete="tel-national"
        inputMode="tel"
        value={national}
        onChange={onNationalChange}
        disabled={disabled}
        placeholder="98765 43210"
        className="h-11 w-full min-w-0 appearance-none rounded-sharp border border-line-strong bg-paper px-3.5 py-2 text-base text-ink transition-[border-color,box-shadow] duration-(--dur-fast) outline-none"
      />
    </div>
  );
}

/** The national part of an E.164 value; unparsable values show verbatim (mid-typing). */
function deriveNational(value: string): string {
  if (!value) return "";
  const parsed = parsePhoneNumberFromString(value);
  return parsed ? parsed.nationalNumber : value;
}

export default PhoneInput;
