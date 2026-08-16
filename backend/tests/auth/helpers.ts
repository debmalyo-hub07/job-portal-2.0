import express, { Router, type Express } from "express";
import cookieParser from "cookie-parser";
import type { Response as SupertestResponse, Test as SupertestRequest } from "supertest";
import { vi } from "vitest";
import type { Portal } from "@jobportal/shared";
import { setMailer } from "../../src/lib/mailer.js";
import { errorHandler } from "../../src/middleware/error.js";
import { notFound } from "../../src/middleware/notFound.js";
import { buildApp } from "../../src/app.js";
import { accountModel } from "../../src/services/account.service.js";
import request from "supertest";

export interface CapturedMail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export const outbox: CapturedMail[] = [];

/**
 * Install a mailer that records instead of sending; truncates the outbox.
 * Call from beforeEach. No test in this suite may ever open a socket to Brevo
 * — CI has no key and the suite must run offline.
 */
export function installCaptureMailer(): void {
  outbox.length = 0;
  setMailer({
    async send(to, subject, html, text) {
      outbox.push({ to, subject, html, text });
    },
  });
}

/**
 * The most recent 6-digit code mailed to `email`. Polled with vi.waitFor
 * because sends are dispatch()ed fire-and-forget — the HTTP response usually
 * lands before the capture does.
 */
export function lastCodeFor(email: string): Promise<string> {
  return vi.waitFor(() => {
    const mail = [...outbox].reverse().find((m) => m.to === email && /\b\d{6}\b/.test(m.text));
    if (!mail) throw new Error(`no code mailed to ${email} yet`);
    // Extracted rather than `exec(...)![1]`: under noUncheckedIndexedAccess the
    // `!` removes the null from `exec` but NOT the undefined from `[1]`, so the
    // terser version does not satisfy `Promise<string>`. Throwing inside
    // vi.waitFor also just retries, which is the behaviour we want anyway.
    const code = /\b(\d{6})\b/.exec(mail.text)?.[1];
    if (!code) throw new Error(`mail to ${email} has no 6-digit code`);
    return code;
  });
}

/**
 * Minimal app hosting exactly the handlers a test mounts, at the REAL paths.
 * The mount callback runs once per portal, so cross-portal cases need no
 * extra setup.
 *
 * Deliberately without the rate limiters — those arrive with the real router in
 * Task 10 and are tested there, so flow tests here never fight a limiter.
 */
export function authTestApp(mount: (portal: Portal, router: Router) => void): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  for (const portal of ["seeker", "recruiter"] as const) {
    const router = Router();
    mount(portal, router);
    app.use(`/api/v1/${portal}/auth`, router);
  }
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

/**
 * First value of a named cookie across a response's Set-Cookie headers.
 *
 * The `?? match` and `?? ""` fallbacks below are there because
 * `noUncheckedIndexedAccess` is on (tsconfig.base.json) and makes every `[0]`
 * possibly-undefined. `String.split` always returns at least one element, so
 * neither fallback is reachable — but `!` would be a lie the next reader has to
 * re-derive, and these are three characters.
 */
export function cookieValue(res: SupertestResponse, name: string): string | undefined {
  const headers = res.headers["set-cookie"] as unknown as string[] | undefined;
  const match = (headers ?? []).find((h) => h.startsWith(`${name}=`));
  if (!match) return undefined;
  const pair = match.split(";")[0] ?? match;
  return decodeURIComponent(pair.slice(name.length + 1));
}

/** All cookie NAMES set on a response — for the portal-isolation assertions. */
export function setCookieNames(res: SupertestResponse): string[] {
  const headers = res.headers["set-cookie"] as unknown as string[] | undefined;
  return (headers ?? []).map((h) => h.split("=")[0] ?? "");
}

/** Attach the same cookie/header pair the browser client sends on mutations. */
export function asSession(
  portal: Portal,
  session: Pick<Awaited<ReturnType<typeof signedUpOn>>, "access" | "csrf">,
) {
  return (test: SupertestRequest): void => {
    test.set("Cookie", [
      `jp_${portal}_at=${session.access}`,
      `jp_${portal}_csrf=${session.csrf}`,
    ]);
    test.set("X-CSRF-Token", session.csrf);
  };
}

/**
 * The `token=` query value from the most recent mail whose subject matches.
 * Used by Task 9's step-up tests; here so both of them share one extractor and
 * one narrowing.
 */
export function linkTokenFor(email: string, subjectPattern: RegExp): string {
  const mail = [...outbox].reverse().find((m) => m.to === email && subjectPattern.test(m.subject));
  if (!mail) throw new Error(`no matching mail to ${email}`);
  const raw = /token=([^\s&]+)/.exec(mail.text)?.[1];
  if (!raw) throw new Error(`mail to ${email} carries no token`);
  return decodeURIComponent(raw);
}

const sharedApp = buildApp();

/**
 * Registers, verifies and logs in an account, returning its session material.
 *
 * Recruiters are APPROVED by default. Phase 3A made recruiter registration
 * land in `status: "pending"`, and every suite that uses this helper is testing
 * something else — ownership, pagination, CSRF — so leaving them pending would
 * make `requireApproved` the thing 34 unrelated tests actually assert.
 *
 * Pass `{ approved: false }` to keep a recruiter pending; `approval.test.ts`
 * builds its own pending recruiters directly and is the suite that covers the
 * gate itself.
 */
export async function signedUpOn(
  portal: Portal,
  email: string,
  overrides?: Record<string, any>
): Promise<{ id: string; access: string; refresh: string; csrf: string }> {
  const password = "correct horse battery staple";
  const fullName = overrides?.fullName ?? "Signed Up";
  const approved = overrides?.approved ?? true;
  // Not a schema field — strip it so it cannot reach the register body.
  const { approved: _approved, ...registerOverrides } = overrides ?? {};

  await request(sharedApp)
    .post(`/api/v1/${portal}/auth/register`)
    .send({ fullName, email, password, ...registerOverrides });

  const code = await lastCodeFor(email);
  await request(sharedApp)
    .post(`/api/v1/${portal}/auth/verify-email`)
    .send({ email, code });

  if (portal === "recruiter" && approved) {
    await accountModel("recruiter").updateOne({ email }, { $set: { status: "active" } });
  }

  const res = await request(sharedApp)
    .post(`/api/v1/${portal}/auth/login`)
    .send({ email, password });

  const id = res.body.user.id;
  const access = cookieValue(res, `jp_${portal}_at`)!;
  const refresh = cookieValue(res, `jp_${portal}_rt`)!;
  const csrf = cookieValue(res, `jp_${portal}_csrf`)!;

  return { id, access, refresh, csrf };
}
