import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError } from "axios";
import { Provider } from "react-redux";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import type { ProfileView, SessionUser } from "@jobportal/shared";

import IdentityCard from "@/components/identity/IdentityCard";
import { PortalScope } from "@/components/theme/PortalScope";
import { apiClient } from "@/lib/apiClient";
import { setUser } from "@/redux/authSlice";
import { makeQueryClient, makeStore } from "./helpers/renderRoute";

const seekerUser: SessionUser = {
  id: "u1",
  portal: "seeker",
  fullName: "Ada Lovelace",
  email: "ada@x.test",
  emailVerified: true,
  avatarUrl: null,
  status: "active",
  profileComplete: true,
  hasPassword: true,
  isMinor: false,
  pendingEmailChange: null,
};

const baseProfile: ProfileView = {
  user: seekerUser,
  phone: null,
  dob: null,
  gender: null,
  seeker: null,
  recruiter: null,
  admin: null,
};

/** Where the flow lands, so the assertion is the real destination. */
function LocationProbe() {
  const { pathname, state } = useLocation();
  return (
    <div
      data-testid="loc"
      data-pathname={pathname}
      data-notice={(state as { notice?: string } | null)?.notice ?? ""}
    />
  );
}

/**
 * The card renders inside whatever portal surface owns it; here that is a
 * router with the three login destinations mounted, so a completed change can
 * be followed to the portal's own login the way the app would.
 */
function renderCard(profile: ProfileView, store = makeStore()) {
  const view = render(
    <Provider store={store}>
      <QueryClientProvider client={makeQueryClient()}>
        <MemoryRouter initialEntries={["/profile"]}>
          <PortalScope>
            <Routes>
              <Route path="/profile" element={<IdentityCard profile={profile} />} />
              <Route path="/login" element={<LocationProbe />} />
              <Route path="/hire/login" element={<LocationProbe />} />
              <Route path="/admin/login" element={<LocationProbe />} />
            </Routes>
          </PortalScope>
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>,
  );
  return {
    view,
    store,
    pathname: () => screen.getByTestId("loc").getAttribute("data-pathname"),
    notice: () => screen.getByTestId("loc").getAttribute("data-notice"),
  };
}

async function openDialog() {
  await userEvent.click(screen.getByRole("button", { name: /change email address/i }));
  return screen.findByRole("dialog");
}

function apiRejection(code: string, message: string, status = 400): AxiosError {
  return new AxiosError(message, "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    data: { success: false, code, message },
  } as never);
}

describe("ChangeEmailDialog shape", () => {
  it("asks for the password on an account that has one", async () => {
    renderCard(baseProfile);
    await openDialog();
    expect(screen.getByLabelText(/^new email address/i)).toBeTruthy();
    expect(screen.getByLabelText(/^password/i)).toBeTruthy();
  });

  it("asks for no password on a Google-only account", async () => {
    renderCard({
      ...baseProfile,
      user: { ...seekerUser, hasPassword: false },
    });
    await openDialog();
    expect(screen.getByLabelText(/^new email address/i)).toBeTruthy();
    expect(screen.queryByLabelText(/^password/i)).toBeNull();
  });

  it("posts the seeker start to the user mount", async () => {
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({
      data: { success: true, message: "A confirmation code is on its way." },
    });
    renderCard(baseProfile);
    await openDialog();

    await userEvent.type(screen.getByLabelText(/^new email address/i), "ada-new@x.test");
    await userEvent.type(screen.getByLabelText(/^password/i), "correct horse battery staple");
    await userEvent.click(screen.getByRole("button", { name: /^send code/i }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/user/email-change", {
        newEmail: "ada-new@x.test",
        password: "correct horse battery staple",
      }),
    );
    post.mockRestore();
  });

  it("surfaces EMAIL_TAKEN and PASSWORD_INVALID as readable sentences", async () => {
    for (const [code, sentence] of [
      ["EMAIL_TAKEN", "An account already exists for that address."],
      ["PASSWORD_INVALID", "That password is incorrect."],
    ] as const) {
      const post = vi
        .spyOn(apiClient, "post")
        .mockRejectedValue(apiRejection(code, "Server said so.", code === "EMAIL_TAKEN" ? 409 : 401));
      // Unmounted between iterations: an open Radix dialog sets
      // `pointer-events: none` on body, which would block the next render's
      // clicks — a testing artifact, not a behaviour under test.
      const rendered = renderCard(baseProfile);
      await openDialog();

      await userEvent.type(screen.getByLabelText(/^new email address/i), "taken@x.test");
      await userEvent.type(screen.getByLabelText(/^password/i), "correct horse battery staple");
      await userEvent.click(screen.getByRole("button", { name: /^send code/i }));

      expect(await screen.findByRole("alert")).toHaveTextContent(sentence);
      // The server's own message is not what the person should read here.
      expect(screen.getByRole("alert")).not.toHaveTextContent("Server said so.");
      post.mockRestore();
      rendered.view.unmount();
    }
  });
});

