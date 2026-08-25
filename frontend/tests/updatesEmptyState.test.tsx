import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

import { renderAppAt } from "./helpers/renderRoute";

/**
 * The archive's empty state, tested against an empty registry rather than an
 * empty category.
 *
 * A visitor reaches it by filtering to a category nothing has been published
 * under yet, so the branch is real — but anchoring the test to whichever
 * category happens to be empty makes the changelog's content answerable to the
 * test suite: the first entry published under that category breaks it, and the
 * quiet fix is to file the entry under something else. Emptying the registry
 * covers the same branch and can never be steered by what ships.
 *
 * `UPDATE_KINDS` comes through untouched, because the filter rail renders from
 * it and the page falls back to "All" for anything not in it.
 */
vi.mock("@/data/updates", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/updates")>()),
  PLATFORM_UPDATES: [],
}));

describe("the product updates archive with nothing published", () => {
  it("renders an honest empty state rather than a bare page", async () => {
    renderAppAt("/updates?kind=Fix");

    expect(
      await screen.findByRole("heading", { name: /no updates in this category yet/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view all updates/i })).toHaveAttribute(
      "href",
      "/updates",
    );
    expect(screen.getByText("0 updates")).toBeInTheDocument();
  });

  it("declines to headline a release it does not have", async () => {
    // The hero reads `updates[0]`. Without a fallback it would render an empty
    // headline under "Shipped and available" — a heading that says nothing, in a
    // slot that claims something shipped.
    renderAppAt("/updates");

    expect(await screen.findByRole("heading", { name: /updates are on the way/i })).toBeInTheDocument();
  });
});
