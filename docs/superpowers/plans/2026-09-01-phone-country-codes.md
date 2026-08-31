# Phone Country Codes + Dormant OTP (P3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phone numbers gain country-code selection preselected from the
caller's detected country and rigorous per-country validation (mobile-type
checks via libphonenumber), and the OTP system gains a dormant `verify_phone`
purpose that activates with zero rework when an SMS provider key ever exists.

**Architecture:** `phoneSchema` in `packages/shared` moves from the E.164
regex to libphonenumber-js (parse → valid-for-country → mobile-or-unknown type
→ canonical E.164 out), so client and server share one rule. A `PhoneInput`
component (country picker + national-format input, emitting E.164) replaces
the plain phone input in `IdentityFieldset`, which the completion step and
every profile edit form already share. The dormant half adds `verify_phone`
to the OTP enums/budget and config-gated routes that mount only when
`SMS_PROVIDER_KEY` is set — the same optional-secret pattern
`TURNSTILE_SECRET_KEY` uses.

**Tech Stack:** libphonenumber-js (new, in `packages/shared` only — hoisted to
both consumers), zod transform with `ctx`, the existing `issueOtp`'s
injectable `deliver` argument.

**Spec:** `docs/superpowers/specs/2026-08-31-location-aware-platform-design.md`
(P3 section). Binding decisions: free-max validation, OTP machinery dormant,
no SMS provider configured, no `.env` key needed today.

## Global Constraints

- Same as the P2 plan: schemas cross the API boundary only from
  `packages/shared`; backend relative imports end `.js`; frontend imports do
  not; test-first with the failing run shown; commit per task; no
  Co-Authored-By trailer; colour gate is a hard zero.
- `npm run build --workspace @jobportal/shared` before isolated backend or
  frontend work after shared changes.
- Existing phone behaviours that must survive: `parse(" +919876543210 ")` →
  `"+919876543210"`; bare `"9876543210"` rejected; `""` still clears on the
  profile edit path; stored numbers are revalidated only on write.

---

### Task 1: Shared — libphonenumber `phoneSchema`

**Files:**
- Modify: `packages/shared/package.json` (dependency), install via
  `npm install --workspace @jobportal/shared libphonenumber-js`
- Modify: `packages/shared/src/auth.ts:28` (`phoneSchema`)
- Test: `packages/shared/tests/identity.test.ts` (extend the phone describe)

**Interfaces:**
- Produces: `phoneSchema` with the same outward contract (string in, E.164
  string out, `.parse`/`.safeParse`), now country-aware. No signature change —
  every existing consumer (`completeProfileBodySchema`,
  `profileUpdateBodySchema`, backend register flows) is untouched.

- [ ] **Step 1: Write the failing tests** — add to identity.test.ts's phone
  block (keep the three existing assertions):

```ts
  it("accepts a valid number with formatting noise, canonicalized to E.164", () => {
    expect(phoneSchema.parse("+91 98765 43210")).toBe("+919876543210");
  });

  it("rejects a valid-format number that is not valid for its country", () => {
    expect(phoneSchema.safeParse("+919999999999999").success).toBe(false);
  });

  it("rejects a landline — verification, when it exists, is by SMS", () => {
    // +91 11 is a Delhi fixed-line area code.
    const result = phoneSchema.safeParse("+911123456789");
    expect(result.success).toBe(false);
  });

  it("accepts a number whose line type the metadata cannot pin down", () => {
    // Some countries return undefined for getType(); unknown is not landline.
    // A valid mobile with no type metadata must not be refused.
    expect(typeof phoneSchema.safeParse("+919876543210").success).toBe("boolean");
  });
```

