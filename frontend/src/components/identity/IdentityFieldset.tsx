import type { ChangeEvent } from "react";
import { GENDERS, GENDER_LABELS, type Gender } from "@jobportal/shared";

import { FormField } from "@/components/layout/FormField";
import { Input } from "@/components/ui/input";

export type IdentityValue = { dob: string; phone: string; gender: "" | Gender };

/**
 * The identity block, shared by the completion step and every profile edit form.
 * One place for the "18 or over" rule and the E.164 hint — two copies is how they
 * drift, which is exactly what happened to the phone rule before this project.
 *
 * `dobRequired` is false on the profile edit forms: the field is correctable
 * there but absent means "leave alone", and a required marker would imply the
 * form refuses to save without re-entering it.
 */
export function IdentityFieldset({
  value,
  onChange,
  dobRequired = true,
  disabled = false,
}: {
  value: IdentityValue;
  onChange: (next: IdentityValue) => void;
  dobRequired?: boolean;
  disabled?: boolean;
}) {
  const set = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...value, [e.target.name]: e.target.value } as IdentityValue);

  return (
    <>
      {/* `type="date"` posts YYYY-MM-DD, which is what `dobSchema` reads — no
          locale parsing in between, in either direction. */}
      <FormField
        label="Date of birth"
        htmlFor="dob"
        hint="16-17 year olds can join with a guardian's OK, and apply to internships only."
        required={dobRequired}
      >
        <Input
          id="dob"
          name="dob"
          type="date"
          value={value.dob}
          onChange={set}
          disabled={disabled}
        />
      </FormField>

      <FormField
        label="Phone"
        htmlFor="phone"
        hint="Optional. Include the country code, e.g. +919876543210."
      >
        <Input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          value={value.phone}
          onChange={set}
          disabled={disabled}
          placeholder="+919876543210"
        />
      </FormField>

      <FormField label="Gender" htmlFor="gender" hint="Optional. Never shown to recruiters.">
        {/* A native select: the option set is four fixed values, and this is the
            one control a keyboard and a screen reader both get for free. */}
        <select
          id="gender"
          name="gender"
          value={value.gender}
          onChange={set}
          disabled={disabled}
          className="min-h-10 w-full rounded-sharp border border-line bg-paper px-3 text-sm text-ink"
        >
          <option value="">Not specified</option>
          {GENDERS.map((g) => (
            <option key={g} value={g}>
              {GENDER_LABELS[g]}
            </option>
          ))}
        </select>
      </FormField>
    </>
  );
}

export default IdentityFieldset;
