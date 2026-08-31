import { describe, expect, it, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PhoneInput } from "@/components/ui/phone-input";
import { apiClient } from "@/lib/apiClient";

const countrySelect = () => document.querySelector("select") as HTMLSelectElement;

/**
 * The component is controlled — a test spy that swallows the emitted value
 * would reset the box on every keystroke. The harness feeds the value back
 * the way a real form does, while recording every emission.
 */
function TypeHarness({ onEmit, start = "" }: { onEmit: (next: string) => void; start?: string }) {
  const [value, setValue] = useState(start);
  return (
    <PhoneInput
      id="phone"
      name="phone"
      value={value}
      onChange={(next) => {
        onEmit(next);
        setValue(next);
      }}
    />
  );
}

describe("PhoneInput", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("preselects the detected country when the value is empty", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue({ data: { success: true, country: "AE" } });
    render(<PhoneInput id="phone" name="phone" value="" onChange={() => {}} />);

    await waitFor(() => expect(countrySelect().value).toBe("AE"));
    expect(screen.getByText(/United Arab Emirates \(\+971\)/)).toBeTruthy();
  });

  it("emits E.164 from a national number and the chosen country", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue({ data: { success: true, country: "IN" } });
    const onChange = vi.fn();
    render(<TypeHarness onEmit={onChange} />);

    await waitFor(() => expect(countrySelect().value).toBe("IN"));
    await userEvent.type(screen.getByRole("textbox", { name: /phone number/i }), "9876543210");
    expect(onChange).toHaveBeenLastCalledWith("+919876543210");
  });

  it("parses a full international number typed into the national box", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue({ data: { success: true, country: "IN" } });
    const onChange = vi.fn();
    render(<TypeHarness onEmit={onChange} />);

    await waitFor(() => expect(countrySelect().value).toBe("IN"));
    await userEvent.type(screen.getByRole("textbox", { name: /phone number/i }), "+971501234567");
    expect(onChange).toHaveBeenLastCalledWith("+971501234567");
    await waitFor(() => expect(countrySelect().value).toBe("AE"));
  });

  it("shows a prefilled E.164 value as its national part", () => {
    vi.spyOn(apiClient, "get");
    render(<PhoneInput id="phone" name="phone" value="+919876543210" onChange={() => {}} />);

    expect(screen.getByRole("textbox", { name: /phone number/i })).toHaveValue("9876543210");
    expect(countrySelect().value).toBe("IN");
    // No country preselect request: there was a value to parse.
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it("emits empty when the national box is cleared", async () => {
    vi.spyOn(apiClient, "get");
    const onChange = vi.fn();
    render(<TypeHarness onEmit={onChange} start="+919876543210" />);

    await userEvent.clear(screen.getByRole("textbox", { name: /phone number/i }));
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("offers the whole country list with dial codes and names", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue({ data: { success: true, country: "IN" } });
    render(<PhoneInput id="phone" name="phone" value="" onChange={() => {}} />);

    await waitFor(() => expect(countrySelect().value).toBe("IN"));
    expect(document.querySelectorAll("option").length).toBeGreaterThan(50);
    expect(screen.getByText(/India \(\+91\)/)).toBeTruthy();
  });
});
