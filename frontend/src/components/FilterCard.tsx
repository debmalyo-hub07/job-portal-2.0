import { SlidersHorizontal, X } from "lucide-react";
import { useSearchParams } from "react-router";
import { JOB_TYPES } from "@jobportal/shared";

import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { useFacetToggle } from "@/hooks/useJobSearch";
import { cn } from "@/lib/utils";

const FACETS: { label: string; key: "location" | "jobType"; options: string[] }[] = [
  {
    label: "Location",
    key: "location",
    options: ["Delhi NCR", "Mumbai", "Bengaluru", "Hyderabad", "Chennai", "Pune"],
  },
  { label: "Job type", key: "jobType", options: [...JOB_TYPES] },
];

type Ceiling = { value: string | null; label: string };

const SALARY_CEILINGS: Ceiling[] = [
  { value: null, label: "Any salary" },
  { value: "5", label: "Up to \u20B95L" },
  { value: "10", label: "Up to \u20B910L" },
  { value: "20", label: "Up to \u20B920L" },
  { value: "40", label: "Up to \u20B940L" },
];

const EXPERIENCE_CEILINGS: Ceiling[] = [
  { value: null, label: "Any experience" },
  { value: "0", label: "No experience needed" },
  { value: "2", label: "Up to 2 years" },
  { value: "5", label: "Up to 5 years" },
  { value: "10", label: "Up to 10 years" },
];

const FILTER_PARAMS = ["location", "jobType", "salaryMax", "experienceMax", "remote"] as const;

function isChecked(sp: URLSearchParams, key: "location" | "jobType", value: string): boolean {
  return (sp.get(key) ?? "").split(",").map((item) => item.trim()).includes(value);
}

function CeilingFacet({
  title,
  param,
  options,
  current,
  onPick,
  idPrefix,
}: {
  title: string;
  param: string;
  options: Ceiling[];
  current: string | null;
  onPick: (param: string, value: string | null) => void;
  idPrefix: string;
}) {
  return (
    <fieldset className="border-t border-line pt-5">
      <legend className="mb-3 text-sm font-semibold text-ink">{title}</legend>
      <RadioGroup
        name={`${idPrefix}-${param}`}
        value={current ?? "any"}
        onValueChange={(value) => onPick(param, value === "any" ? null : value)}
        className="gap-1.5"
      >
        {options.map((option) => {
          const value = option.value ?? "any";
          const id = `${idPrefix}-${param}-${value}`;
          return (
            <Label
              key={id}
              htmlFor={id}
              className="flex min-h-9 cursor-pointer items-center gap-3 rounded-sharp px-2 py-1.5 font-normal text-ink-muted hover:bg-paper-sunken hover:text-ink"
            >
              <RadioGroupItem
                id={id}
                value={value}
              />
              {option.label}
            </Label>
          );
        })}
      </RadioGroup>
    </fieldset>
  );
}

const FilterCard = ({
  idPrefix = "filter",
  embedded = false,
  className,
}: {
  idPrefix?: string;
  embedded?: boolean;
  className?: string;
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const toggle = useFacetToggle();
  const hasFilters = FILTER_PARAMS.some((param) => searchParams.get(param) !== null);

  const setSingle = (key: string, value: string | null) => {
    const sp = new URLSearchParams(searchParams);
    if (value === null) sp.delete(key);
    else sp.set(key, value);
    sp.delete("page");
    setSearchParams(sp);
  };

  const clearAll = () => {
    const sp = new URLSearchParams(searchParams);
    for (const param of FILTER_PARAMS) sp.delete(param);
    sp.delete("page");
    setSearchParams(sp);
  };

  return (
    <aside
      className={cn(
        "w-full",
        embedded
          ? "bg-transparent"
          : "rounded-surface border border-line bg-paper-raised p-4 shadow-sm md:sticky md:top-24",
        className,
      )}
    >
      <div className={cn("flex items-center justify-between gap-3", embedded ? "pb-3" : "pb-4")}>
        {embedded ? <span /> : (
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <SlidersHorizontal aria-hidden="true" className="size-4" />
            Refine results
          </h2>
        )}
        {hasFilters ? (
          <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
            <X data-icon="inline-start" />
            Clear all
          </Button>
        ) : null}
      </div>

      <div className="grid gap-5 border-t border-line pt-5">
        {FACETS.map((facet) => (
          <fieldset key={facet.key}>
            <legend className="mb-3 text-sm font-semibold text-ink">{facet.label}</legend>
            <div className="grid gap-1.5">
              {facet.options.map((option) => {
                const id = `${idPrefix}-${facet.key}-${option.replace(/\s+/g, "-").toLowerCase()}`;
                return (
                  <Label
                    key={option}
                    htmlFor={id}
                    className="flex min-h-9 cursor-pointer items-center gap-3 rounded-sharp px-2 py-1.5 font-normal text-ink-muted hover:bg-paper-sunken hover:text-ink"
                  >
                    <input
                      type="checkbox"
                      id={id}
                      checked={isChecked(searchParams, facet.key, option)}
                      onChange={() => toggle(facet.key, option)}
                      className="size-4 rounded accent-[var(--signal-text)]"
                    />
                    {option}
                  </Label>
                );
              })}
            </div>
          </fieldset>
        ))}

        <CeilingFacet
          title="Salary"
          param="salaryMax"
          options={SALARY_CEILINGS}
          current={searchParams.get("salaryMax")}
          onPick={setSingle}
          idPrefix={idPrefix}
        />
        <CeilingFacet
          title="Experience"
          param="experienceMax"
          options={EXPERIENCE_CEILINGS}
          current={searchParams.get("experienceMax")}
          onPick={setSingle}
          idPrefix={idPrefix}
        />

        <fieldset className="border-t border-line pt-5">
          <legend className="mb-3 text-sm font-semibold text-ink">Ways of working</legend>
          <Label htmlFor={`${idPrefix}-remote`} className="flex min-h-9 cursor-pointer items-center gap-3 rounded-sharp px-2 py-1.5 font-normal text-ink-muted hover:bg-paper-sunken hover:text-ink">
            <input
              type="checkbox"
              id={`${idPrefix}-remote`}
              checked={searchParams.get("remote") === "true"}
              onChange={(event) => setSingle("remote", event.target.checked ? "true" : null)}
              className="size-4 rounded accent-[var(--signal-text)]"
            />
            Remote only
          </Label>
        </fieldset>
      </div>
    </aside>
  );
};

export default FilterCard;
