import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AnimatedNumber } from "@/lib/numberFlow";

/**
 * The search + pagination furniture every paginated list needs.
 *
 * Extracted because the two moderation lists are the same screen with different
 * columns, and a second hand-written copy is how the jobs list keeps a bug the
 * companies list already fixed. It sits in `layout/` rather than `console/`
 * because 2B-2 wired `Pager` to the seeker job board as well — the seeker list
 * requested `limit=50` and showed that, which is the pagination gap the docs
 * recorded. A page-count control is layout, not an admin concept.
 */
export function ListControls({
  label,
  keyword,
  onKeyword,
  children,
}: {
  label: string;
  keyword: string;
  onKeyword: (next: string) => void;
  children?: ReactNode;
}) {
  return (
    <div className="mb-(--space-card) flex flex-wrap items-end justify-between gap-4">
      <div className="w-full max-w-sm space-y-2">
        <Label htmlFor="list-search">{label}</Label>
        <Input
          id="list-search"
          type="search"
          value={keyword}
          onChange={(e) => onKeyword(e.target.value)}
          placeholder="Search by name or location"
        />
      </div>
      {children}
    </div>
  );
}

/**
 * Page N of M, with the primitive that shipped in 2A and had never been wired
 * to a list. Rendered only when there is more than one page — a lone "1 of 1"
 * is furniture that tells the user nothing.
 *
 * The total animates. It is the one number in the application that changes in
 * direct response to something the user just did — typing a keyword, setting a
 * facet — so watching it move is feedback about whether the filter did anything,
 * not decoration. Tier 3, which is why it runs on the workspace's `response`
 * tier too: the two moderation lists and the seeker board all read this.
 */
export function Pager({
  page,
  pages,
  total,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  onPage: (next: number) => void;
}) {
  if (pages <= 1) {
    return (
      <p className="text-sm text-ink-muted">
        <AnimatedNumber value={total} /> {total === 1 ? "result" : "results"}
      </p>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <p className="text-sm text-ink-muted">
        Page <span className="font-mono">{page}</span> of{" "}
        <span className="font-mono">{pages}</span> · <AnimatedNumber value={total} /> results
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
