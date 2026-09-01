# Guardrailed Approval Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Behind the `autoApproveRecruiterSignups` flag (off), a recruiter whose signup email's domain matches an existing company's website domain is approved automatically at email verification; everyone else queues for a human exactly as today, with signal badges to speed the review.

**Architecture:** Shared gains pure domain utilities (email-domain extraction, free-mail classification, website-host matching) plus the new event/feed/DTO kinds. The backend extracts the activation core out of `approveRecruiter`, adds an `autoApproveRecruiter` variant recording its own `auto_approved` event, and wires it at both verification flips ahead of the P1 admin notification. The activity feed gains a `recruiter_auto_approved` kind; the recruiters monitoring table gains the signal badges.

**Tech Stack:** Express 5 services, Mongoose, Zod types in shared, the existing console primitives.

**Spec:** `docs/superpowers/specs/2026-09-02-guardrailed-approval-automation-design.md`

## Global Constraints

- The flag is the kill switch: **off = today's behavior byte for byte** (P1's tests are the pin).
- Auto-approve requires the domain match. No match, flag off, or auto-approval failure → the human queue path, exactly as P1 shipped it.
- The human `approveRecruiter` path's behavior is unchanged (its tests are the pin).
- Matching is local and strict: lowercase, strip scheme and leading `www.`, exact hostname equality. No DNS, no subdomain heuristics.
- An auto-approval = the guarded pending→active flip + approved email + orphan sweep + an `auto_approved` account event (actor null, reason `email domain matches <Company>`).
- No admin email on auto-approval (visibility = the event + the feed).
- Backend tests run from `backend/`; shared from `packages/shared`; frontend from `frontend/`. Rebuild shared (`npm run build --workspace @jobportal/shared`) after shared-only edits before frontend suites.
- No Co-Authored-By trailer in commit messages.

---

### Task 1: Shared — the domain utilities and the new kinds

**Files:**
- Create: `packages/shared/src/signupSignals.ts`
- Modify: `packages/shared/src/index.ts` (export), `packages/shared/src/admin.ts` (kinds + DTO fields)
- Test: `packages/shared/tests/signupSignals.test.ts`

**Interfaces:**
- Produces: `FREE_MAIL_DOMAINS`, `emailDomainOf(email: string): string`, `websiteHostOf(url: string): string`, `isFreeMailAddress(email: string): boolean`, `signupDomainMatches(email: string, website: string): boolean`; `AccountEventDto["kind"]` now includes `"auto_approved"`; `ADMIN_ACTIVITY_KINDS` now includes `"recruiter_auto_approved"`; `AdminRecruiterDto` gains `emailDomainKind: "free" | "custom"` and `matchingCompany: string | null`.

- [ ] **Step 1: Write the failing tests**

Create `packages/shared/tests/signupSignals.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  emailDomainOf,
  isFreeMailAddress,
  signupDomainMatches,
  websiteHostOf,
} from "../src/signupSignals.js";

describe("emailDomainOf", () => {
  it("extracts the domain, lowercased", () => {
    expect(emailDomainOf("Mira@NorthStarLabs.Example")).toBe("northstarlabs.example");
  });

  it("answers an empty string for an address with no@", () => {
    expect(emailDomainOf("not-an-address")).toBe("");
  });
});

describe("websiteHostOf", () => {
  it("strips scheme and a leading www, lowercased", () => {
    expect(websiteHostOf("https://WWW.NorthStarLabs.Example/about")).toBe("northstarlabs.example");
    expect(websiteHostOf("http://careers.example.co.in")).toBe("careers.example.co.in");
  });

  it("answers an empty string for junk", () => {
    expect(websiteHostOf("")).toBe("");
    expect(websiteHostOf("not a url")).toBe("");
  });
});

describe("isFreeMailAddress", () => {
  it("classifies the common providers", () => {
    expect(isFreeMailAddress("someone@gmail.com")).toBe(true);
    expect(isFreeMailAddress("someone@outlook.com")).toBe(true);
    expect(isFreeMailAddress("someone@proton.me")).toBe(true);
    expect(isFreeMailAddress("someone@northstarlabs.example")).toBe(false);
  });
});

describe("signupDomainMatches", () => {
  it("matches an email domain to a company website host", () => {
    expect(signupDomainMatches("mira@northstarlabs.example", "https://www.northstarlabs.example")).toBe(true);
  });

  it("does not match across domains, subdomains, or empties", () => {
    expect(signupDomainMatches("mira@northstarlabs.example", "https://northstar.io")).toBe(false);
    // A subdomain of the company site is NOT the company's domain — strict
    // by design; the human queue is the fallback for every near-miss.
    expect(signupDomainMatches("mira@jobs.northstarlabs.example", "https://northstarlabs.example")).toBe(false);
    expect(signupDomainMatches("mira@northstarlabs.example", "")).toBe(false);
    expect(signupDomainMatches("", "https://northstarlabs.example")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd D:\job-portal-2.0\packages\shared; npx vitest run tests/signupSignals.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `packages/shared/src/signupSignals.ts`:

```ts
/**
 * The signup trust signals — P4 of the console automation program.
 *
 * At the verification flip a recruiter has a name, an email, and proof they
 * control that email — nothing else. The one strong signal computable from
 * that is ownership of an address at an employer's own domain, so these
 * utilities exist to answer exactly one question strictly: does this email
 * live at a domain this platform already knows as a company's website?
 *
 * Strict by design: exact hostname equality after normalization, no
 * subdomain credit, no DNS. Every near-miss falls back to the human queue,
 * which costs nothing.
 */

