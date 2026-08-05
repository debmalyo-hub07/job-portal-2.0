import { describe, expect, it } from "vitest";
import { Probe, portalOf, renderRoute } from "./helpers/renderRoute";

describe("test harness", () => {
  it("renders inside the app providers", () => {
    const { getByTestId } = renderRoute(<Probe>hello</Probe>, { route: "/" });
    expect(getByTestId("probe")).toHaveTextContent("hello");
  });

  it("exposes the resolved portal", () => {
    const { container } = renderRoute(<Probe />, { route: "/" });
    expect(portalOf(container)).toBe("seeker");
  });
});
