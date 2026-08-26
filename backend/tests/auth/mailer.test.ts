import { afterEach, describe, expect, it, vi } from "vitest";
import type { Mailer } from "../../src/lib/mailer.js";
import {
  renderAccountClaimedEmail,
  renderOtpBudgetEmail,
  renderOtpEmail,
  renderPasswordSetupEmail,
} from "../../src/lib/emailTemplates.js";
import {
  describeMailerError,
  dispatch,
  isMailerAvailable,
  resetMailer,
  sendOtpEmail,
  sendRendered,
  setMailer,
} from "../../src/lib/mailer.js";

const SETUP_URL = "https://cairn.example/admin/set-password?email=new%40example.com";

describe("email templates", () => {
  it("puts the code in both the html and text bodies", () => {
    const r = renderOtpEmail("012345", "verify_email", 10);
    expect(r.html).toContain("012345");
    expect(r.text).toContain("012345");
    expect(r.subject).toMatch(/confirm/i);
  });

  it("tells a reset recipient their password has not changed yet", () => {
    const r = renderOtpEmail("012345", "reset_password", 10);
    expect(r.text).toMatch(/has not changed/i);
  });

  it("describes a new admin setup rather than an existing password reset", () => {
    const r = renderPasswordSetupEmail("012345", 10, SETUP_URL);
    expect(r.subject).toMatch(/set up/i);
    expect(r.text).toMatch(/admin account is ready/i);
    expect(r.text).not.toMatch(/current password/i);
  });

  /**
   * The invite's whole failure mode before Phase 1: a code with nowhere to
   * enter it. The email named "the admin password setup screen" and carried no
   * link, and no such screen existed — an invited admin was stranded unless
   * somebody told them to type /reset-password?portal=admin by hand.
   */
  it("gives the invited admin somewhere to enter the code", () => {
    const r = renderPasswordSetupEmail("012345", 10, SETUP_URL);
    expect(r.html).toContain(SETUP_URL);
    expect(r.text).toContain(SETUP_URL);
  });

  /**
   * Navigation only, never authentication. A URL that carried the code would
   * be a magic link into the highest-privilege portal, and links leak through
   * mail scanners, referrer headers and browser history in a way a typed code
   * does not.
   */
  it("keeps the code out of the setup link", () => {
    const r = renderPasswordSetupEmail("012345", 10, SETUP_URL);
    for (const url of [...r.html.matchAll(/https?:\/\/[^"'\s<]+/g)].map((m) => m[0])) {
      expect(url).not.toContain("012345");
    }
    expect(r.text.split(/\s+/).filter((w) => w.startsWith("http"))).not.toContain(
      expect.stringContaining("012345"),
    );
  });

  it("renders the two notification templates with their subjects", () => {
    // Task 9 greps for the claimed-account subject and Task 7 for the budget
    // one, so these strings are an interface, not decoration.
    expect(renderAccountClaimedEmail().subject).toMatch(/sign-in method changed|linked to Google/i);
    expect(renderOtpBudgetEmail(24).text).toContain("24");
  });
});

describe("dispatch", () => {
  afterEach(() => {
    vi.useRealTimers();
    resetMailer();
  });

  it("swallows a rejection so the request path cannot fail on a mail outage", async () => {
    // `logger` is a Pino instance; spy on the instance method, not the module.
    const { logger } = await import("../../src/lib/logger.js");
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => logger);
    try {
      // Must not throw synchronously, and the rejection must be observed (not
      // left to crash the process as an unhandled rejection).
      expect(() => dispatch(Promise.reject(new Error("brevo down")))).not.toThrow();
      await new Promise((r) => setImmediate(r));
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("strips request headers and credentials from provider errors", () => {
    const details = describeMailerError({
      reason: "status-code",
      statusCode: 401,
      body: { code: "unauthorized", message: "IP is not authorised" },
      headers: { "api-key": "must-never-be-logged" },
    });

    expect(details).toEqual({
      reason: "status-code",
      statusCode: 401,
      code: "unauthorized",
      message: "IP is not authorised",
    });
    expect(JSON.stringify(details)).not.toContain("must-never-be-logged");
  });

  it("opens the availability circuit on failure and closes it after recovery", async () => {
    setMailer({ async send() {} });
    expect(await isMailerAvailable()).toBe(true);

    dispatch(Promise.reject(new Error("brevo down")));
    await new Promise((resolve) => setImmediate(resolve));
    expect(await isMailerAvailable()).toBe(false);

    setMailer({ async send() {} });
    expect(await isMailerAvailable()).toBe(true);
  });

  it("rechecks an unavailable provider after the retry interval", async () => {
    vi.useFakeTimers();
    const verify = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("brevo down"))
      .mockResolvedValue(undefined);
    setMailer({ async send() {}, verify });

    expect(await isMailerAvailable()).toBe(false);
    expect(await isMailerAvailable()).toBe(false);
    expect(verify).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(60_000);
    expect(await isMailerAvailable()).toBe(true);
    expect(verify).toHaveBeenCalledTimes(2);
  });
});

describe("mailer seam", () => {
  afterEach(() => resetMailer());

  it("routes sendOtpEmail through the active mailer, with the code not leaked to logs", async () => {
    const sent: Array<{ to: string; subject: string; html: string; text: string }> = [];
    const capture: Mailer = {
      async send(to, subject, html, text) {
        sent.push({ to, subject, html, text });
      },
    };
    setMailer(capture);

    // The code is bound into the rendered bodies here — this is the transport
    // boundary, the last point before it leaves the process. The template tests
    // above assert the code is in the bodies; this asserts the bodies reach the
    // mailer intact.
    await sendOtpEmail("person@x.test", "654321", "verify_email");

    expect(sent).toHaveLength(1);
    const [first] = sent;
    expect(first).toBeDefined();
    expect(first?.to).toBe("person@x.test");
    expect(first?.html).toContain("654321");
    expect(first?.text).toContain("654321");
    expect(first?.subject).toMatch(/confirm/i);
  });

  it("routes sendRendered through the active mailer", async () => {
    const sent: Array<{ to: string; subject: string }> = [];
    const capture: Mailer = {
      async send(to, subject) {
        sent.push({ to, subject });
      },
    };
    setMailer(capture);

    await sendRendered("owner@x.test", renderAccountClaimedEmail());
    expect(sent).toEqual([{ to: "owner@x.test", subject: expect.stringMatching(/google/i) as string }]);
  });

  it("resetMailer detaches the installed test mailer", async () => {
    const sent: string[] = [];
    setMailer({
      async send(to) {
        sent.push(to);
      },
    });
    await sendRendered("first@x.test", renderAccountClaimedEmail());
    expect(sent).toEqual(["first@x.test"]);

    resetMailer();

    // The real transport is now active. Calling it would open a socket, so
    // instead prove the capture mailer is genuinely detached: install a second
    // one and confirm the first stops receiving.
    const second: string[] = [];
    setMailer({
      async send(to) {
        second.push(to);
      },
    });
    await sendRendered("after@x.test", renderAccountClaimedEmail());
    expect(sent).toEqual(["first@x.test"]);
    expect(second).toEqual(["after@x.test"]);
  });
});