/** The common free-mail providers. One list, one authority. */
export const FREE_MAIL_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
] as const;

export function emailDomainOf(email: string): string {
  const at = email.lastIndexOf("@");
  if (at === -1) return "";
  return email.slice(at + 1).trim().toLowerCase();
}

export function websiteHostOf(url: string): string {
  if (!url) return "";
  try {
    const parsed = new URL(url.includes("://") ? url : `https://${url}`);
    const host = parsed.hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return "";
  }
}

export function isFreeMailAddress(email: string): boolean {
  return (FREE_MAIL_DOMAINS as readonly string[]).includes(emailDomainOf(email));
}

/** The bar for auto-approval: the email lives at a known company's website host. */
export function signupDomainMatches(email: string, website: string): boolean {
  const emailDomain = emailDomainOf(email);
  if (!emailDomain) return false;
  const websiteHost = websiteHostOf(website);
  return websiteHost !== "" && emailDomain === websiteHost;
}
```

In `packages/shared/src/admin.ts`:
- Extend the activity kinds list (line ~197):

```ts
export const ADMIN_ACTIVITY_KINDS = [
  "recruiter_registered",
  "recruiter_auto_approved",
  "job_posted",
  "company_created",
  "application_submitted",
] as const;
```

- Extend `AdminRecruiterDto` (after `createdAt`):

```ts
  /** P4's assisted-review signals: the email's domain class, and the company
      whose website domain the email matches, if any. */
  emailDomainKind: "free" | "custom";
  matchingCompany: string | null;