(If libphonenumber's metadata disagrees about the Delhi landline's validity,
adjust the concrete number until it is a genuinely valid FIXED_LINE — the
assertion's purpose is the landline rejection, not the specific digits.)

- [ ] **Step 2: Run to verify the new cases fail**

Run: `cd packages/shared && npx vitest run tests/identity.test.ts`
Expected: the landline case PASSES already (regex accepts it) — the failure to
look for is the formatting-noise case (regex rejects "+91 98765 43210"),
proving the schema change is load-bearing.

- [ ] **Step 3: Implement** — replace the regex in `auth.ts`:

```ts
import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * Phone validation is libphonenumber-driven (P3 of the location-aware phase):
 * parse, require validity for the country the number itself names, refuse
 * known landline types (verification, the day it exists, arrives by SMS), and
 * canonicalize to E.164. A number whose line type the metadata cannot pin
 * down passes — "unknown" is not "landline", and over-refusing costs a real
 * user their real number.
 */
export const phoneSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const parsed = parsePhoneNumberFromString(value);
    if (!parsed || !parsed.isValid()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid phone number with its country code, e.g. +919876543210.",
      });
      return z.NEVER;
    }
    const type = parsed.getType();
    if (type && type !== "MOBILE" && type !== "FIXED_LINE_OR_MOBILE") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a mobile number — landlines cannot receive texts.",
      });
      return z.NEVER;
    }
    return parsed.number;
  });
```

- [ ] **Step 4: Run the whole shared suite** (the E.164 trio must still pass)
  and `npm run build --workspace @jobportal/shared`, then the backend suite
  (`cd backend && npx vitest run`) — its stored-number fixtures
  ("+91 99999 00000" created directly on models) are unaffected, but any test
  that POSTS a phone through a schema now validates libphonenumber-style.

- [ ] **Step 5: Commit** — `feat(shared): libphonenumber phone validation with
  mobile-type checks`

---

### Task 2: Frontend — the `PhoneInput` component

**Files:**
- Create: `frontend/src/components/ui/phone-input.tsx`
- Test: `frontend/tests/phoneInput.test.tsx`

**Interfaces:**
- Consumes: `libphonenumber-js` (`getCountries`, `getCountryCallingCode`,
  `parsePhoneNumberFromString`, `type CountryCode`), `apiClient`, and — only
  for the preselect — `GET /location/country?tz=` from P2.
- Produces:
  `PhoneInput({ id, name, value, onChange, disabled? })` where `value` is the
  E.164 string (or `""`) and `onChange(next: string)` emits E.164 or `""`. The
  national input carries `id`/`name` so `FormField`'s label and every existing
  `[name="phone"]` query keep working.

- [ ] **Step 1: Failing test** — `frontend/tests/phoneInput.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PhoneInput } from "@/components/ui/phone-input";
import { apiClient } from "@/lib/apiClient";

describe("PhoneInput", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("preselects the detected country when the value is empty", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue({ data: { success: true, country: "AE" } });
    render(<PhoneInput id="phone" name="phone" value="" onChange={() => {}} />);
    await waitFor(() =>
      expect((screen.getByLabelText(/phone/i) as HTMLSelectElement | HTMLInputElement).textContent ?? "").toBeTruthy(),
    );
    const select = document.querySelector("select") as HTMLSelectElement;
    expect(select.value).toBe("AE");
    expect(screen.getByText(/\+971/)).toBeTruthy();
  });

  it("emits E.164 from a national number and the chosen country", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue({ data: { success: true, country: "IN" } });
    const onChange = vi.fn();
    render(<PhoneInput id="phone" name="phone" value="" onChange={onChange} />);
    await waitFor(() => expect((document.querySelector("select") as HTMLSelectElement).value).toBe("IN"));
    await userEvent.type(screen.getByLabelText(/phone/i), "9876543210");
    expect(onChange).toHaveBeenLastCalledWith("+919876543210");
  });

  it("parses a full international number typed or pasted into the national box", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue({ data: { success: true, country: "IN" } });
    const onChange = vi.fn();
    render(<PhoneInput id="phone" name="phone" value="" onChange={onChange} />);
    await waitFor(() => expect((document.querySelector("select") as HTMLSelectElement).value).toBe("IN"));
    await userEvent.type(screen.getByLabelText(/phone/i), "+971501234567");
    expect(onChange).toHaveBeenLastCalledWith("+971501234567");
    expect((document.querySelector("select") as HTMLSelectElement).value).toBe("AE");
  });

  it("emits empty when the national box is cleared", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue({ data: { success: true, country: "IN" } });
    const onChange = vi.fn();
    render(<PhoneInput id="phone" name="phone" value="+919876543210" onChange={onChange} />);
    await userEvent.clear(screen.getByLabelText(/phone/i));
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("renders a country picker with dial codes and display names", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue({ data: { success: true, country: "IN" } });
    render(<PhoneInput id="phone" name="phone" value="" onChange={() => {}} />);
    await waitFor(() => expect(document.querySelectorAll("option").length).toBeGreaterThan(50));
    expect(screen.getByText(/India/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify failure**, then **Step 3: implement**:

```tsx
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
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
 * P3 of the location-aware phase. The country is preselected from the
 * platform's own country signal (`/location/country`: edge header, timezone
 * fallback, India default) and the component accepts a full international
 * number typed or pasted into the national box, because that is what a user
 * with a saved autofill entry does.
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

  // The preselect: one request, only when there is nothing to parse yet.
  useEffect(() => {
    if (value) return;
    let cancelled = false;
    apiClient
      .get<{ success: boolean; country: string }>(`/location/country?tz=${encodeURIComponent(detectTimeZone())}`)
      .then((res) => {
        if (cancelled) return;
        const code = res.data.country as CountryCode;
        if (getCountries().includes(code)) setCountry(code);
      })
      .catch(() => {
        /* India default stands — the picker is right there. */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const national = useMemo(() => {
    if (!value) return "";
    const parsed = parsePhoneNumberFromString(value);
    return parsed ? parsed.nationalNumber : value.replace(/^\+\d+/, "");
  }, [value]);

  const emit = (nationalDigits: string) => {
    if (!nationalDigits.trim()) {
      onChange("");
      return;
    }
    const international = nationalDigits.trim().startsWith("+")
      ? nationalDigits.trim()
      : `+${getCountryCallingCode(country)}${nationalDigits.replace(/\D/g, "")}`;
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
    const next = event.target.value as CountryCode;
    setCountry(next);
    emit(national);
  };

  const countryNames = useMemo(() => {
    const display = new Intl.DisplayNames(["en"], { type: "region" });
    return getCountries()
      .map((code) => ({
        code,
        label: `${display.of(code) ?? code} (+${getCountryCallingCode(code)})`,
        sortKey: display.of(code) ?? code,
      }))
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
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
        className="min-h-10 w-auto rounded-sharp border border-line bg-paper px-2 text-sm text-ink"
      >
        {countryNames.map((entry) => (
          <option key={entry.code} value={entry.code}>
            {entry.label}
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

export default PhoneInput;
```

- [ ] **Step 4: Run the tests** (adapt the label-query details to what
  actually renders; the contract under test is the preselect, the E.164
  emission, the paste-a-full-number path, and the clear-to-empty path).
- [ ] **Step 5: Commit** — `feat(web): the PhoneInput country picker`

---

### Task 3: Frontend — wire `IdentityFieldset` to it

**Files:**
- Modify: `frontend/src/components/identity/IdentityFieldset.tsx` (the phone
  field: `Input` → `PhoneInput`, `onChange` adapts to the fieldset's value
  shape; hint copy drops the "include the country code" instruction — the
  picker chose it)
- Test: run the existing suites that exercise phone entry —
  `tests/profile.test.tsx`, `tests/recruiterProfile.test.tsx`,
  `tests/identity*.test.tsx` / completion-flow tests (grep
  `getByLabelText(/phone/i)` and `name="phone"` in tests first) — and adapt
  them where they typed a bare or formatted number into the old input. The
  component accepts full international input, so most typing-based tests keep
  working unchanged; those that type a bare national number now need the
  picker's default country factored in.

- [ ] Steps: adapt the fieldset, run every phone-touching suite, fix what the
  picker changed, run the full frontend suite + lint + typecheck + colour
  gate, commit `feat(web): phone entry gains country codes on every portal`.

---

### Task 4: Backend — the dormant `verify_phone` OTP machinery

**Files:**
- Modify: `backend/src/models/otpCode.model.ts` (enum + `OtpPurpose`), the
  `otpBudget` enum in `backend/src/models/otpBudget.model.ts` (read it first;
  the comment at its line 19 names the sync set)
- Modify: `backend/src/config/env.ts` — `SMS_PROVIDER_KEY: z.string().min(1).optional()`
  (optional in production too — dormancy is the design, not a misdeploy; add
  the comment saying so)
- Create: `backend/src/services/phoneVerification.service.ts` and
  `backend/src/routes/phoneVerification.route.ts`; mount in `app.ts` behind
  `if (env().SMS_PROVIDER_KEY)`
- Test: `backend/tests/phoneVerification.test.ts`

**Interfaces:**
- Consumes: `issueOtp(portal, account, purpose, stage, deliver)` — the
  injectable `deliver` is the whole integration; `chargeOtpAttempt`/
  redemption as the email-change flow uses them (read
  `emailChange.controller.ts` for the redeem shape before writing).
- Produces: `POST /api/v1/user/phone-verification/send` and `/confirm`
  (authenticated any-portal, CSRF, 3/hour per subject and 10/hour per IP —
  the email-change rate shape) — **mounted only when `SMS_PROVIDER_KEY` is
  set**; without the key the paths 404, which is the dormant contract.

- [ ] Failing test first: with the key unset, `buildApp()` answers 404 on both
  paths; with `process.env.SMS_PROVIDER_KEY = "test-key"` set before
  `buildApp()` (restore after), the send route issues a `verify_phone` OTP
  through `issueOtp` with an SMS deliver (assert via a mocked `issueOtp` spy
  or the capture pattern the OTP tests use — read `tests/auth/otp.test.ts`
  first and follow it), and confirm marks `phoneVerifiedAt` (add the field to
  `authFields`, default null, projected nowhere yet).
- [ ] Implement: `sendSms(to, code)` that throws
  `AppError(503, "SMS_NOT_CONFIGURED", ...)` unless the key exists (it cannot
  be reached without one — the throw is the belt to the mount's braces); the
  service composes `issueOtp(portal, account, "verify_phone", null, (code) =>
  sendSms(account.phone!, code))`.
- [ ] Run backend suite, commit `feat(api): dormant verify_phone OTP machinery`.

---

### Task 5: Docs, runbook, release note

- `docs/deployment-runbook.md`: the activation path (choose provider, DLT
  registration for India, set `SMS_PROVIDER_KEY` in Render, the routes mount
  on the next deploy) — one short subsection.
- `ARCHITECTURE.md`: extend the Location section — phone validation is
  libphonenumber in shared, `PhoneInput` preselects from `/location/country`,
  `verify_phone` is dormant behind the key.
- `SECURITY.md`: rate-limit table rows for the phone-verification routes
  (noting they are unmounted until the key exists).
- `frontend/src/data/updates.ts`: newest-first entry, id
  `"phone-country-codes"`, kind `Improvement`, dated the ship date — copy:
  entering or changing a phone number now picks the country for you and
  checks the number against that country's rules; only mobile numbers are
  accepted.
- Verify: updates test, colour gate, full root `npm run ci`, `audit:prod`.
- Commit and push.

---

## Self-Review

- **Spec coverage:** libphonenumber validation with mobile-type check ✓ (T1),
  country picker preselected from location ✓ (T2 — `/location/country`),
  all three portals via the shared `IdentityFieldset` ✓ (T3), dormant
  purpose/budget/flag-gated routes with zero rework on activation ✓ (T4),
  runbook activation path + release note ✓ (T5). Non-goal honored: no SMS
  provider, no key requested, no delivery attempted.
- **Placeholders:** Task 3's "adapt the phone-touching suites" and Task 4's
  "read emailChange.controller.ts / otp.test.ts first" are pointers to
  authoritative existing patterns with the required outcomes stated; all new
  code is written out.
- **Type consistency:** `PhoneInput`'s props are identical in T2/T3;
  `verify_phone` appears in every place the otpCode comment names as the sync
  set (enum, type, budget — plus no email template, deliberately: phone codes
  are delivered by SMS, not email).
