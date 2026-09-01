import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router";

import AccountHistoryDialog from "@/components/console/AccountHistoryDialog";
import ActivityFeed from "@/components/console/ActivityFeed";
import AdminRecruiters from "@/components/console/AdminRecruiters";
import { makeStore } from "./helpers/renderRoute";

const recruiters = vi.hoisted(() => [
  {
    id: "r1",
    fullName: "Mira Patel",
    email: "mira@northstarlabs.example",
    status: "pending" as const,
    jobCount: 0,
    applicationCount: 0,
    createdAt: "2026-09-02T10:00:00.000Z",
    emailDomainKind: "custom" as const,
    matchingCompany: "Northstar Labs",
  },
  {
    id: "r2",
    fullName: "Someone",
    email: "someone@gmail.com",
    status: "pending" as const,
    jobCount: 0,
    applicationCount: 0,
    createdAt: "2026-09-02T10:00:00.000Z",
    emailDomainKind: "free" as const,
    matchingCompany: null,
  },
]);

// The dialog fetches its history through the hook, not props, so the mock
// answers both the table's hooks and the dialog's with one module-level shape.
vi.mock("@/hooks/useAdminConsole", () => ({
  useAdminRecruiters: () => ({
    data: { items: recruiters, page: 1, pages: 1, total: recruiters.length },
    isPending: false,
    isError: false,
    error: null,
    keyword: "",
    setKeyword: vi.fn(),
    setPage: vi.fn(),
  }),
  useRecruiterDecision: () => ({ mutate: vi.fn(), isPending: false }),
  useAccountStatusChange: () => ({ mutate: vi.fn(), isPending: false }),
  useAccountEvents: () => ({
    data: [
      {
        id: "e1",
        kind: "auto_approved" as const,
        reason: "email domain matches Northstar Labs",
        at: "2026-09-02T10:00:00.000Z",
        actorEmail: null,
      },
    ],
    isPending: false,
    isError: false,
    error: null,
  }),
}));

function renderAt(node: React.ReactNode) {
  return render(
    <Provider store={makeStore()}>
      <MemoryRouter>{node}</MemoryRouter>
    </Provider>,
  );
}

describe("the monitoring table's signal badges", () => {
  it("badges a matched domain and a free-mail address on pending rows", () => {
    renderAt(<AdminRecruiters />);

    expect(screen.getByText("Matches Northstar Labs")).toBeInTheDocument();
    expect(screen.getByText("Free mail")).toBeInTheDocument();
  });
});

describe("the history dialog's auto-approved label", () => {
  it("labels the automation's own event kind", () => {
    renderAt(
      <AccountHistoryDialog
        portal="recruiter"
        account={{ id: "r1", label: "Mira Patel" }}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Auto-approved")).toBeInTheDocument();
    expect(screen.getByText(/email domain matches Northstar Labs/)).toBeInTheDocument();
  });
});

describe("the activity feed's auto-approval row", () => {
  it("renders the new kind with its verb", () => {
    renderAt(
      <ActivityFeed
        items={[
          {
            id: "a1",
            kind: "recruiter_auto_approved",
            at: new Date().toISOString(),
            label: "Mira Patel",
            detail: "Northstar Labs",
            href: "/admin/recruiters",
          },
        ]}
      />,
    );

    // The verb and detail render inside one span ("Recruiter auto-approved ·
    // Northstar Labs"), so these are substring assertions.
    expect(screen.getByText(/recruiter auto-approved/i)).toBeInTheDocument();
    expect(screen.getByText(/northstar labs/i)).toBeInTheDocument();
  });
});
