import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { MemoryRouter } from "react-router";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import type { ReactElement } from "react";

import { makeStore } from "./helpers/renderRoute";
import Login from "@/components/auth/Login";
import Signup from "@/components/auth/Signup";
import ForgotPassword from "@/components/auth/ForgotPassword";
import { apiClient } from "@/lib/apiClient";

/**
 * The Turnstile-enabled auth path, which is the only one production runs.
 *
 * Every other auth test exercises the opposite branch. CI sets
 * `VITE_TURNSTILE_SITE_KEY` on the build step and nowhere else, so under test
 * `turnstileEnabled` is false: the challenge renders nothing, the submit button
 * is never gated, and no request carries a token. That branch cannot ship — the
 * web build refuses to compile without the key — so the shipped behaviour had
 * no coverage at all.
 *
 * The flag is mocked rather than set through the environment. `turnstileEnabled`
 * is a module-scope const, so changing the variable afterwards means resetting
 * the module registry, and a reset registry hands Login its own copies of
 * react-redux and apiClient — the Provider's context stops matching and the spy
 * stops seeing calls. Mocking the two exported values reaches every importer
 * with none of that. `turnstileRequestConfig` stays real: it is the piece that
 * shapes the header, so a mock there would test the mock.
 */
vi.mock("@/lib/turnstile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/turnstile")>()),
  turnstileSiteKey: "1x00000000000000000000AA",
  turnstileEnabled: true,
}));

vi.mock("@/hooks/usePublicJobCount", () => ({
  usePublicJobCount: () => ({ count: null, ready: true }),
}));

type TurnstileApi = NonNullable<Window["turnstile"]>;
type WidgetOptions = Parameters<TurnstileApi["render"]>[1];

/**
 * Cloudflare's real widget is an iframe from challenges.cloudflare.com, so the
 * only honest stand-in is its API surface. `loadTurnstile` short-circuits when
 * `window.turnstile` already exists, which means installing this also keeps the
 * suite from reaching for the network.
 */
function installWidget() {
  const rendered: WidgetOptions[] = [];
  const removed: string[] = [];

  window.turnstile = {
    render: (_container, options) => {
      rendered.push(options);
      return `widget-${rendered.length}`;
    },
    remove: (widgetId) => {
      removed.push(widgetId);
    },
  };

  return {
    rendered,
    removed,
    /**
     * The live widget, with its callbacks wrapped in `act`. Cloudflare invokes
     * them from outside React, and each one sets state on the form, so calling
     * them raw passes the assertions while filling the run with act warnings.
     */
    async live() {
      await waitFor(() => expect(rendered.length).toBeGreaterThan(0));
      const options = rendered[rendered.length - 1]!;
      return {
        action: options.action,
        sitekey: options.sitekey,
        solve: (token: string) => act(async () => options.callback(token)),
        expire: () => act(async () => options["expired-callback"]()),
        fail: () => act(async () => options["error-callback"]()),
      };
    },
  };
}

function renderWithProviders(ui: ReactElement, path = "/") {
  return render(
    <Provider store={makeStore()}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </Provider>,
  );
}

const submitButton = () => screen.getByRole("button", { name: /sign in/i });

async function fillCredentials() {
  await userEvent.type(screen.getByLabelText(/email/i), "a@b.test");
  await userEvent.type(screen.getByLabelText(/^password/i), "password12345");
}

describe("auth forms with Turnstile enabled", () => {
  beforeEach(() => vi.restoreAllMocks());

  afterEach(() => {
    delete window.turnstile;
  });

  it("gates submit until the widget produces a token", async () => {
    const widget = installWidget();
    renderWithProviders(<Login portal="seeker" />);

    const challenge = await widget.live();
    expect(submitButton()).toBeDisabled();

    await challenge.solve("token-1");
    expect(submitButton()).toBeEnabled();
  });

  it("sends the token as X-Turnstile-Token", async () => {
    const post = vi
      .spyOn(apiClient, "post")
      .mockResolvedValue({ data: { user: { id: "1", portal: "seeker" } } } as never);
    const widget = installWidget();
    renderWithProviders(<Login portal="seeker" />);

    await (await widget.live()).solve("token-1");
    await fillCredentials();
    await userEvent.click(submitButton());

    expect(post).toHaveBeenCalledWith(
      "/seeker/auth/login",
      { email: "a@b.test", password: "password12345" },
      { headers: { "X-Turnstile-Token": "token-1" } },
    );
  });

  it("re-gates submit when the token expires", async () => {
    const widget = installWidget();
    renderWithProviders(<Login portal="seeker" />);

    const challenge = await widget.live();
    await challenge.solve("token-1");
    expect(submitButton()).toBeEnabled();

    await challenge.expire();
    expect(submitButton()).toBeDisabled();
  });

  it("reports a widget error and keeps submit gated", async () => {
    const widget = installWidget();
    renderWithProviders(<Login portal="seeker" />);

    await (await widget.live()).fail();

    expect(screen.getByRole("alert")).toHaveTextContent(/verification could not load/i);
    expect(submitButton()).toBeDisabled();
  });

  it("reports a failure when the script cannot load", async () => {
    // No window.turnstile: the component injects the script tag and waits.
    renderWithProviders(<Login portal="seeker" />);

    const script = await waitFor(() => {
      const found = document.getElementById("cloudflare-turnstile-script");
      expect(found).not.toBeNull();
      return found!;
    });
    await act(async () => {
      script.dispatchEvent(new Event("error"));
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/verification could not load/i);
    expect(submitButton()).toBeDisabled();
    script.remove();
  });

  it("issues a fresh challenge after a rejected login", async () => {
    // Turnstile tokens are single-use, so a form that keeps the old one after a
    // failed attempt sends a token the server has already redeemed and the
    // second attempt fails for a reason the user cannot see.
    vi.spyOn(apiClient, "post").mockRejectedValue(new Error("nope"));
    const widget = installWidget();
    renderWithProviders(<Login portal="seeker" />);

    await (await widget.live()).solve("token-1");
    await fillCredentials();
    await userEvent.click(submitButton());

    await waitFor(() => expect(widget.rendered).toHaveLength(2));
    expect(widget.removed).toEqual(["widget-1"]);
    expect(submitButton()).toBeDisabled();
  });

  /**
   * Each form names its own action, and Cloudflare reports rate and failure
   * rates per action — a copy-paste that leaves two forms sharing one label
   * silently merges their analytics, and a form with no challenge at all is
   * simply unprotected.
   */
  it.each([
    ["seeker login", <Login portal="seeker" />, "/login", "seeker_login"],
    ["recruiter login", <Login portal="recruiter" />, "/recruiter/login", "recruiter_login"],
    ["seeker signup", <Signup portal="seeker" />, "/signup", "seeker_register"],
    ["recruiter signup", <Signup portal="recruiter" />, "/recruiter/signup", "recruiter_register"],
    ["recovery", <ForgotPassword />, "/forgot-password?portal=recruiter", "recruiter_recovery"],
  ])("mounts a challenge on %s", async (_name, ui, path, action) => {
    const widget = installWidget();
    renderWithProviders(ui, path);

    const challenge = await widget.live();
    expect(challenge.action).toBe(action);
    expect(challenge.sitekey).toBe("1x00000000000000000000AA");
  });
});
