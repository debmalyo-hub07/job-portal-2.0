import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Building2, Layers3, MapPin, Search, Sparkles, X } from "lucide-react";

import { JOB_SEARCH_SUGGESTIONS, type JobSearchSuggestion } from "@/data/jobSearchSuggestions";
import { cn } from "@/lib/utils";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";

type JobSearchComboboxProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  id: string;
  label: string;
  tone?: "hero" | "board";
};

export function JobSearchCombobox({ value, onChange, onSubmit, id, label, tone = "board" }: JobSearchComboboxProps) {
  const listboxId = useId();
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const normalized = value.trim().toLocaleLowerCase();
  const matches = useMemo(() => {
    const pool = normalized
      ? JOB_SEARCH_SUGGESTIONS.filter((item) => `${item.label} ${item.group} ${item.hint}`.toLocaleLowerCase().includes(normalized))
      : JOB_SEARCH_SUGGESTIONS.filter((item) => ["Software Development Engineer", "Amazon", "Bengaluru", "Data & AI", "Product Manager", "Microsoft"].includes(item.label));
    return pool.slice(0, 6);
  }, [normalized]);

  useEffect(() => setActiveIndex(-1), [value]);

  const choose = (item: JobSearchSuggestion) => {
    onChange(item.label);
    setOpen(false);
    onSubmit(item.label);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(current + 1, matches.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Escape") {
      setOpen(false);
    } else if (event.key === "Enter" && open && activeIndex >= 0) {
      event.preventDefault();
      choose(matches[activeIndex]);
    }
  };

  return (
    <Popover open={open && matches.length > 0} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div ref={anchorRef} className="relative min-w-0 flex-1">
          <label htmlFor={id} className="sr-only">{label}</label>
          <Search aria-hidden="true" className={cn("absolute top-1/2 left-3.5 z-10 size-4 -translate-y-1/2", tone === "hero" ? "text-media-surface-ink/55" : "text-ink-muted")} />
          <input
            id={id}
            type="search"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
            autoComplete="off"
            value={value}
            onChange={(event) => { onChange(event.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Role, company, skill, or location"
            className={cn("h-12 w-full appearance-none border-0 bg-transparent pr-11 pl-10 text-base outline-none", tone === "hero" ? "text-media-surface-ink placeholder:text-media-surface-ink/55" : "text-ink placeholder:text-ink-muted")}
          />
          {value ? (
            <button type="button" aria-label="Clear search" onClick={() => { onChange(""); setOpen(true); }} className={cn("absolute top-1/2 right-3 z-10 -translate-y-1/2 rounded-sharp p-1 transition-colors", tone === "hero" ? "text-media-surface-ink/60 hover:bg-media-surface-ink/10 hover:text-media-surface-ink" : "text-ink-muted hover:bg-paper-sunken hover:text-ink")}>
              <X aria-hidden="true" className="size-4" />
            </button>
          ) : null}
        </div>
      </PopoverAnchor>
      <PopoverContent
        id={listboxId}
        role="listbox"
        aria-label="Search suggestions"
        align="start"
        sideOffset={8}
        collisionPadding={16}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          // The list is opened by focusing the input, and the input is a
          // PopoverAnchor rather than a PopoverTrigger. Radix only exempts
          // `triggerRef` from its outside-interaction check, so with no trigger
          // registered nothing here is ever "inside": the dismissable layer
          // mounts while the opening `focusin` is still travelling to document,
          // receives that same event, reads the input as outside, and closes
          // again — the list flashed on and off on every click. Exempting the
          // anchor restores the guard Radix would have applied itself.
          if (anchorRef.current?.contains(event.target as Node)) event.preventDefault();
        }}
        className={cn(
          "max-h-[min(20rem,var(--radix-popover-content-available-height))] overflow-y-auto p-2",
          tone === "hero"
            ? "w-[min(42rem,calc(100vw-2rem))] bg-overlay/98 sm:-translate-y-1"
            : "w-[min(36rem,calc(100vw-2rem))]",
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-2.5 py-2">
          <span className="flex items-center gap-2 text-xs font-semibold uppercase text-signal-text"><Sparkles aria-hidden="true" className="size-3.5" />{normalized ? "Best matches" : "Popular searches"}</span>
          <span className="hidden text-xs text-ink-muted sm:inline">Use ↑ ↓ to explore</span>
        </div>
        <div className="grid grid-cols-2 gap-1 pt-2">
          {matches.map((item, index) => {
            const Icon = item.group === "Companies" ? Building2 : item.group === "Locations" ? MapPin : item.group === "Departments" ? Layers3 : Search;
            return (
              <button key={`${item.group}-${item.label}`} id={`${listboxId}-${index}`} role="option" aria-selected={index === activeIndex} type="button" onPointerEnter={() => setActiveIndex(index)} onClick={() => choose(item)} className={cn("flex min-w-0 items-center gap-3 rounded-sharp px-3 py-2.5 text-left transition-colors", index === activeIndex ? "bg-signal-muted" : "hover:bg-paper-sunken")}>
                <span className="grid size-8 shrink-0 place-items-center rounded-sharp bg-paper-sunken"><Icon aria-hidden="true" className="size-4 text-signal-text" /></span>
                <span className="min-w-0"><span className="block truncate text-sm font-semibold text-ink">{item.label}</span><span className="block truncate text-xs text-ink-muted">{item.group}</span></span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