```

- Extend `AccountEventDto["kind"]` to `"approved" | "auto_approved" | "denied" | "suspended" | "reinstated"`.

Add to `packages/shared/src/index.ts`: `export * from "./signupSignals.js";`

- [ ] **Step 4: Run to verify pass, rebuild shared, commit**

Run: `cd D:\job-portal-2.0\packages\shared; npx vitest run tests/signupSignals.test.ts` — PASS.
Run: `cd D:\job-portal-2.0; npm run build --workspace @jobportal/shared`

```
git add packages/shared/src/signupSignals.ts packages/shared/src/index.ts packages/shared/src/admin.ts packages/shared/tests/signupSignals.test.ts
git commit -m "feat(shared): the signup domain signals and the auto-approved kinds"
```

---

### Task 2: Backend — the activation core and the signal service

**Files:**
- Modify: `backend/src/models/accountEvent.model.ts` (kind enum)
- Modify: `backend/src/services/oversight.service.ts` (recordAccountEvent's kind union)
- Modify: `backend/src/services/approval.service.ts` (extract the core; add `autoApproveRecruiter`)
- Create: `backend/src/services/signupSignals.service.ts` (`matchingCompanyForEmail`)
- Test: `backend/tests/autoApprove.test.ts`

**Interfaces:**
- Consumes: Task 1's utils; `flagEnabled` is NOT used here (the flip sites decide).
- Produces: `autoApproveRecruiter(id: string, matchedCompany: string): Promise<boolean>` (false = raced or already decided); `matchingCompanyForEmail(email: string): Promise<string | null>` (the company NAME whose website domain matches).

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/autoApprove.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";

import { Company } from "../src/models/company.model.js";
import { Recruiter } from "../src/models/recruiter.model.js";
import { AccountEvent } from "../src/models/accountEvent.model.js";
import { autoApproveRecruiter, approveRecruiter } from "../src/services/approval.service.js";
import { matchingCompanyForEmail } from "../src/services/signupSignals.service.js";
import { installCaptureMailer, outbox } from "./auth/helpers.js";

async function pendingRecruiter(email: string) {
  return Recruiter.create({
    email,
    fullName: "Pending One",
    passwordHash: "x",
    emailVerifiedAt: new Date(),
    status: "pending",
  });
}

describe("autoApproveRecruiter", () => {
  beforeEach(() => installCaptureMailer());

  it("activates, mails the approval, and records its own event kind", async () => {
    const recruiter = await pendingRecruiter("mira@northstarlabs.example");

    const result = await autoApproveRecruiter(String(recruiter._id), "Northstar Labs");

    expect(result).toBe(true);
    expect((await Recruiter.findById(recruiter._id))?.status).toBe("active");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(outbox.some((m) => m.to === "mira@northstarlabs.example")).toBe(true);

    const events = await AccountEvent.find({ subjectId: recruiter._id });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "auto_approved",
      reason: "email domain matches Northstar Labs",
      actorAdminId: null,
    });
  });

  it("returns false for an already-decided account, recording nothing", async () => {
    const recruiter = await pendingRecruiter("raced@r.test");
    await Recruiter.updateOne({ _id: recruiter._id }, { $set: { status: "active" } });

    expect(await autoApproveRecruiter(String(recruiter._id), "Any Co")).toBe(false);
    expect(await AccountEvent.countDocuments({ subjectId: recruiter._id })).toBe(0);
  });

  it("leaves the human path's event kind untouched", async () => {
    const recruiter = await pendingRecruiter("human@r.test");

    await approveRecruiter(String(recruiter._id));

    const events = await AccountEvent.find({ subjectId: recruiter._id });
    expect(events[0]).toMatchObject({ kind: "approved" });
  });
});

describe("matchingCompanyForEmail", () => {
  beforeEach(async () => {
    await Promise.all([Company.init(), Recruiter.init()]);
  });

  it("finds the company whose website domain matches", async () => {
    await Company.create({
      name: "Northstar Labs",
      description: "d",
      location: "Bengaluru",
      website: "https://www.northstarlabs.example",
      userId: null,
    });

    expect(await matchingCompanyForEmail("mira@northstarlabs.example")).toBe("Northstar Labs");
    expect(await matchingCompanyForEmail("someone@gmail.com")).toBeNull();
    expect(await matchingCompanyForEmail("stranger@unknown.example")).toBeNull();
  });
});
```

(If `Company.create` rejects `userId: null` or `website` formatting differs, match the shapes `assign-catalog-ownership.test.ts` uses — read it first.)

- [ ] **Step 2: Run to verify failure**

Run: `cd D:\job-portal-2.0\backend; npx vitest run tests/autoApprove.test.ts`
Expected: FAIL — `autoApproveRecruiter` and the signal service do not exist.

- [ ] **Step 3: Implement**

