import { useState } from "react";
import { Cake, Contact, Mail, User2 } from "lucide-react";
import { GENDER_LABELS, type ProfileView } from "@jobportal/shared";

import ChangeEmailDialog from "./ChangeEmailDialog";

/**
 * The identity block every portal's profile page shows.
 *
 * The date is formatted in UTC deliberately. `dob` is stored at UTC midnight and
 * crosses the wire as `YYYY-MM-DD`; a local formatter renders the previous day in
 * any negative-offset zone, which is a different birthday.
 *
 * The email row is the one field with an action: the address can be changed
 * from any portal's profile, and the dialog that does it lives here so all
 * three surfaces get it from one place.
 */
export function IdentityCard({ profile }: { profile: ProfileView }) {
  const [changeOpen, setChangeOpen] = useState(false);

  const rows = [
    { icon: Mail, label: "Email", value: profile.user.email },
    { icon: Contact, label: "Phone", value: profile.phone ?? "Not added" },
    {
      icon: Cake,
      label: "Date of birth",
      value: profile.dob
        ? new Date(`${profile.dob}T00:00:00Z`).toLocaleDateString(undefined, {
            timeZone: "UTC",
            dateStyle: "long",
          })
        : "Not added",
    },
    {
      icon: User2,
      label: "Gender",
      value: profile.gender ? GENDER_LABELS[profile.gender] : "Not specified",
    },
  ];

  return (
    <>
      <dl className="grid gap-3 sm:grid-cols-2">
        {rows.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-start gap-2">
            <Icon className="mt-0.5 size-4 text-ink-muted" aria-hidden />
            <div className="min-w-0">
              <dt className="text-xs uppercase text-ink-muted">{label}</dt>
              <dd className="truncate text-sm text-ink">
                {value}
                {label === "Email" ? (
                  <button
                    type="button"
                    onClick={() => setChangeOpen(true)}
                    className="ml-2 text-xs text-signal-text hover:underline focus-visible:ring-[3px] focus-visible:ring-signal-ring focus-visible:outline-none"
                  >
                  Change{" "}
                  <span className="sr-only">email address</span>
                  </button>
                ) : null}
              </dd>
            </div>
          </div>
        ))}
      </dl>

      {/* Mounted only while open: the dialog needs Router and Redux contexts
          that a bare render of this card (as in tests, and any future
          read-only surface) does not have to provide. Mounting on demand also
          resets its step state on every close, which is what a resumable flow
          wants anyway. */}
      {changeOpen ? (
        <ChangeEmailDialog open={changeOpen} setOpen={setChangeOpen} profile={profile} />
      ) : null}
    </>
  );
}

export default IdentityCard;
