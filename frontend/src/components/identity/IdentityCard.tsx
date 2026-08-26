import { Cake, Contact, Mail, User2 } from "lucide-react";
import { GENDER_LABELS, type ProfileView } from "@jobportal/shared";

/**
 * The identity block every portal's profile page shows.
 *
 * The date is formatted in UTC deliberately. `dob` is stored at UTC midnight and
 * crosses the wire as `YYYY-MM-DD`; a local formatter renders the previous day in
 * any negative-offset zone, which is a different birthday.
 */
export function IdentityCard({ profile }: { profile: ProfileView }) {
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
    <dl className="grid gap-3 sm:grid-cols-2">
      {rows.map(({ icon: Icon, label, value }) => (
        <div key={label} className="flex items-start gap-2">
          <Icon className="mt-0.5 size-4 text-ink-muted" aria-hidden />
          <div className="min-w-0">
            <dt className="text-xs uppercase text-ink-muted">{label}</dt>
            <dd className="truncate text-sm text-ink">{value}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
}

export default IdentityCard;
