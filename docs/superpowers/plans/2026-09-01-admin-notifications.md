# Admin Alerts for New Work — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a pending recruiter's email verification flips null → set, every active admin is emailed the recruiter's name, the queue's pending count, and a link to the queue.

**Architecture:** One new template and one new service in the backend, wired into the two places `auth.service.ts` flips `emailVerifiedAt` (verify-email's atomic update and password-reset's verify-as-side-effect). Sending rides the existing fire-and-forget `dispatch()` so a mail failure can never fail the request that triggered it — the deliberate opposite of invite-admin, where the email is the deliverable.

**Tech Stack:** Express 5 services, Mongoose, the Brevo mailer seam (`setMailer`/`dispatch`/`sendRendered`), vitest + supertest with the capture-mailer harness (`tests/auth/helpers.ts`).

**Spec:** `docs/superpowers/specs/2026-09-01-admin-notifications-design.md`

## Global Constraints

- The notification must never make `verify-email` or `reset-password` fail — fire-and-forget at both layers (helper catches its own errors; each recipient's send is its own `dispatch()`).
- Notify only when `portal === "recruiter"` AND `status === "pending"` AND the flip is genuine (the pre-update read showed `emailVerifiedAt === null`).
- The waiting count uses the queue's own filter — `Recruiter.countDocuments({ status: "pending" })` — so the number matches what the admin sees on click-through.
- Recipients: `Admin.find({ status: "active" })`. Suspended admins get nothing.
- The template module stays free of `env()` — the console URL is built by the caller from `env().WEB_BASE_URL` (same reason as `renderPasswordSetupEmail`).
- No test may open a socket: mail goes through `installCaptureMailer()` / `setMailer`, and fire-and-forget sends are awaited with `vi.waitFor` (established pattern — see `lastCodeFor`).
- Backend imports include `.js`; no new dependencies; no new environment variables.
- The `updates.ts` release note ships in the SAME commit as the call-site wiring (AGENTS.md rule), not after.
- Run backend tests from the backend directory: `cd D:\job-portal-2.0\backend; npx vitest run tests/adminNotifications.test.ts`.
- No Co-Authored-By trailer in commit messages (repo convention).

---

### Task 1: The email template

**Files:**
- Modify: `backend/src/lib/emailTemplates.ts` (add `ADMIN_WRAPPER` + `renderAdminPendingEmail` after `renderRecruiterDeniedEmail`, around line 180; `escapeHtml` already exists in this module)
- Create: `backend/tests/adminNotifications.test.ts`

**Interfaces:**
- Consumes: `escapeHtml` (local to `emailTemplates.ts`).
- Produces: `renderAdminPendingEmail(fullName: string, email: string, pendingCount: number, consoleUrl: string): { subject: string; html: string; text: string }` — used by Task 2.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/adminNotifications.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { renderAdminPendingEmail } from "../src/lib/emailTemplates.js";

const URL = "https://job-portal-debmalyo.vercel.app/admin/recruiters";

describe("renderAdminPendingEmail", () => {
  it("names the recruiter, the queue size, and the console link", () => {
    const r = renderAdminPendingEmail("Mira Patel", "mira@northstar.test", 3, URL);

    expect(r.subject).toBe("New recruiter waiting for review");
    expect(r.text).toContain("Mira Patel");
    expect(r.text).toContain("mira@northstar.test");
    expect(r.text).toContain("3 recruiters");
    expect(r.text).toContain(URL);
  });

  it("uses the singular for a queue of one", () => {
    const r = renderAdminPendingEmail("Mira Patel", "mira@northstar.test", 1, URL);

    expect(r.text).toContain("is 1 recruiter");
  });

  it("escapes a hostile name at the point of interpolation", () => {
    // The denial-reason rule: free text a human typed is escaped where it
    // lands, not trusted because "a user wrote it".
    const r = renderAdminPendingEmail('<script>alert("x")</script>', "x@y.test", 1, URL);

    expect(r.html).not.toContain("<script>");
    expect(r.html).toContain("&lt;script&gt;");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd D:\job-portal-2.0\backend; npx vitest run tests/adminNotifications.test.ts`
Expected: FAIL — `renderAdminPendingEmail` is not exported (import error).

- [ ] **Step 3: Write the implementation**

In `backend/src/lib/emailTemplates.ts`, add after `renderRecruiterDeniedEmail` (the module's local `Rendered` interface and `escapeHtml` are reused; do not export either):

```ts
/**
 * P1 of the console automation program: the work notification sent to every
 * active admin when a pending recruiter verifies their email.
 *
 * Owns a wrapper rather than sharing WRAPPER, because that one closes with
 * "if you did not request this, you can ignore this email" — the footer of a
 * security transaction. This is the opposite kind of mail: a notification to
 * the platform's operator that work is waiting. A footer telling the admin
 * to ignore the email is the one sentence guaranteed to be read.
 *
 * `consoleUrl` is built by the caller from `WEB_BASE_URL` so this module
 * stays free of `env()` — a module-scope config read would run at import
 * time, before the test setup has an environment to read (the same reason
 * as `renderPasswordSetupEmail`).
 */
export function renderAdminPendingEmail(
  fullName: string,
  email: string,
  pendingCount: number,
  consoleUrl: string,
): Rendered {
  const waiting = pendingCount === 1 ? "is 1 recruiter" : `are ${pendingCount} recruiters`;
  return {
    subject: "New recruiter waiting for review",
    html: ADMIN_WRAPPER(
      `<h1 style="font-size:1.25rem">New recruiter waiting for review</h1><p><strong>${escapeHtml(fullName)}</strong> (${escapeHtml(email)}) just verified their email and is waiting for approval.</p><p>There ${waiting} in the queue.</p><p><a href="${consoleUrl}" style="color:#1a1a1a;font-weight:600">Review the queue</a></p><p style="font-size:.8125rem;color:#6b6b6b">Or paste this address into your browser:<br>${consoleUrl}</p>`,
    ),
    text: `New recruiter waiting for review\n\n${fullName} (${email}) just verified their email and is waiting for approval.\n\nThere ${waiting} in the queue.\n\nReview the queue: ${consoleUrl}\n`,
  };
}

const ADMIN_WRAPPER = (body: string): string =>
  `<div style="font-family:system-ui,sans-serif;max-width:32rem;margin:0 auto;padding:2rem;color:#1a1a1a">${body}</div>`;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd D:\job-portal-2.0\backend; npx vitest run tests/adminNotifications.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```
git add backend/src/lib/emailTemplates.ts backend/tests/adminNotifications.test.ts
git commit -m "feat(api): the admin work-notification email template"
```

---

### Task 2: The notifyAdmins service

**Files:**
- Create: `backend/src/services/notification.service.ts`
- Modify: `backend/tests/adminNotifications.test.ts` (append a describe block)

**Interfaces:**
- Consumes: `renderAdminPendingEmail` from Task 1; `Admin` (`backend/src/models/admin.model.js`), `Recruiter` (`backend/src/models/recruiter.model.js`), `env()` (`backend/src/config/env.js` — `WEB_BASE_URL`), `dispatch` + `sendRendered` (`backend/src/lib/mailer.js`), `logger` (`backend/src/lib/logger.js`).
- Produces: `notifyAdminsOfPendingRecruiter(recruiter: { fullName: string; email: string }): Promise<void>` — **never rejects**; consumed by Task 3.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/adminNotifications.test.ts` (extend the imports at the top of the file with exactly these — do NOT add imports later tasks use, `tsconfig.test.json` typechecks this file and unused imports fail it):

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Admin } from "../src/models/admin.model.js";
import { Recruiter } from "../src/models/recruiter.model.js";
import { setMailer } from "../src/lib/mailer.js";
import { notifyAdminsOfPendingRecruiter } from "../src/services/notification.service.js";
import { installCaptureMailer, outbox } from "./auth/helpers.js";
```

```ts
// authFields require only email and fullName; passwordHash and status default
// (null / "active"), so these are complete documents, not partial ones.
async function activeAdmin(email: string): Promise<void> {
  await Admin.create({ email, fullName: "Admin", status: "active" });
}

describe("notifyAdminsOfPendingRecruiter", () => {
  beforeEach(() => installCaptureMailer());

  it("mails every active admin and nobody else", async () => {
    await activeAdmin("a1@admins.test");
    await activeAdmin("a2@admins.test");
    await Admin.create({ email: "gone@admins.test", fullName: "Gone", status: "suspended" });

    await notifyAdminsOfPendingRecruiter({ fullName: "Mira Patel", email: "mira@northstar.test" });

    await vi.waitFor(() => expect(outbox.length).toBe(2));
    expect(outbox.map((m) => m.to).sort()).toEqual(["a1@admins.test", "a2@admins.test"]);
    expect(outbox[0]?.subject).toBe("New recruiter waiting for review");
    expect(outbox[0]?.text).toContain("Mira Patel");
  });

  it("counts the queue with the queue's own filter", async () => {
    await activeAdmin("a@admins.test");
    await Recruiter.create({ email: "p1@r.test", fullName: "P One", status: "pending" });
    await Recruiter.create({ email: "p2@r.test", fullName: "P Two", status: "pending" });
    await Recruiter.create({ email: "p3@r.test", fullName: "P Three", status: "active" });

    await notifyAdminsOfPendingRecruiter({ fullName: "Mira Patel", email: "mira@northstar.test" });

    await vi.waitFor(() => expect(outbox.length).toBe(1));
    expect(outbox[0]?.text).toContain("2 recruiters");
  });

  it("never rejects when the mailer does", async () => {
    await activeAdmin("a@admins.test");
    setMailer({
      async send() {
        throw new Error("brevo down");
      },
    });

    await expect(
      notifyAdminsOfPendingRecruiter({ fullName: "Mira Patel", email: "mira@northstar.test" }),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd D:\job-portal-2.0\backend; npx vitest run tests/adminNotifications.test.ts`
Expected: FAIL — `notification.service.js` does not exist (import error).

- [ ] **Step 3: Write the implementation**

Create `backend/src/services/notification.service.ts`:

```ts
import { Admin } from "../models/admin.model.js";
import { Recruiter } from "../models/recruiter.model.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { dispatch, sendRendered } from "../lib/mailer.js";
import { renderAdminPendingEmail } from "../lib/emailTemplates.js";

/**
 * P1 of the console automation program: tell every active admin that a
 * pending recruiter just became real work.
 *
 * The whole function is fire-and-forget by contract — a notification is a
 * courtesy, and the verification that triggered it is the product, so
 * nothing here may reject into a caller that otherwise succeeded. Two layers
 * hold that up: the outer try/catch (a query or render failure logs and
 * stops), and one `dispatch()` per recipient (a bounce for one admin neither
 * blocks the other sends nor touches the request). This is the opposite
 * posture from invite-admin, where the email IS the deliverable and a mail
 * failure fails the request.
 *
 * The pending count uses the queue's own filter — `{ status: "pending" }` —
 * so the number in the mail matches the number the admin sees on the screen
 * the link opens.
 */
export async function notifyAdminsOfPendingRecruiter(recruiter: {
  fullName: string;
  email: string;
}): Promise<void> {
  try {
    const [admins, pendingCount] = await Promise.all([
      Admin.find({ status: "active" }).select("email"),
      Recruiter.countDocuments({ status: "pending" }),
    ]);
    const rendered = renderAdminPendingEmail(
      recruiter.fullName,
      recruiter.email,
      pendingCount,
      `${env().WEB_BASE_URL}/admin/recruiters`,
    );
    for (const admin of admins) {
      dispatch(sendRendered(admin.email, rendered));
    }
  } catch (error) {
    logger.error({ err: error }, "admin notification failed");
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd D:\job-portal-2.0\backend; npx vitest run tests/adminNotifications.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```
git add backend/src/services/notification.service.ts backend/tests/adminNotifications.test.ts
git commit -m "feat(api): notifyAdmins - fan-out to active admins, failure-isolated"
```

---

### Task 3: Wire the two verification flips (and ship the docs with them)

**Files:**
- Modify: `backend/src/services/auth.service.ts` — two insertions:
  - `verifyEmail`: after `await clearOtpBudget(portal, otp.subjectId, "verify_email");` (around line 166), before `return target;`
  - `resetPassword`: after `await clearOtpBudget(portal, otp.subjectId, "reset_password");` (around line 444), at the end of the function
  - Plus the import: `import { notifyAdminsOfPendingRecruiter } from "./notification.service.js";`
- Modify: `backend/tests/adminNotifications.test.ts` (append route-level tests)
- Modify: `ARCHITECTURE.md` (the polling section, after the console-clock paragraph ending around line 708)
- Modify: `frontend/src/data/updates.ts` (new newest-first entry)

**Interfaces:**
- Consumes: `notifyAdminsOfPendingRecruiter` from Task 2.
- Produces: nothing consumed downstream. This task is the feature.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/adminNotifications.test.ts`. First extend the imports again (these are the ones this task's tests use; the file already carries Task 2's):

```ts
import request from "supertest";

import { buildApp } from "../src/app.js";
import { lastCodeFor } from "./auth/helpers.js";
```

Then append the tests:

```ts
const app = buildApp();
const PASSWORD = "correct horse battery staple";

// Each test registers fresh addresses: the register route is rate-limited
// 10/hour per ip+email, and shared addresses would bleed across tests.
async function registerRecruiter(email: string): Promise<void> {
  const res = await request(app)
    .post("/api/v1/recruiter/auth/register")
    .send({ fullName: "Mira Patel", email, password: PASSWORD });
  expect(res.status).toBe(201);
}

describe("the verification flip notifies the admins", () => {
  beforeEach(() => installCaptureMailer());

  it("mails the admin when a pending recruiter verifies their email", async () => {
    await activeAdmin("boss@admins.test");
    await registerRecruiter("verify@r.test");
    const code = await lastCodeFor("verify@r.test");

    const res = await request(app)
      .post("/api/v1/recruiter/auth/verify-email")
      .send({ email: "verify@r.test", code });

    expect(res.status).toBe(200);
    await vi.waitFor(() => {
      expect(
        outbox.some((m) => m.to === "boss@admins.test" && m.subject === "New recruiter waiting for review"),
      ).toBe(true);
    });
  });

  it("does not mail for a seeker's verification", async () => {
    await activeAdmin("boss@admins.test");
    await request(app)
      .post("/api/v1/seeker/auth/register")
      .send({ fullName: "Seeker", email: "s@seekers.test", password: PASSWORD });
    const code = await lastCodeFor("s@seekers.test");

    const res = await request(app)
      .post("/api/v1/seeker/auth/verify-email")
      .send({ email: "s@seekers.test", code });

    expect(res.status).toBe(200);
    // Settle the seeker's own mail first (the register code), then a short
    // grace window for any wrongly-dispatched admin notification, then the
    // absence assertion — the same pattern reset.test.ts uses for negatives.
    await vi.waitFor(() => expect(outbox.some((m) => m.to === "s@seekers.test")).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(outbox.some((m) => m.to === "boss@admins.test")).toBe(false);
  });

  it("still verifies when the notification mail fails", async () => {
    await activeAdmin("boss@admins.test");
    await registerRecruiter("maildown@r.test");
    const code = await lastCodeFor("maildown@r.test");

    // Swap to a throwing mailer AFTER the code is captured — the
    // notification's dispatch must swallow this without hurting the request.
    setMailer({
      async send() {
        throw new Error("brevo down");
      },
    });

    const res = await request(app)
      .post("/api/v1/recruiter/auth/verify-email")
      .send({ email: "maildown@r.test", code });

    expect(res.status).toBe(200);
  });

  it("mails when an unverified recruiter resets their password (the other flip)", async () => {
    await activeAdmin("boss@admins.test");
    await registerRecruiter("late@r.test");
    // Deliberately NO verify-email step: the account is unverified.

    await request(app).post("/api/v1/recruiter/auth/forgot-password").send({ email: "late@r.test" });
    const code = await lastCodeFor("late@r.test"); // the reset code is now the latest
    const res = await request(app)
      .post("/api/v1/recruiter/auth/reset-password")
      .send({ email: "late@r.test", code, newPassword: "an entirely new passphrase" });

    expect(res.status).toBe(200);
    await vi.waitFor(() => {
      expect(
        outbox.some((m) => m.to === "boss@admins.test" && m.subject === "New recruiter waiting for review"),
      ).toBe(true);
    });
  });

  it("does not mail again when the same recruiter later resets their password", async () => {
    await activeAdmin("boss@admins.test");
    await registerRecruiter("refire@r.test");
    const code = await lastCodeFor("refire@r.test");
    await request(app)
      .post("/api/v1/recruiter/auth/verify-email")
      .send({ email: "refire@r.test", code });
    await vi.waitFor(() =>
      expect(outbox.filter((m) => m.to === "boss@admins.test").length).toBe(1),
    );

    // Already verified: the reset's conditional spread does not flip anything,
    // so the admin must hear nothing the second time.
    await request(app).post("/api/v1/recruiter/auth/forgot-password").send({ email: "refire@r.test" });
    const resetCode = await lastCodeFor("refire@r.test");
    const res = await request(app)
      .post("/api/v1/recruiter/auth/reset-password")
      .send({ email: "refire@r.test", code: resetCode, newPassword: "an entirely new passphrase" });

    expect(res.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(outbox.filter((m) => m.to === "boss@admins.test").length).toBe(1);
  });

  it("does not mail for a recruiter the queue already denied", async () => {
    await activeAdmin("boss@admins.test");
    await registerRecruiter("denied@r.test"); // pending, unverified
    // Denied without ever verifying: suspended AND still unverified. The
    // reset would flip the bit, but the account is no longer the queue's
    // work — status guards it out.
    await Recruiter.updateOne({ email: "denied@r.test" }, { $set: { status: "suspended" } });

    await request(app).post("/api/v1/recruiter/auth/forgot-password").send({ email: "denied@r.test" });
    const code = await lastCodeFor("denied@r.test");
    const res = await request(app)
      .post("/api/v1/recruiter/auth/reset-password")
      .send({ email: "denied@r.test", code, newPassword: "an entirely new passphrase" });

    expect(res.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(outbox.some((m) => m.to === "boss@admins.test")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd D:\job-portal-2.0\backend; npx vitest run tests/adminNotifications.test.ts`
Expected: FAIL — the notification tests find no admin mail (`vi.waitFor` timeout); the two "does not mail" negatives may already pass (their value is guarding the wiring against regressions).

- [ ] **Step 3: Wire the call sites**

In `backend/src/services/auth.service.ts`, add the import with the other service imports:

```ts
import { notifyAdminsOfPendingRecruiter } from "./notification.service.js";
```

In `verifyEmail`, between `await clearOtpBudget(portal, otp.subjectId, "verify_email");` and `return target;`:

```ts
  // P1 of the console automation program. The flip null → verified on a
  // pending recruiter is the moment work enters the queue for real — an
  // unverified signup is indistinguishable from an abandoned one, and
  // notifying on raw registration would let anyone spray every admin inbox
  // from the signup form. `account` is the PRE-update read, so its null is
  // the proof this redemption is the genuine flip. Fire-and-forget: the
  // notification must never fail a verification that succeeded.
  if (portal === "recruiter" && target.status === "pending" && account?.emailVerifiedAt === null) {
    void notifyAdminsOfPendingRecruiter({ fullName: target.fullName, email: target.email });
  }
```

In `resetPassword`, after `await clearOtpBudget(portal, otp.subjectId, "reset_password");` at the function's end:

```ts
  // The reset path's verify-as-side-effect is the same null → verified flip
  // as the one in verifyEmail, so it notifies too — "forgot my password
  // before verifying" must not be the one route that skips telling the
  // admins the account is now real. `target` here is the PRE-update read
  // (the conditional spread in the update is what did the flipping).
  if (portal === "recruiter" && target.status === "pending" && target.emailVerifiedAt === null) {
    void notifyAdminsOfPendingRecruiter({ fullName: target.fullName, email: target.email });
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd D:\job-portal-2.0\backend; npx vitest run tests/adminNotifications.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Run the neighbouring auth suites**

The two call sites sit inside flows other suites depend on; prove nothing regressed:

Run: `cd D:\job-portal-2.0\backend; npx vitest run tests/auth/ tests/approval.test.ts tests/adminProvisioning.test.ts`
Expected: PASS.

- [ ] **Step 6: Ship the docs in the same commit**

In `ARCHITECTURE.md`, append this paragraph to the polling section, directly after the console-clock paragraph that ends “…read as a stray timer beside the Invite admin action.”:

```markdown
The console's reads are pull; its one urgent edge is now push. When a pending
recruiter's `emailVerifiedAt` flips — through verify-email or password
reset's verify-as-side-effect, the only two places it can — every active
admin is mailed the recruiter's name, the queue's own pending count, and a
link to the queue (`notification.service.ts`). The send is fire-and-forget
with per-recipient isolation: a courtesy must never fail the request that
triggered it, the opposite posture from invite-admin, where the email is the
deliverable. Registration itself notifies nothing — an unverified signup is
indistinguishable from an abandoned one, and notifying on it would let anyone
spray every admin inbox from the signup form.
```

In `frontend/src/data/updates.ts`, add a new newest-first entry at the top of `PLATFORM_UPDATES`:

```ts
  {
    id: "admin-new-work-alerts",
    date: "2026-09-01",
    kind: "Feature",
    title: "The console now tells admins when a recruiter is waiting",
    summary:
      "When a new recruiter verifies their email and joins the approval queue, every active admin gets an email — the recruiter's name, how many are waiting, and a link straight to the queue.",
    details: [
      "The email fires only once the recruiter has verified their address — the moment a signup becomes a real person rather than an abandoned form.",
      "If email delivery fails, nothing else is affected: the verification still succeeds and the queue still updates; the alert simply does not arrive.",
    ],
  },
```

- [ ] **Step 7: Run the updates suite**

Run: `cd D:\job-portal-2.0\frontend; npx vitest run tests/updates.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 8: Commit (feature + release note together)**

```
git add backend/src/services/auth.service.ts backend/tests/adminNotifications.test.ts ARCHITECTURE.md frontend/src/data/updates.ts
git commit -m "feat(api): a verified pending recruiter now alerts the admins"
```

Suggested message body (same style as the plan's tasks above — root cause prose, no trailer):

```
feat(api): a verified pending recruiter now alerts the admins

P1 of the console automation program. The console's reads poll themselves,
but nothing told an admin that work had arrived - the triage band exists
because a human had to go and look. Now the flip of a pending recruiter's
emailVerifiedAt (verify-email, or password reset's verify-as-side-effect -
the only two places it happens) mails every active admin the name, the
queue's own pending count, and a link to the queue.

Registration itself notifies nothing: it requires no proof of address, and
notifying on it would let anyone spray every admin inbox from the signup
form. Verification is the moment the signup becomes a real person.

The send is fire-and-forget with per-recipient isolation - a courtesy never
fails the request that triggered it, the opposite posture from invite-admin,
where the email is the deliverable. ARCHITECTURE.md records the path; the
release note ships in this commit.
```

---

### Task 4: Full verification battery

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Typecheck and lint the backend**

Run: `cd D:\job-portal-2.0; npm run typecheck --workspace @jobportal/api; npm run lint --workspace @jobportal/api`
Expected: both exit 0.

- [ ] **Step 2: Run the full battery**

Run: `cd D:\job-portal-2.0; npm run ci; npm run audit:prod`
Expected: exit 0 — all three suites, typecheck, lint, colour gate, build, audit.
(If a single unrelated test flakes under load, re-run it in isolation before drawing conclusions — the suite has a known under-load flake on this 6GB machine; stop dev servers first if any are running.)

- [ ] **Step 3: `git diff --check` and tree state**

Run: `cd D:\job-portal-2.0; git diff --check; git status --short`
Expected: no whitespace errors; the tree clean (all changes committed across Tasks 1–3).

- [ ] **Step 4: Report**

Report the battery results to the user and ask before pushing — a push deploys both hosts (Vercel + Render).
