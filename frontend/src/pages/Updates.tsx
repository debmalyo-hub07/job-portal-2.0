import {
  ArrowUpRight,
  Check,
  CircleDot,
  Filter,
  Paintbrush,
  SearchCheck,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Link, useSearchParams } from "react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import PageShell from "@/components/layout/PageShell";
import { PLATFORM_UPDATES, UPDATE_KINDS, type UpdateKind } from "@/data/updates";
import { Reveal } from "@/lib/motion";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const KIND_META: Record<Exclude<UpdateKind, "All">, { icon: typeof Sparkles; label: string }> = {
  Feature: { icon: Sparkles, label: "New feature" },
  Improvement: { icon: Paintbrush, label: "Improvement" },
  Fix: { icon: CircleDot, label: "Fix" },
  Trust: { icon: ShieldCheck, label: "Trust & safety" },
};

function updateDate(value: string): string {
  return dateFormatter.format(new Date(`${value}T00:00:00Z`));
}

export default function Updates() {
  const [searchParams] = useSearchParams();
  const rawKind = searchParams.get("kind");
  const kind: UpdateKind = UPDATE_KINDS.includes(rawKind as UpdateKind)
    ? (rawKind as UpdateKind)
    : "All";
  const updates =
    kind === "All" ? PLATFORM_UPDATES : PLATFORM_UPDATES.filter((item) => item.kind === kind);
  const featured = updates[0];

  return (
    <PageShell width="wide" motion="standard">
      <header className="grid gap-8 border-b border-line pb-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase text-signal-text">Product updates</p>
          <h1 className="mt-3 max-w-4xl font-display text-display-lg font-semibold leading-[0.95] text-balance text-ink">
            The product, in motion.
          </h1>
        </div>
        <p className="max-w-md border-l border-line pl-5 text-sm leading-7 text-ink-muted">
          A running record of what changed, why it matters, and where Cairn is heading next. New entries are written for people using the platform, not just the people who shipped it.
        </p>
      </header>

      <section className="mt-10 border-y border-line bg-paper-sunken px-5 py-5 sm:px-7" aria-labelledby="updates-latest">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-signal-text">
            <Check aria-hidden="true" className="size-4" />
            Shipped and available
          </div>
          {featured ? (
            <time className="font-mono text-xs text-ink-muted" dateTime={featured.date}>
              {updateDate(featured.date)}
            </time>
          ) : null}
        </div>
        <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <h2 id="updates-latest" className="max-w-3xl font-display text-3xl font-semibold text-balance text-ink sm:text-4xl">
              {featured?.title ?? "Updates are on the way"}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-muted">
              {featured?.summary ?? "There are no updates in this category yet. Check back soon."}
            </p>
          </div>
          <Link to="/contact" className="inline-flex items-center gap-2 text-sm font-semibold text-ink hover:text-signal-text">
            Share feedback
            <ArrowUpRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
      </section>

      <div className="mt-10 grid gap-10 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-16">
        <aside className="min-w-0 self-start lg:sticky lg:top-28">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-ink-muted">
            <Filter aria-hidden="true" className="size-4" />
            Filter updates
          </div>
          <nav aria-label="Update categories" className="mt-4 flex flex-wrap gap-2 pb-1 lg:flex-col lg:flex-nowrap lg:gap-1">
            {UPDATE_KINDS.map((option) => {
              const active = option === kind;
              const href = option === "All" ? "/updates" : `/updates?kind=${encodeURIComponent(option)}`;
              return (
                <Link
                  key={option}
                  to={href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-sharp border px-3 py-2 text-sm whitespace-nowrap transition-[background-color,border-color,color] duration-(--dur-fast) ${
                    active
                      ? "border-line-strong bg-paper-raised font-semibold text-ink shadow-[var(--elevate-1)]"
                      : "border-transparent text-ink-muted hover:border-line hover:bg-paper-raised hover:text-ink"
                  }`}
                >
                  {option === "All" ? "All updates" : KIND_META[option].label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0" aria-label="Update archive">
          <div className="mb-4 flex items-center justify-between border-b border-line pb-3 text-sm text-ink-muted">
            <span>{updates.length} {updates.length === 1 ? "update" : "updates"}</span>
            <span className="font-mono text-xs">Newest first</span>
          </div>
          <div className="divide-y divide-line border-y border-line">
            {updates.map((update, index) => {
              const meta = KIND_META[update.kind];
              const Icon = meta.icon;
              return (
                <Reveal key={update.id} delay={index * 0.04}>
                  <article className="grid gap-5 py-8 md:grid-cols-[8rem_minmax(0,1fr)] md:gap-8">
                    <div>
                      <time className="font-mono text-xs text-ink-muted" dateTime={update.date}>
                        {updateDate(update.date)}
                      </time>
                      <Badge variant="outline" className="mt-3">
                        <Icon aria-hidden="true" />
                        {meta.label}
                      </Badge>
                    </div>
                    <div>
                      <h2 className="font-display text-2xl font-semibold text-balance text-ink sm:text-3xl">
                        {update.title}
                      </h2>
                      <p className="mt-3 max-w-3xl text-sm leading-7 text-ink-muted">{update.summary}</p>
                      <ul className="mt-5 grid gap-2 text-sm text-ink-muted sm:grid-cols-2">
                        {update.details.map((detail) => (
                          <li key={detail} className="flex gap-2 leading-6">
                            <Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-signal-text" />
                            <span>{detail}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </article>
                </Reveal>
              );
            })}
          </div>

          {updates.length === 0 ? (
            <div className="border-y border-line py-12">
              <SearchCheck aria-hidden="true" className="size-6 text-signal-text" />
              <h2 className="mt-4 font-display text-2xl font-semibold text-ink">No updates in this category yet</h2>
              <p className="mt-2 max-w-xl text-sm leading-7 text-ink-muted">Try another filter or return to the full archive.</p>
              <Button asChild variant="outline" className="mt-5">
                <Link to="/updates">View all updates</Link>
              </Button>
            </div>
          ) : null}
        </main>
      </div>
    </PageShell>
  );
}
