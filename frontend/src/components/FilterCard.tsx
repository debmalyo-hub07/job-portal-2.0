import { SlidersHorizontal, X } from "lucide-react";
import { useSearchParams } from "react-router";
import { JOB_DEPARTMENTS, JOB_TYPES } from "@jobportal/shared";

import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { useFacetToggle } from "@/hooks/useJobSearch";
import { cn } from "@/lib/utils";

const LOCATIONS = ["Delhi NCR", "Mumbai", "Bengaluru", "Hyderabad", "Chennai", "Pune", "Kolkata", "Remote"];
// The backend matches this facet against the company name exactly (anchored,
// case-insensitive), so every entry has to be a real employer name rather than
// a familiar short form — "TCS" matched nothing at all.
const COMPANIES = ["Amazon", "Flipkart", "Meta", "IBM", "Microsoft", "Tata Consultancy Services", "Cognizant", "Accenture", "Infosys"];

const FACETS: { label: string; key: "location" | "jobType" | "department"; options: string[] }[] = [
  { label: "Location", key: "location", options: LOCATIONS },
  { label: "Job type", key: "jobType", options: [...JOB_TYPES] },
  { label: "Department", key: "department", options: [...JOB_DEPARTMENTS] },
];

// An explicit "Any" is how a ceiling gets unset. Click-to-unset on a radio
// cannot be reached from the keyboard, and without either one the only way back
// from "Up to Rs 5L" is Clear all, which discards every other facet too.
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

const FILTER_PARAMS = ["location", "jobType", "department", "company", "salaryMax", "experienceMax", "remote"] as const;

function isChecked(sp: URLSearchParams, key: "location" | "jobType" | "department" | "company", value: string): boolean {
  return (sp.get(key) ?? "").split(",").map((item) => item.trim()).includes(value);
}

function CeilingFacet({ title, param, options, current, onPick, idPrefix }: { title: string; param: string; options: Ceiling[]; current: string | null; onPick: (param: string, value: string | null) => void; idPrefix: string }) {
  return (
    <fieldset className="border-t border-line pt-5">
      <legend className="mb-3 text-sm font-semibold text-ink">{title}</legend>
      <RadioGroup name={`${idPrefix}-${param}`} value={current ?? "any"} onValueChange={(value) => onPick(param, value === "any" ? null : value)} className="gap-1.5">
        {options.map((option) => {
          const value = option.value ?? "any";
          const id = `${idPrefix}-${param}-${value}`;
          return <Label key={id} htmlFor={id} className="flex min-h-9 cursor-pointer items-center gap-3 rounded-sharp px-2 py-1.5 font-normal text-ink-muted hover:bg-paper-sunken hover:text-ink"><RadioGroupItem id={id} value={value} />{option.label}</Label>;
        })}
      </RadioGroup>
    </fieldset>
  );
}

const FilterCard = ({ idPrefix = "filter", embedded = false, className }: { idPrefix?: string; embedded?: boolean; className?: string }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const toggle = useFacetToggle();
  const hasFilters = FILTER_PARAMS.some((param) => searchParams.get(param) !== null);

  const setSingle = (key: string, value: string | null) => {
    const sp = new URLSearchParams(searchParams);
    if (value === null) sp.delete(key); else sp.set(key, value);
    sp.delete("page"); setSearchParams(sp);
  };
  const clearAll = () => {
    const sp = new URLSearchParams(searchParams);
    for (const param of FILTER_PARAMS) sp.delete(param);
    sp.delete("page"); setSearchParams(sp);
  };

  const facetGroup = (label: string, key: "location" | "jobType" | "department" | "company", options: string[]) => (
    <fieldset key={key}>
      <legend className="mb-3 text-sm font-semibold text-ink">{label}</legend>
      <div className="grid gap-1.5">
        {options.map((option) => {
          const id = `${idPrefix}-${key}-${option.replace(/\s+/g, "-").toLowerCase()}`;
          return <Label key={option} htmlFor={id} className="flex min-h-9 cursor-pointer items-center gap-3 rounded-sharp px-2 py-1.5 font-normal text-ink-muted hover:bg-paper-sunken hover:text-ink"><input type="checkbox" id={id} checked={isChecked(searchParams, key, option)} onChange={() => toggle(key, option)} className="size-4 rounded accent-[var(--signal-text)]" />{option}</Label>;
        })}
      </div>
    </fieldset>
  );

  return <aside className={cn("w-full", embedded ? "bg-transparent" : "rounded-surface border border-line bg-paper-raised shadow-[var(--elevate-1)] lg:flex lg:max-h-[calc(100dvh-7.5rem)] lg:flex-col lg:overflow-hidden", className)}>
    <div className={cn("flex shrink-0 items-center justify-between gap-3", embedded ? "pb-3" : "px-4 pt-4 pb-4")}>
      {embedded ? <span /> : <h2 className="flex items-center gap-2 text-sm font-semibold text-ink"><SlidersHorizontal aria-hidden="true" className="size-4" />Refine results</h2>}
      {hasFilters ? <Button type="button" variant="ghost" size="sm" onClick={clearAll}><X data-icon="inline-start" />Clear all</Button> : null}
    </div>
    <div className={cn("grid gap-5 border-t border-line pt-5", !embedded && "px-4 pb-5 lg:min-h-0 lg:overflow-y-auto lg:[scrollbar-gutter:stable]")}>
      {facetGroup("Location", "location", LOCATIONS)}
      {facetGroup("Job type", "jobType", [...JOB_TYPES])}
      {facetGroup("Department", "department", [...JOB_DEPARTMENTS])}
      {facetGroup("Company", "company", COMPANIES)}
      <CeilingFacet title="Salary" param="salaryMax" options={SALARY_CEILINGS} current={searchParams.get("salaryMax")} onPick={setSingle} idPrefix={idPrefix} />
      <CeilingFacet title="Experience" param="experienceMax" options={EXPERIENCE_CEILINGS} current={searchParams.get("experienceMax")} onPick={setSingle} idPrefix={idPrefix} />
      <fieldset className="border-t border-line pt-5"><legend className="mb-3 text-sm font-semibold text-ink">Ways of working</legend><Label htmlFor={`${idPrefix}-remote`} className="flex min-h-9 cursor-pointer items-center gap-3 rounded-sharp px-2 py-1.5 font-normal text-ink-muted hover:bg-paper-sunken hover:text-ink"><input type="checkbox" id={`${idPrefix}-remote`} checked={searchParams.get("remote") === "true"} onChange={(event) => setSingle("remote", event.target.checked ? "true" : null)} className="size-4 rounded accent-[var(--signal-text)]" />Remote only</Label></fieldset>
    </div>
  </aside>;
};

export default FilterCard;
