import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Inbox } from "lucide-react";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/layout/EmptyState";
import { FormField } from "@/components/layout/FormField";

describe("PageShell", () => {
  it("defaults to spacious density", () => {
    const { container } = render(<PageShell>x</PageShell>);
    expect(container.querySelector("[data-density]")).toHaveAttribute(
      "data-density",
      "spacious",
    );
  });

  it("accepts compact density", () => {
    const { container } = render(<PageShell density="compact">x</PageShell>);
    expect(container.querySelector("[data-density]")).toHaveAttribute(
      "data-density",
      "compact",
    );
  });
});

describe("PageHeader", () => {
  it("renders the title as the page h1", () => {
    const { getByRole } = render(<PageHeader title="Companies" />);
    expect(getByRole("heading", { level: 1 })).toHaveTextContent("Companies");
  });

  it("renders actions", () => {
    const { getByRole } = render(
      <PageHeader title="Jobs" actions={<button>Post a job</button>} />,
    );
    expect(getByRole("button", { name: "Post a job" })).toBeInTheDocument();
  });
});

describe("EmptyState", () => {
  it("renders title and description", () => {
    const { getByText } = render(
      <EmptyState icon={Inbox} title="No jobs yet" description="Check back soon." />,
    );
    expect(getByText("No jobs yet")).toBeInTheDocument();
    expect(getByText("Check back soon.")).toBeInTheDocument();
  });

  it("hides its icon from assistive tech", () => {
    // The icon is decorative; the title already carries the meaning.
    const { container } = render(<EmptyState icon={Inbox} title="Nothing here" />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("FormField", () => {
  it("associates its label with the control", () => {
    const { getByLabelText } = render(
      <FormField label="Email" htmlFor="email">
        <input id="email" />
      </FormField>,
    );
    expect(getByLabelText("Email")).toBeInTheDocument();
  });

  it("links the hint to the control via aria-describedby", () => {
    const { getByLabelText, getByText } = render(
      <FormField label="Salary" htmlFor="salary" hint="In LPA">
        <input id="salary" />
      </FormField>,
    );
    const hint = getByText("In LPA");
    expect(getByLabelText("Salary")).toHaveAttribute("aria-describedby", hint.id);
  });

  it("marks the control invalid and describes it by the error", () => {
    const { getByLabelText, getByRole } = render(
      <FormField label="Email" htmlFor="email" error="That address is not valid">
        <input id="email" />
      </FormField>,
    );
    const input = getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(getByRole("alert")).toHaveTextContent("That address is not valid");
    expect(input.getAttribute("aria-describedby")).toBe(getByRole("alert").id);
  });

  it("prefers the error over the hint when both are present", () => {
    // The error is the actionable one, so it wins the description.
    const { getByLabelText, getByRole } = render(
      <FormField label="Email" htmlFor="email" hint="Work address" error="Not valid">
        <input id="email" />
      </FormField>,
    );
    expect(getByLabelText("Email").getAttribute("aria-describedby")).toBe(
      getByRole("alert").id,
    );
  });
});
