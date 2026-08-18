import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PasswordInput } from "@/components/ui/password-input";
import { FormField } from "@/components/layout/FormField";

function renderField(props: { hint?: string; error?: string; disabled?: boolean } = {}) {
  return render(
    <FormField label="Password" htmlFor="pw" hint={props.hint} error={props.error} required>
      <PasswordInput id="pw" name="password" placeholder="Your password" disabled={props.disabled} />
    </FormField>,
  );
}

const field = () => screen.getByLabelText(/password/i, { selector: "input" });
const toggle = () => screen.getByRole("button");

describe("PasswordInput", () => {
  it("hides the value until asked", () => {
    renderField();
    expect(field()).toHaveAttribute("type", "password");
  });

  it("reveals and re-hides the value", async () => {
    renderField();

    await userEvent.click(toggle());
    expect(field()).toHaveAttribute("type", "text");

    await userEvent.click(toggle());
    expect(field()).toHaveAttribute("type", "password");
  });

  /**
   * The label names the action the control performs, not the state it is in:
   * "Hide password" while the characters are showing is the choice being
   * offered, which is what a screen reader user is deciding between.
   */
  it("names the action it will perform", async () => {
    renderField();
    expect(toggle()).toHaveAccessibleName("Show password");

    await userEvent.click(toggle());
    expect(toggle()).toHaveAccessibleName("Hide password");
  });

  /**
   * A bare <button> inside a form defaults to type="submit". Revealing a
   * password would have submitted the sign-in form with whatever was typed.
   */
  it("does not submit the form it sits in", async () => {
    let submits = 0;
    render(
      <form onSubmit={() => submits++}>
        <PasswordInput id="pw" />
      </form>,
    );

    await userEvent.click(screen.getByRole("button"));
    expect(submits).toBe(0);
  });

  /**
   * `FormField` clones its only child to inject these two. A wrapper element
   * that kept them would leave every hint and error on the field unannounced —
   * present in the DOM, attached to nothing.
   */
  it("carries FormField's description down to the input, not the wrapper", () => {
    renderField({ hint: "At least 12 characters." });

    expect(field()).toHaveAttribute("aria-describedby", "pw-hint");
    expect(field()).toHaveAccessibleDescription("At least 12 characters.");
  });

  it("takes the invalid state from FormField", () => {
    renderField({ error: "Password is too short." });

    expect(field()).toHaveAttribute("aria-invalid", "true");
    expect(field()).toHaveAccessibleDescription("Password is too short.");
  });

  it("disables the toggle with the field", () => {
    renderField({ disabled: true });

    expect(field()).toBeDisabled();
    expect(toggle()).toBeDisabled();
  });

  it("keeps the caller's autoComplete so password managers still fill it", () => {
    render(<PasswordInput id="pw" autoComplete="new-password" placeholder="Choose a password" />);
    expect(screen.getByPlaceholderText("Choose a password")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
  });
});

/**
 * Every password field in the app routes through the primitive.
 *
 * A reveal that only the sign-in form has is the shape this codebase keeps
 * relearning — Wordmark was hand-written twice, `homePathFor` five times. Read
 * the sources rather than the rendered output, because a form that kept a bare
 * `<Input type="password">` renders perfectly well; it is just missing the
 * control, which no per-page test would notice.
 */
describe("password fields across the platform", () => {
  // Anchored to the vitest root, not import.meta.url: under the vite transform
  // that URL is not drive-qualified on Windows. See workspaceRoutes.test.tsx,
  // where the same mistake made a scan read zero files and still pass.
  const FORMS = [
    join("components", "auth", "Login.tsx"),
    join("components", "auth", "Signup.tsx"),
    join("components", "auth", "ResetPassword.tsx"),
    join("components", "console", "AdminDashboard.tsx"),
  ];
  const read = (file: string) => readFileSync(join(process.cwd(), "src", file), "utf8");

  it.each(FORMS)("%s uses PasswordInput", (file) => {
    const source = read(file);
    // Guard against the silent-miss failure mode: an unreadable path must throw
    // or show up as empty here, never pass by finding nothing.
    expect(source.length).toBeGreaterThan(500);
    expect(source).toContain("PasswordInput");
  });

  it.each(FORMS)("%s keeps no bare password Input", (file) => {
    expect(read(file)).not.toMatch(/type="password"/);
  });
});
