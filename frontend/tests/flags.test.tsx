import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";

import AdminFlags from "@/components/console/AdminFlags";
import { useFlags } from "@/hooks/useFlags";
import { apiClient } from "@/lib/apiClient";
import { makeQueryClient, makeStore } from "./helpers/renderRoute";

const mutate = vi.fn();
// The one piece of mutable mock state: the failing-flip test flips it before
// rendering. vi.mock factories close over hoisted values, so this is how a
// single mock changes shape between tests.
const mockState = vi.hoisted(() => ({ failFlip: false }));

const fixtures = vi.hoisted(() => ({
  flags: [
    {
      key: "autoApproveRecruiterSignups" as const,
      description: "Reserved for the approval automation.",
      enabled: false,
      default: false,
      lastChangedBy: "flipper@admins.test",
      lastChangedAt: "2026-09-01T12:00:00.000Z",
    },
  ],
}));

vi.mock("@/hooks/useAdminConsole", () => ({
  useAdminFlags: () => ({ data: fixtures.flags, isPending: false, isError: false, error: null }),
  useSetFlag: () => ({
    mutate,
    isPending: false,
    isError: mockState.failFlip,
    error: new Error("nope"),
  }),
}));

function renderFlags() {
  return render(
    <Provider store={makeStore()}>
      <MemoryRouter>
        <AdminFlags />
      </MemoryRouter>
    </Provider>,
  );
}

describe("the Flags console screen", () => {
  beforeEach(() => {
    mutate.mockClear();
    mockState.failFlip = false;
  });

  it("renders the registry flag with its state and last flipper", () => {
    renderFlags();
    expect(screen.getByText("autoApproveRecruiterSignups")).toBeInTheDocument();
    expect(screen.getByText(/reserved for the approval automation/i)).toBeInTheDocument();
    expect(screen.getByText(/flipper@admins\.test/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /turn on/i })).toBeInTheDocument();
  });

  it("flips through the mutation when the toggle is clicked", async () => {
    renderFlags();
    await userEvent.click(screen.getByRole("button", { name: /turn on/i }));
    expect(mutate).toHaveBeenCalledWith({
      key: "autoApproveRecruiterSignups",
      enabled: true,
    });
  });

  it("surfaces a failed flip rather than silently doing nothing", () => {
    mockState.failFlip = true;
    renderFlags();
    expect(screen.getByRole("alert")).toHaveTextContent(/could not flip/i);
  });
});

describe("useFlags", () => {
  it("resolves values from the public endpoint", async () => {
    const get = vi.fn().mockResolvedValue({
      data: { success: true, flags: { autoApproveRecruiterSignups: false } },
    });
    vi.spyOn(apiClient, "get").mockImplementation(get);

    let resolved: { autoApproveRecruiterSignups?: boolean } | undefined;
    function Probe() {
      const flags = useFlags();
      resolved = flags.data;
      return null;
    }
    render(
      <Provider store={makeStore()}>
        <QueryClientProvider client={makeQueryClient()}>
          <MemoryRouter>
            <Probe />
          </MemoryRouter>
        </QueryClientProvider>
      </Provider>,
    );

    await vi.waitFor(() => expect(resolved).toEqual({ autoApproveRecruiterSignups: false }));
    expect(get).toHaveBeenCalledWith("/flags");
  });
});
