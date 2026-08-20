import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

function renderToggle() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

afterEach(() => {
  localStorage.removeItem("theme");
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.remove());
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.style.removeProperty("color-scheme");
});

describe("ThemeToggle", () => {
  it("shows the system state and describes the next theme", async () => {
    localStorage.setItem("theme", "system");
    const { container } = renderToggle();

    const toggle = await screen.findByRole("button", { name: "Switch to dark theme" });
    expect(toggle).toHaveAttribute("title", "Switch to dark theme");
    expect(container.querySelector(".lucide-monitor")).toBeInTheDocument();
  });

  it("cycles System to Dark to Light and back to System", async () => {
    const lightMeta = document.createElement("meta");
    lightMeta.dataset.themeColor = "light";
    lightMeta.setAttribute("media", "(prefers-color-scheme: light)");
    const darkMeta = document.createElement("meta");
    darkMeta.dataset.themeColor = "dark";
    darkMeta.setAttribute("media", "(prefers-color-scheme: dark)");
    document.head.append(lightMeta, darkMeta);
    localStorage.setItem("theme", "system");
    const user = userEvent.setup();
    const { container } = renderToggle();

    await user.click(await screen.findByRole("button", { name: "Switch to dark theme" }));
    expect(screen.getByRole("button", { name: "Switch to light theme" })).toBeInTheDocument();
    expect(container.querySelector(".lucide-sun")).toBeInTheDocument();
    expect(darkMeta).not.toHaveAttribute("media");
    expect(lightMeta).toHaveAttribute("media", "not all");

    await user.click(screen.getByRole("button", { name: "Switch to light theme" }));
    expect(screen.getByRole("button", { name: "Switch to system preference" })).toBeInTheDocument();
    expect(container.querySelector(".lucide-moon")).toBeInTheDocument();
    expect(lightMeta).not.toHaveAttribute("media");
    expect(darkMeta).toHaveAttribute("media", "not all");

    await user.click(screen.getByRole("button", { name: "Switch to system preference" }));
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).toBeInTheDocument();
    expect(container.querySelector(".lucide-monitor")).toBeInTheDocument();
  });
});