In `backend/src/models/accountEvent.model.ts`, extend the enum (and its doc comment's mention of the four kinds):

```ts
export const ACCOUNT_EVENT_KINDS = [
  "approved",
  "auto_approved",
  "denied",
  "suspended",
  "reinstated",
] as const;
```

In `backend/src/services/oversight.service.ts`, widen `recordAccountEvent`'s `kind` parameter to `"approved" | "auto_approved" | "denied" | "suspended" | "reinstated"` and update its doc line.

In `backend/src/services/approval.service.ts` — extract the shared activation core and add the auto variant:

```ts
/**
 * The activation core both approval paths run: the guarded pending→active
 * flip (raced decisions send exactly one mail and one event), the account
 * event, the approval mail, and the orphan sweep. The event kind and reason
 * are the caller's — that is the whole difference between a human's
 * "approved" and the automation's "auto_approved".
 */
async function activateRecruiter(
  id: string,
  eventKind: "approved" | "auto_approved",
  reason: string | null,
  adminId: string | null,
): Promise<boolean> {
  const exists = await Recruiter.exists({ _id: id });
  if (!exists) throw AppError.notFound("NOT_FOUND", "No such recruiter.");

  const result = await Recruiter.updateOne(
    { _id: id, status: "pending" },
    { $set: { status: "active" } },
  );
  if (result.matchedCount === 0) return false; // already decided

  await recordAccountEvent("recruiter", id, eventKind, reason, adminId);
  const account = await Recruiter.findById(id).select("email");
  if (account) dispatch(sendRendered(account.email, renderRecruiterApprovedEmail()));

  // P2's sweep, shared by both paths: one more active recruiter is one more
  // pair of hands for any orphaned company.
  void sweepOrphanedCompanies().catch((error) => {
    logger.error({ err: error }, "orphan sweep failed");
  });

  logger.info({ recruiterId: id, eventKind }, "recruiter activated");
  return true;
}

export async function approveRecruiter(id: string, adminId: string | null = null): Promise<void> {
  await activateRecruiter(id, "approved", null, adminId);
}

/**
 * P4's automation: approval without a human, earned by an email at an
 * employer's own domain. The matched company names the reason, because an
 * audit trail that cannot say WHY the gate opened is not an audit trail.
 */
export async function autoApproveRecruiter(id: string, matchedCompany: string): Promise<boolean> {
  return activateRecruiter(id, "auto_approved", `email domain matches ${matchedCompany}`, null);
}
```

(Delete the old `approveRecruiter` body that this core replaces; keep the function's exported signature and its doc comment adapted.)

Create `backend/src/services/signupSignals.service.ts`:

```ts
import { signupDomainMatches } from "@jobportal/shared";

import { Company } from "../models/company.model.js";

/**
 * P4's one strong signal: does this signup email live at the website domain
 * of a company already on the platform? Local and strict — see the shared
 * utilities — and deliberately conservative: a genuinely new employer has no
 * company row and can never match.
 */
export async function matchingCompanyForEmail(email: string): Promise<string | null> {
  const companies = await Company.find({ website: { $ne: null } }).select("name website");
  for (const company of companies) {
    if (signupDomainMatches(email, company.website ?? "")) return company.name;
  }
  return null;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd D:\job-portal-2.0\backend; npx vitest run tests/autoApprove.test.ts tests/approval.test.ts tests/catalogOwnership.test.ts`
Expected: PASS — the new suite green, and the human-path and sweep suites untouched.

- [ ] **Step 5: Commit**

```
git add backend/src/models/accountEvent.model.ts backend/src/services/oversight.service.ts backend/src/services/approval.service.ts backend/src/services/signupSignals.service.ts backend/tests/autoApprove.test.ts
git commit -m "feat(api): the activation core, the auto-approved event, and the domain signal"
```

---

### Task 3: Backend — wire both flips and the feed kind

**Files:**
- Modify: `backend/src/services/auth.service.ts` (both P1 flip sites)
- Modify: `backend/src/services/adminConsole.service.ts` (`getActivity`)
- Test: `backend/tests/autoApprove.test.ts` (append the flip and feed tests)

**Interfaces:**
- Consumes: `flagEnabled("autoApproveRecruiterSignups")`, `matchingCompanyForEmail`, `autoApproveRecruiter` from Task 2.
- Produces: the end-to-end behavior; nothing downstream.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/autoApprove.test.ts` (extend imports: `request` from supertest, `buildApp`, `Admin`, `FeatureFlag` model, `flagEnabled`'s `setFlag`, `lastCodeFor`):

```ts
import request from "supertest";
import { buildApp } from "../src/app.js";
import { Admin } from "../src/models/admin.model.js";
import { setFlag } from "../src/services/flags.service.js";
import { getActivity } from "../src/services/adminConsole.service.js";
import { lastCodeFor } from "./auth/helpers.js";

const app = buildApp();
const PASSWORD = "correct horse battery staple";

async function registerAndVerifyRecruiter(email: string): Promise<void> {
  await request(app)
    .post("/api/v1/recruiter/auth/register")
    .send({ fullName: "Mira Patel", email, password: PASSWORD });
  const code = await lastCodeFor(email);
  const res = await request(app)
    .post("/api/v1/recruiter/auth/verify-email")
    .send({ email, code });
  expect(res.status).toBe(200);
}

describe("the auto-approval tier at the verification flip", () => {
  beforeEach(async () => {
    await Promise.all([Company.init(), Admin.init()]);
    installCaptureMailer();
    // The flag is the kill switch; each test sets the world it needs.
    await setFlag("autoApproveRecruiterSignups", false, null);
  });

  it("auto-approves a domain-matching signup when the flag is on", async () => {
    await setFlag("autoApproveRecruiterSignups", true, null);
    await Company.create({
      name: "Northstar Labs",
      description: "d",
      location: "Bengaluru",
      website: "https://www.northstarlabs.example",
      userId: null,
    });
    await Admin.create({ email: "boss@admins.test", fullName: "Boss", status: "active" });

    await registerAndVerifyRecruiter("mira@northstarlabs.example");

    const recruiter = await Recruiter.findOne({ email: "mira@northstarlabs.example" });
    expect(recruiter?.status).toBe("active");
    await new Promise((resolve) => setTimeout(resolve, 100));
    // The approval mail went to the recruiter; the admin got nothing.
    expect(outbox.some((m) => m.to === "mira@northstarlabs.example" && /approved/i.test(m.subject))).toBe(true);
    expect(outbox.some((m) => m.to === "boss@admins.test")).toBe(false);

    const activity = await getActivity();
    const item = activity.items.find((i) => i.kind === "recruiter_auto_approved");
    expect(item).toMatchObject({ label: "Mira Patel", detail: "Northstar Labs" });
  });

  it("queues a non-matching signup for the human even with the flag on", async () => {
    await setFlag("autoApproveRecruiterSignups", true, null);
    await Admin.create({ email: "boss@admins.test", fullName: "Boss", status: "active" });

    await registerAndVerifyRecruiter("unknown@fresh-employer.example");

    const recruiter = await Recruiter.findOne({ email: "unknown@fresh-employer.example" });
    expect(recruiter?.status).toBe("pending");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(outbox.some((m) => m.to === "boss@admins.test" && /waiting/i.test(m.subject))).toBe(true);
  });

  it("with the flag off, a domain-matching signup queues exactly as today", async () => {
    await Company.create({
      name: "Northstar Labs",
      description: "d",
      location: "Bengaluru",
      website: "https://www.northstarlabs.example",
      userId: null,
    });
    await Admin.create({ email: "boss@admins.test", fullName: "Boss", status: "active" });

    await registerAndVerifyRecruiter("mira@northstarlabs.example");

    const recruiter = await Recruiter.findOne({ email: "mira@northstarlabs.example" });
    expect(recruiter?.status).toBe("pending");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(outbox.some((m) => m.to === "boss@admins.test")).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd D:\job-portal-2.0\backend; npx vitest run tests/autoApprove.test.ts`
Expected: FAIL — the first new test finds status "pending" (no auto-approval wired).

- [ ] **Step 3: Implement the flip wiring**

In `backend/src/services/auth.service.ts`, at BOTH P1 flip sites, replace the notify-only block with the tier. In `verifyEmail` (the block that currently reads `if (portal === "recruiter" && target.status === "pending" && account?.emailVerifiedAt === null)`):

```ts
  // P4 of the console automation program. At the moment a pending recruiter
  // becomes real, the automation gets first refusal: if the flag is on and
  // the signup email lives at a known employer's website domain, the account
  // is approved now — the same activation a human click runs, with its own
  // event kind. Everyone else — new employers, free-mail addresses, the flag
  // off, or an automation failure — becomes the admins' work instead.
  if (portal === "recruiter" && target.status === "pending" && account?.emailVerifiedAt === null) {
    let autoApproved = false;
    try {
      if (await flagEnabled("autoApproveRecruiterSignups")) {
        const matchedCompany = await matchingCompanyForEmail(target.email);
        if (matchedCompany) {
          await autoApproveRecruiter(String(target._id), matchedCompany);
          autoApproved = true;
        }
      }
    } catch (error) {
      logger.error({ err: error }, "auto-approval failed; falling back to the queue");
    }
    if (!autoApproved) {
      void notifyAdminsOfPendingRecruiter({ fullName: target.fullName, email: target.email });
    }
  }
```

At the reset-password flip site, the identical block (its guard reads `target.emailVerifiedAt === null` on the pre-update read).

Add the imports: `flagEnabled` from `./flags.service.js`, `autoApproveRecruiter` from `./approval.service.js`, `matchingCompanyForEmail` from `./signupSignals.service.js`, and `logger` (already imported in auth.service if present — verify; add if not).

In `backend/src/services/adminConsole.service.ts` `getActivity`: add the auto-approval source to the Promise.all —

```ts
    AccountEvent.find({ kind: "auto_approved" })
      .sort({ createdAt: -1 })
      .limit(ACTIVITY_PER_KIND)
      .populate<{ subjectId: { fullName: string } | null }>({
        path: "subjectId",
        model: Recruiter,
        select: "fullName",
      }),
```

— and its items branch (beside the recruiters map):

```ts
    ...autoApprovals.map((row) => ({
      id: `auto-approval:${String(row._id)}`,
      kind: "recruiter_auto_approved" as const,
      at: at(row),
      label: row.subjectId?.fullName ?? "A recruiter",
      // The event's reason is "email domain matches <Company>"; the company
      // is the detail that makes the feed row meaningful.
      detail: row.reason ? row.reason.replace(/^email domain matches /, "") : null,
      href: "/admin/recruiters",
    })),
```

(Import `AccountEvent`; note `row.subjectId` after populate is the recruiter doc — cast as the other populates do.)

- [ ] **Step 4: Run to verify pass**

Run: `cd D:\job-portal-2.0\backend; npx vitest run tests/autoApprove.test.ts tests/adminNotifications.test.ts tests/admin-console.test.ts`
Expected: PASS — the tier green, and P1's notification suite plus the console suite untouched (the flag is off in their worlds).

- [ ] **Step 5: Commit**

```
git add backend/src/services/auth.service.ts backend/src/services/adminConsole.service.ts backend/tests/autoApprove.test.ts
git commit -m "feat(api): the auto-approval tier at the verification flips, and its feed kind"
```

---

### Task 4: Backend — the monitoring table's signals

**Files:**
- Modify: `backend/src/services/adminConsole.service.ts` (`listAllRecruiters`)
- Test: `backend/tests/autoApprove.test.ts` (append)

**Interfaces:**
- Consumes: Task 1's `isFreeMailAddress`; `matchingCompanyForEmail`.
- Produces: `AdminRecruiterDto.emailDomainKind` + `.matchingCompany` populated.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/autoApprove.test.ts`:

```ts
import { listAllRecruiters } from "../src/services/adminConsole.service.js";

describe("the monitoring table's signals", () => {
  beforeEach(async () => {
    await Promise.all([Company.init(), Recruiter.init()]);
    installCaptureMailer();
  });

  it("carries the domain class and the matched company for each recruiter", async () => {
    await Company.create({
      name: "Northstar Labs",
      description: "d",
      location: "Bengaluru",
      website: "https://www.northstarlabs.example",
      userId: null,
    });
    await pendingRecruiter("mira@northstarlabs.example");
    await pendingRecruiter("someone@gmail.com");
    await pendingRecruiter("fresh@newco.example");

    const { items } = await listAllRecruiters({ keyword: "", page: 1, limit: 10 });

    const byEmail = new Map(items.map((row) => [row.email, row]));
    expect(byEmail.get("mira@northstarlabs.example")).toMatchObject({
      emailDomainKind: "custom",
      matchingCompany: "Northstar Labs",
    });
    expect(byEmail.get("someone@gmail.com")).toMatchObject({
      emailDomainKind: "free",
      matchingCompany: null,
    });
    expect(byEmail.get("fresh@newco.example")).toMatchObject({
      emailDomainKind: "custom",
      matchingCompany: null,
    });
  });
});
```

(Check `listAllRecruiters`'s `query` shape — `AdminListQuery` — and construct it exactly as its controller does; read the controller if the literal above does not typecheck.)

- [ ] **Step 2: Run to verify failure**

Run: `cd D:\job-portal-2.0\backend; npx vitest run tests/autoApprove.test.ts -t "monitoring table"`
Expected: FAIL — the DTO lacks the fields (undefined vs expected).

- [ ] **Step 3: Implement**

In `listAllRecruiters`, after the rows are fetched, compute the signals (one Company scan shared by the page):

```ts
  // P4's assisted-review signals: the same computation the auto-tier uses,
  // surfaced on the row the admin actually reads. One website scan per page,
  // not per row.
  const companies = await Company.find({ website: { $ne: null } }).select("name website");
  const signalsFor = (email: string): { emailDomainKind: "free" | "custom"; matchingCompany: string | null } => {
    const kind = isFreeMailAddress(email) ? "free" : "custom";
    let matchingCompany: string | null = null;
    for (const company of companies) {
      if (signupDomainMatches(email, company.website ?? "")) {
        matchingCompany = company.name;
        break;
      }
    }
    return { emailDomainKind: kind, matchingCompany };
  };
```

and spread `...signalsFor(row.email)` into each item in the returned map. Import `isFreeMailAddress` and `signupDomainMatches` from `@jobportal/shared`.

- [ ] **Step 4: Run to verify pass**

Run: `cd D:\job-portal-2.0\backend; npx vitest run tests/autoApprove.test.ts tests/admin-console.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add backend/src/services/adminConsole.service.ts backend/tests/autoApprove.test.ts
git commit -m "feat(api): the monitoring table carries the signup signals"
```

---

### Task 5: Frontend — badges, history label, feed row

**Files:**
- Modify: `frontend/src/components/console/AdminRecruiters.tsx` (badges on pending rows)
- Modify: `frontend/src/components/console/AccountHistoryDialog.tsx` (`KIND_META`)
- Modify: `frontend/src/components/console/ActivityFeed.tsx` (`ICONS` + `VERBS`)
- Test: `frontend/tests/autoApprove.test.tsx`

**Interfaces:**
- Consumes: the extended `AdminRecruiterDto`, `AccountEventDto`, `AdminActivityKind`.
- Produces: nothing downstream.

- [ ] **Step 1: Write the failing tests**

Create `frontend/tests/autoApprove.test.tsx` (harness = the flags test file's: render + Provider + MemoryRouter; mock `@/hooks/useAdminConsole`):

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  useAccountEvents: () => ({ data: [], isPending: false }),
}));

describe("the monitoring table's signal badges", () => {
  it("badges a matched domain and a free-mail address on pending rows", () => {
    render(
      <Provider store={makeStore()}>
        <MemoryRouter>
          <AdminRecruiters />
        </MemoryRouter>
      </Provider>,
    );

    expect(screen.getByText("Matches Northstar Labs")).toBeInTheDocument();
    expect(screen.getByText("Free mail")).toBeInTheDocument();
  });
});

describe("the history dialog's auto-approved label", () => {
  it("labels the automation's own event kind", () => {
    render(
      <Provider store={makeStore()}>
        <MemoryRouter>
          <AccountHistoryDialog
            portal="recruiter"
            account={{ id: "r1", label: "Mira Patel" }}
            events={[
              {
                id: "e1",
                kind: "auto_approved",
                reason: "email domain matches Northstar Labs",
                at: "2026-09-02T10:00:00.000Z",
                actorEmail: null,
              },
            ]}
            onClose={vi.fn()}
          />
        </MemoryRouter>
      </Provider>,
    );

    expect(screen.getByText("Auto-approved")).toBeInTheDocument();
    expect(screen.getByText(/email domain matches Northstar Labs/)).toBeInTheDocument();
  });
});

describe("the activity feed's auto-approval row", () => {
  it("renders the new kind with its verb", () => {
    render(
      <Provider store={makeStore()}>
        <MemoryRouter>
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
          />
        </MemoryRouter>
      </Provider>,
    );

    expect(screen.getByText("Recruiter auto-approved")).toBeInTheDocument();
    expect(screen.getByText(/Northstar Labs/)).toBeInTheDocument();
  });
});
```

(Read `AccountHistoryDialog`'s props first — the mock above assumes `events` and `account` shapes; match the real component exactly, including whether the dialog renders open when `account` is non-null.)

- [ ] **Step 2: Run to verify failure**

Run: `cd D:\job-portal-2.0\frontend; npx vitest run tests/autoApprove.test.tsx`
Expected: FAIL — no badges, no `Auto-approved` label, no feed verb.

- [ ] **Step 3: Implement**

In `AdminRecruiters.tsx`'s pending-row cell (inside the email cell or beside the Pending badge — beside the status badge reads best):

```tsx
{recruiter.status === "pending" && recruiter.matchingCompany ? (
  <Badge variant="ok">Matches {recruiter.matchingCompany}</Badge>
) : null}
{recruiter.status === "pending" && !recruiter.matchingCompany && recruiter.emailDomainKind === "free" ? (
  <Badge variant="outline">Free mail</Badge>
) : null}
```

(Stack them under the Pending badge inside the Status cell with `className="mt-1 flex flex-wrap gap-1"` wrappers as the table's rhythm needs; check the Badge component's variants and use only existing ones — colour-gate afterwards.)

In `AccountHistoryDialog.tsx`:

```ts
  auto_approved: { label: "Auto-approved", tone: "signal" },
```

In `ActivityFeed.tsx` — add to `ICONS` (reuse `ShieldCheck` from lucide) and `VERBS`:

```ts
  recruiter_auto_approved: ShieldCheck,
  recruiter_auto_approved: "Recruiter auto-approved",
```

- [ ] **Step 4: Run to verify pass**

Run: `cd D:\job-portal-2.0\frontend; npx vitest run tests/autoApprove.test.tsx tests/oversight.test.tsx tests/adminDashboard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add frontend/src/components/console/AdminRecruiters.tsx frontend/src/components/console/AccountHistoryDialog.tsx frontend/src/components/console/ActivityFeed.tsx frontend/tests/autoApprove.test.tsx
git commit -m "feat(web): the signal badges, the auto-approved label, and the feed row"
```

---

### Task 6: Documentation and the full battery

**Files:**
- Create: `docs/adr/0010-auto-approval-requires-employer-domain.md`
- Modify: `ARCHITECTURE.md`, `frontend/src/data/updates.ts`

**Interfaces:** none.

- [ ] **Step 1: Write the ADR**

Create `docs/adr/0010-auto-approval-requires-employer-domain.md`:

```markdown
# ADR-0010: Auto-approval requires employer-domain proof

Date: 2026-09-02

## Status

Accepted.

## Context

P3 shipped the `autoApproveRecruiterSignups` kill switch. Wiring it needs a
bar, and the honest inventory at a recruiter's verification is thin: a name,
an email, and control of that email. Phone verification is dormant; employer
profiles are created only after approval.

## Decision

Auto-approval fires only when the signup email's registrable domain exactly
matches the website host of a company already on the platform (normalized:
lowercase, scheme and leading `www.` stripped; no subdomain credit, no DNS).
A genuinely new employer can never match and always receives human review —
automation serves only people joining employers already known to the
platform.

The worst case is someone who already controls an address at an employer's
domain entering without review — roughly what a password reset at that
address would allow anyway.

## Consequences

- Auto-approvals record an `auto_approved` account event naming the matched
  company and surface in the console's activity feed; the flag is one click
  from off.
- Weakening the bar (custom domains, subdomain credit, DNS lookups) requires
  replacing this ADR — the conservative default is the point.
- Free-mail signups and new employers queue for a human forever, by design.
```

- [ ] **Step 2: ARCHITECTURE and the release note**

In `ARCHITECTURE.md`, after the Feature flags section, add:

```markdown
### Approval automation

The flag's tier (P4): at either verification flip, a pending recruiter whose
signup email's domain exactly matches a known company's website host is
approved through the same activation a human click runs — guarded flip,
approval mail, orphan sweep — recording an `auto_approved` event that names
the matched company and surfacing in the activity feed
(`signupSignals.service.ts`, ADR-0010). New employers, free-mail addresses,
a turned-off flag, or an automation failure all fall back to the human queue
and the admin mail, unchanged. The recruiters monitoring table carries the
same signals as badges, so the human reviews are faster too.
```

In `frontend/src/data/updates.ts`, newest-first:

```ts
  {
    id: "approval-automation",
    date: "2026-09-02",
    kind: "Feature",
    title: "Recruiters from known employers can be approved automatically",
    summary:
      "A new platform switch — off by default — lets recruiters whose signup email is at a known employer's own website domain be approved the moment they verify their address. Everyone else is reviewed by a person, exactly as before.",
    details: [
      "The approval queue's rows now carry trust signals — whether the signup used a custom domain and whether it matches a company already on the platform — so human reviews are faster too.",
      "Every automatic approval is recorded and shown in the console's activity feed, with the matched employer named.",
    ],
  },
```

- [ ] **Step 3: Run the full battery**

Run: `cd D:\job-portal-2.0; npm run ci; npm run audit:prod`
Expected: exit 0. (Known under-load flake: re-run any single failing file in isolation before diagnosing; stop dev servers first.)

- [ ] **Step 4: `git diff --check`, report, ask before pushing**

Run: `cd D:\job-portal-2.0; git diff --check; git status --short` — clean.
Commit the docs:
```
git add docs/adr/0010-auto-approval-requires-employer-domain.md ARCHITECTURE.md frontend/src/data/updates.ts
git commit -m "docs: ADR-0010, the approval automation path, and its release note"
```
Report the battery, ask before pushing (a push deploys both hosts — and this feature lands the flag's tier, which stays off until you flip it in the console).
