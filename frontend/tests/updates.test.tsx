import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

import { PLATFORM_UPDATES } from "@/data/updates";
import { renderAppAt } from "./helpers/renderRoute";

/**
 * Every assertion here derives from the registry rather than quoting today's
 * copy.
 *
 * The page is content that changes on every release, and a test that named a
 * particular headline would fail on the next one — which is worse than useless,
 * because the cheapest way to keep it green is to leave the release unpublished.
 * `kind=Fix` was exactly that: the empty-state assertion depended on the Fix
 * category holding nothing, so publishing the first fix broke a test. That case
 * now lives in `updatesEmptyState.test.tsx` against a mocked-empty registry.
 */
const TRUST = PLATFORM_UPDATES.filter((update) => update.kind === "Trust");

describe("product updates", () => {
  it("keeps the publishing registry uniquely identified and newest first", () => {
    const ids = PLATFORM_UPDATES.map((update) => update.id);
    const dates = PLATFORM_UPDATES.map((update) => update.date);

    expect(new Set(ids).size).toBe(ids.length);
    expect(dates).toEqual([...dates].sort((a, b) => b.localeCompare(a)));
    expect(dates.every((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))).toBe(true);
  });

  it("publishes nothing dated in the future", () => {
    // The hero labels the newest entry "Shipped and available". A mistyped year
    // sorts to the top and makes that label a promise instead of a record —
    // and it would sit there until the date arrived.
    const today = new Date().toISOString().slice(0, 10);
    expect(PLATFORM_UPDATES.filter((update) => update.date > today)).toEqual([]);
  });

  it("filters the archive through a shareable category URL", async () => {
    renderAppAt("/updates?kind=Trust");

    const counter = TRUST.length === 1 ? "1 update" : `${TRUST.length} updates`;
    expect(await screen.findByText(counter)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Trust & safety" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    // The hero republishes the newest entry *in the filtered category*, so its
    // heading renders twice. Asserting the count is what proves the hero follows
    // the filter rather than always showing the registry's first row.
    expect(screen.getAllByRole("heading", { name: TRUST[0].title })).toHaveLength(2);

    // And nothing from another category survives the filter.
    const others = PLATFORM_UPDATES.filter((update) => update.kind !== "Trust");
    expect(others.length).toBeGreaterThan(0);
    for (const update of others) {
      expect(screen.queryByRole("heading", { name: update.title })).not.toBeInTheDocument();
    }
  });
});