describe("ChangeEmailDialog resume", () => {
  it("resumes a pending change at the code step", async () => {
    renderCard({
      ...baseProfile,
      user: {
        ...seekerUser,
        pendingEmailChange: {
          newEmail: "ada-new@x.test",
          requestedAt: new Date().toISOString(),
          confirmedCurrentAt: null,
        },
      },
    });
    await openDialog();
    // The form step is skipped entirely — the flow continues where it left off.
    expect(screen.queryByLabelText(/^new email address/i)).toBeNull();
    expect(screen.getByLabelText(/^code sent to your new address/i)).toBeTruthy();
  });

  it("resumes an admin pending change at the stage the state names", async () => {
    const adminProfile: ProfileView = {
      ...baseProfile,
      user: {
        ...seekerUser,
        id: "a1",
        portal: "admin",
        email: "root@x.test",
        pendingEmailChange: {
          newEmail: "root-new@x.test",
          requestedAt: new Date().toISOString(),
          confirmedCurrentAt: new Date().toISOString(),
        },
      },
    };
    const first = renderCard(adminProfile);
    await openDialog();
    // Stage 1 is done, so the dialog waits on the NEW address's code.
    expect(screen.getByLabelText(/^code sent to your new address/i)).toBeTruthy();
    first.view.unmount();

    // Without the stage-1 confirmation, it waits on the CURRENT address's.
    const second = renderCard({
      ...adminProfile,
      user: {
        ...adminProfile.user,
        pendingEmailChange: { ...adminProfile.user.pendingEmailChange!, confirmedCurrentAt: null },
      },
    });
    await openDialog();
    expect(screen.getByLabelText(/^code sent to your current address/i)).toBeTruthy();
    second.view.unmount();
  });
});

describe("ChangeEmailDialog completion", () => {
  it("clears local auth state and lands on the portal's own login", async () => {
    const post = vi
      .spyOn(apiClient, "post")
      .mockResolvedValue({ data: { success: true, message: "Email updated." } });

    const store = makeStore();
    store.dispatch(setUser(seekerUser));
    const rendered = renderCard(baseProfile, store);
    await openDialog();

    await userEvent.type(screen.getByLabelText(/^new email address/i), "ada-new@x.test");
    await userEvent.type(screen.getByLabelText(/^password/i), "correct horse battery staple");
    await userEvent.click(screen.getByRole("button", { name: /^send code/i }));
    await screen.findByLabelText(/^code sent to your new address/i);

    await userEvent.type(screen.getByLabelText(/^code sent to your new address/i), "123456");
    await userEvent.click(screen.getByRole("button", { name: /^confirm/i }));

    await waitFor(() => expect(rendered.pathname()).toBe("/login"));
    expect(rendered.notice()).toBe("Email updated — sign in with your new address.");
    // The session the change killed is gone from the store too.
    await waitFor(() => expect(store.getState().auth.user).toBeNull());
    expect(post).toHaveBeenCalledWith("/user/email-change/confirm", { code: "123456" });
    post.mockRestore();
  });

  it("lands an admin on the console's own login", async () => {
    const post = vi
      .spyOn(apiClient, "post")
      .mockResolvedValue({ data: { success: true, message: "Email updated." } });

    const adminUser: SessionUser = {
      ...seekerUser,
      id: "a1",
      portal: "admin",
      email: "root@x.test",
    };
    const store = makeStore();
    store.dispatch(setUser(adminUser));
    const rendered = renderCard({ ...baseProfile, user: adminUser }, store);
    await openDialog();

    await userEvent.type(screen.getByLabelText(/^new email address/i), "root-new@x.test");
    await userEvent.type(screen.getByLabelText(/^password/i), "correct horse battery staple");
    await userEvent.click(screen.getByRole("button", { name: /^send code/i }));
    await screen.findByLabelText(/^code sent to your current address/i);

    // Admin stage 1: the dialog advances to the new address's code, staying
    // on the admin mount throughout.
    await userEvent.type(screen.getByLabelText(/^code sent to your current address/i), "111111");
    await userEvent.click(screen.getByRole("button", { name: /^confirm/i }));
    await screen.findByLabelText(/^code sent to your new address/i);

    await userEvent.type(screen.getByLabelText(/^code sent to your new address/i), "222222");
    await userEvent.click(screen.getByRole("button", { name: /^confirm/i }));

    await waitFor(() => expect(rendered.pathname()).toBe("/admin/login"));
    expect(post).toHaveBeenCalledWith("/admin/email-change", {
      newEmail: "root-new@x.test",
      password: "correct horse battery staple",
    });
    expect(post).toHaveBeenCalledWith("/admin/email-change/confirm", { code: "111111" });
    expect(post).toHaveBeenCalledWith("/admin/email-change/confirm", { code: "222222" });
    post.mockRestore();
  });

  it("keeps the dialog open when the code is refused", async () => {
    const post = vi.spyOn(apiClient, "post").mockImplementation(async (url) => {
      if (String(url).endsWith("/confirm")) {
        throw apiRejection("OTP_INVALID", "That code is incorrect or has expired.");
      }
      return { data: { success: true, message: "A confirmation code is on its way." } };
    });

    renderCard(baseProfile);
    await openDialog();
    await userEvent.type(screen.getByLabelText(/^new email address/i), "ada-new@x.test");
    await userEvent.type(screen.getByLabelText(/^password/i), "correct horse battery staple");
    await userEvent.click(screen.getByRole("button", { name: /^send code/i }));
    await screen.findByLabelText(/^code sent to your new address/i);

    await userEvent.type(screen.getByLabelText(/^code sent to your new address/i), "000000");
    await userEvent.click(screen.getByRole("button", { name: /^confirm/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/incorrect or has expired/i);
    expect(screen.getByRole("dialog")).toBeTruthy();
    post.mockRestore();
  });
});
