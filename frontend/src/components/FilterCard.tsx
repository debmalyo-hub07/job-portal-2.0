import { useSearchParams } from "react-router";
import { JOB_TYPES } from "@jobportal/shared";

import { Label } from "./ui/label";
import { useFacetToggle } from "@/hooks/useJobSearch";

/**
 * The job board's filter rail. The URLSearchParams *is* the state: this reads
 * the current selection for its controls and writes back through
 * `setSearchParams`, so every filter is shareable and survives a reload.
 *
 * Multi-select with OR within a facet (two Locations checked → jobs in either
 * city) and AND across facets (Location AND JobType must both match).
 *
 * The taxonomy is seeded from the shapes recruiters actually post. Salary and
 * experience are ceilings rather than bands because that is what the backend's
 * `jobListQuerySchema` range-matches on — offering a band the API cannot express
 * is how the pre-4B rail ended up searching for the literal string "0-5 LPA"
 * inside job titles.
 */
const FACETS: { label: string; key: "location" | "jobType"; options: string[] }[] = [
  {
    label: "Location",
    key: "location",
    options: ["Delhi NCR", "Mumbai", "Bengaluru", "Hyderabad", "Chennai", "Pune"],
  },
  {
    label: "Job Type",
    key: "jobType",
    // Not a local copy: the form posts from this same list, and a second
    // hardcoded literal here is exactly how the two drifted on casing.
    options: [...JOB_TYPES],
  },
];

/**
 * Ceiling filters. The value is what goes in the URL; the label is the ask.
 *
 * `null` is the unset option and is listed first. An explicit "Any" is what
 * makes these keyboard-navigable: click-to-unset would have to distinguish a
 * click on the already-selected radio from a click on a new one, which means
 * depending on whether React fires onClick before onChange for radios.
 */
type Ceiling = { value: string | null; label: string };

const SALARY_CEILINGS: Ceiling[] = [
  { value: null, label: "Any salary" },
  { value: "5", label: "Up to ₹5L" },
  { value: "10", label: "Up to ₹10L" },
  { value: "20", label: "Up to ₹20L" },
  { value: "40", label: "Up to ₹40L" },
];

const EXPERIENCE_CEILINGS: Ceiling[] = [
  { value: null, label: "Any experience" },
  { value: "0", label: "No experience needed" },
  { value: "2", label: "Up to 2 years" },
  { value: "5", label: "Up to 5 years" },
  { value: "10", label: "Up to 10 years" },
];

/** Params a filter reset clears. `page` goes too — see clearAll. */
const FILTER_PARAMS = ["location", "jobType", "salaryMax", "experienceMax", "remote"] as const;

function isChecked(sp: URLSearchParams, key: "location" | "jobType", value: string): boolean {
  const raw = sp.get(key) ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .includes(value);
}

/**
 * A single-choice ceiling group. Salary and experience are the same control
 * over different data, so they share one implementation — the second copy is
 * where the two would drift on the next change.
 */
function CeilingFacet({
  title,
  param,
  options,
  current,
  onPick,
}: {
  title: string;
  param: string;
  options: Ceiling[];
  current: string | null;
  onPick: (param: string, value: string | null) => void;
}) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-ink">{title}</h3>
      <ul className="space-y-1.5">
        {options.map((option) => {
          const id = `${param}-${option.value ?? "any"}`;
          return (
            <li key={id} className="flex items-center gap-2">
              <input
                type="radio"
                id={id}
                name={param}
                checked={current === option.value}
                onChange={() => onPick(param, option.value)}
                className="size-4 border-line accent-[var(--signal-text)]"
              />
              <Label htmlFor={id} className="cursor-pointer font-normal text-ink-muted">
                {option.label}
              </Label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const FilterCard = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const toggle = useFacetToggle();
  const hasFilters = FILTER_PARAMS.some((p) => searchParams.get(p) !== null);

  /**
   * Writes a single-value param, or removes it when the value is null.
   *
   * A filter change resets `page`: the result set is different, so page 5 of the
   * old set is meaningless in the new one — the same reason `useFacetToggle`
   * drops it.
   */
  const setSingle = (key: string, value: string | null) => {
    const sp = new URLSearchParams(searchParams);
    if (value === null) {
      sp.delete(key);
    } else {
      sp.set(key, value);
    }
    sp.delete("page");
    setSearchParams(sp);
  };

  const clearAll = () => {
    const sp = new URLSearchParams(searchParams);
    for (const p of FILTER_PARAMS) sp.delete(p);
    sp.delete("page");
    // `keyword` deliberately survives: it came from the hero search or a shared
    // link, and clearing the filters is not asking to abandon the search.
    setSearchParams(sp);
  };

  return (
    <div className="w-full rounded-surface border border-line bg-paper-raised p-(--space-card)">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">Filters</h2>
        {hasFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="text-xs font-medium text-ink-muted underline hover:text-ink"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="space-y-5 border-t border-line pt-4">
        {FACETS.map((facet) => (
          <section key={facet.key}>
            <h3 className="mb-2 text-sm font-semibold text-ink">{facet.label}</h3>
            <ul className="space-y-1.5">
              {facet.options.map((option) => {
                const id = `${facet.key}-${option.replace(/\s+/g, "-").toLowerCase()}`;
                return (
                  <li key={option} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={id}
                      checked={isChecked(searchParams, facet.key, option)}
                      onChange={() => toggle(facet.key, option)}
                      className="size-4 rounded border-line accent-[var(--signal-text)]"
                    />
                    <Label htmlFor={id} className="cursor-pointer font-normal text-ink-muted">
                      {option}
                    </Label>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {/*
          Salary and experience were in `clearAll` and in the has-filters check
          from 4B onward, but no control ever rendered for either — so "Clear
          all" could appear for a filter the rail gave no way to set, and two
          backend facets were unreachable from the UI.

          Radios rather than checkboxes: these are ceilings, and two ceilings at
          once has no meaning.
        */}
        <CeilingFacet
          title="Salary"
          param="salaryMax"
          options={SALARY_CEILINGS}
          current={searchParams.get("salaryMax")}
          onPick={setSingle}
        />
        <CeilingFacet
          title="Experience"
          param="experienceMax"
          options={EXPERIENCE_CEILINGS}
          current={searchParams.get("experienceMax")}
          onPick={setSingle}
        />

        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">Ways of working</h3>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="remote"
              checked={searchParams.get("remote") === "true"}
              onChange={(e) => setSingle("remote", e.target.checked ? "true" : null)}
              className="size-4 rounded border-line accent-[var(--signal-text)]"
            />
            <Label htmlFor="remote" className="cursor-pointer font-normal text-ink-muted">
              Remote only
            </Label>
          </div>
        </section>
      </div>
    </div>
  );
};

export default FilterCard;
