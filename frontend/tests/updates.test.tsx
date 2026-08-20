import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

import { PLATFORM_UPDATES } from "@/data/updates";
import { renderAppAt } from "./helpers/renderRoute";

describe("product updates", () => {
  it("keeps the publishing registry uniquely identified and newest first", () => {
    const ids = PLATFORM_UPDATES.map((update) => update.id);
    const dates = PLATFORM_UPDATES.map((update) => update.date);

    expect(new Set(ids).size).toBe(ids.length);
    expect(dates).toEqual([...dates].sort((a, b) => b.localeCompare(a)));
    expect(dates.every((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))).toBe(true);
  });

  it("filters the archive through a shareable category URL", async () => {
    renderAppAt("/updates?kind=Trust");

    expect(await screen.findByText("2 updates")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Trust & safety" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getAllByRole("heading", { name: /sessions stay separate/i })).toHaveLength(2);
    expect(screen.queryByRole("heading", { name: /job searches can be shared/i })).not.toBeInTheDocument();
  });

  it("renders an honest empty state for a category with no entries", async () => {
    renderAppAt("/updates?kind=Fix");

    expect(await screen.findByRole("heading", { name: /no updates in this category yet/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view all updates/i })).toHaveAttribute("href", "/updates");
  });
});
