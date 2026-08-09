import { useSearchParams } from "react-router";

import { useFacetToggle } from "@/hooks/useJobSearch";

/**
 * 4B filter rail. The URLSearchParams is the state; this component reads the
 * current selection for its checkboxes and calls `useFacetToggle` to write.
 *
 * Multi-select with OR-within-facet semantics: two Locations checked → jobs in
 * either city. Facets AND across groups: Location AND JobType both must match.
 *
 * The taxonomy is seeded from the recruiting shapes recruiters actually post
 * (city, contract-level). Salary bands translate to a `salaryMax` ceiling the
 * backend range-matches on.
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
    options: ["Full-time", "Contract", "Internship", "Part-time"],
  },
];

function isChecked(sp: URLSearchParams, key: "location" | "jobType", value: string): boolean {
  const raw = sp.get(key) ?? "";
  return raw.split(",").map((s) => s.trim()).includes(value);
}

const FilterCard = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const toggle = useFacetToggle();
  const hasFilters =
    searchParams.get("location") !== null ||
    searchParams.get("jobType") !== null ||
    searchParams.get("salaryMax") !== null ||
    searchParams.get("experienceMax") !== null ||
    searchParams.get("remote") !== null;

  const clearAll = () => {
    const sp = new URLSearchParams(searchParams);
    sp.delete("location");
    sp.delete("jobType");
    sp.delete("salaryMax");
    sp.delete("experienceMax");
    sp.delete("remote");
    sp.delete("page");
    setSearchParams(sp, { replace: false });
  };

  return (
    <div className="w-full bg-paper-raised p-4 rounded-md shadow-sm border border-line">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-lg">Filter Jobs</h2>
        {hasFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="text-xs font-medium text-ink-muted hover:text-ink underline"
          >
            Clear all
          </button>
        )}
      </div>
      <hr className="mb-4 border-line" />
      <div className="space-y-5">
        {FACETS.map((facet) => (
          <section key={facet.key}>
            <h3 className="font-semibold text-sm text-ink mb-2">{facet.label}</h3>
            <ul className="space-y-1.5">
              {facet.options.map((option) => {
                const id = `${facet.key}-${option.replace(/\s+/g, "-").toLowerCase()}`;
                const checked = isChecked(searchParams, facet.key, option);
                return (
                  <li key={option} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={id}
                      checked={checked}
                      onChange={() => toggle(facet.key, option)}
                      className="h-4 w-4 rounded border-line accent-[var(--signal-text)]"
                    />
                    <label
                      htmlFor={id}
                      className="text-sm text-ink-muted select-none cursor-pointer"
                    >
                      {option}
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
};

export default FilterCard;
