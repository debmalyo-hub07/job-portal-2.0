import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Switch } from "@/components/ui/switch";

describe("the Switch primitive", () => {
  it("renders a real switch with its checked state", () => {
    render(<Switch checked aria-label="Automation" />);
    const toggle = screen.getByRole("switch", { name: "Automation" });
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("fires onCheckedChange when clicked, and never when disabled", async () => {
    const onCheckedChange = vi.fn();
    const { rerender } = render(
      <Switch checked={false} onCheckedChange={onCheckedChange} aria-label="Automation" />,
    );

    await userEvent.click(screen.getByRole("switch", { name: "Automation" }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);

    rerender(
      <Switch checked={false} onCheckedChange={onCheckedChange} disabled aria-label="Automation" />,
    );
    await userEvent.click(screen.getByRole("switch", { name: "Automation" }));
    expect(onCheckedChange).toHaveBeenCalledTimes(1);
  });
});
