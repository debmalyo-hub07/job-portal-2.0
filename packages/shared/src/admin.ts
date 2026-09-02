import { z } from "zod";

import { paginationQuerySchema } from "./pagination.js";
import type { ApplicationStatus } from "./enums.js";
import type { DailySeriesPoint } from "./domain.js";

/**
 * The admin console's wire contract.
 *
 * Admin reads are deliberately narrow projections rather than the domain DTOs
 * the portals use. An admin is an authority over the domain, not a participant
 * in it: the console needs enough to moderate — who, what, when, and the state
 * that decides whether to act — and nothing that would turn a moderation screen
 * into a bulk export of everyone's contact details.
 */

/** A recruiter awaiting approval, as the queue screen renders them. */
export type PendingRecruiterDto = {
  id: string;
  fullName: string;
  email: string;
  createdAt: string;
};

/**
 * Denial needs a reason: it is the one moderation action a recruiter cannot
 * undo by waiting, and it emails them. Bounded so the reason fits an email body
 * and cannot be used to smuggle a payload into one.
 */
export const recruiterDenyBodySchema = z.object({
  reason: z.string().trim().min(1, "A reason is required").max(500),
}).strict();

export type RecruiterDenyBody = z.infer<typeof recruiterDenyBodySchema>;

/**
 * Project D: suspension needs a reason for the same line of reasoning as
 * denial — it is the one moderation action that locks the owner out, and both
 * the mail and the login refusal carry it. Reinstatement needs none: there is
 * no justification owed for restoring someone.
 */
export const accountSuspendBodySchema = recruiterDenyBodySchema;
export type AccountSuspendBody = RecruiterDenyBody;

/**
 * A new admin invitation. The existing admin session supplies authority and a
 * server-held provisioning secret supplies the second control; the invited
 * admin sets a password through the same short-lived OTP path as recovery.
 */
export const adminCreateBodySchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(254),
  provisioningKey: z.string().min(1).max(512),
}).strict();

export type AdminCreateBody = z.infer<typeof adminCreateBodySchema>;

/**
 * The dashboard's counters.
 *
 * Counts only — no identifiers. The dashboard answers "is there work to do",
 * and every drill-down from it goes through an endpoint that authorises the
 * specific read.
 */
export type AdminOverviewDto = {
  recruiters: { pending: number; active: number; suspended: number };
  seekers: { total: number };
  jobs: { total: number };
  companies: { total: number };
  applications: { total: number };
};

/**
 * A job as the moderation table lists it.
 *
 * Carries the poster (`recruiterEmail`) precisely because the admin's question
 * about a job is usually "who posted this" — the one field the public JobDto
 * deliberately withholds.
 */
export type AdminJobDto = {
  id: string;
  title: string;
  location: string;
  jobType: string;
  salary: number;
  companyName: string | null;
  recruiterEmail: string | null;
  applicationCount: number;
  createdAt: string;
};

/** A company as the moderation table lists it. */
export type AdminCompanyDto = {
  id: string;
  name: string;
  location: string | null;
  website: string | null;
  logoUrl: string | null;
  jobCount: number;
  ownerEmail: string | null;
  createdAt: string;
};

/**
 * Admin list queries page like every other list endpoint (`limit` capped at 50)
 * and accept an optional keyword. The keyword is matched as an escaped literal
 * by the service, never interpolated into a RegExp raw.
 */
export const adminListQuerySchema = paginationQuerySchema.extend({
  keyword: z.string().trim().max(100).default(""),
});

export type AdminListQuery = z.infer<typeof adminListQuerySchema>;

/**
 * A ranked slice of the catalogue: one label, one count, biggest first.
 *
 * Entries at zero are omitted, unlike the pipeline's stages below. A ranking is
 * a list of what exists, so a zero row is noise; a named pipeline stage at zero
 * is the information that nobody has reached it.
 */
export type AdminRankedSlice = { label: string; count: number };

/** One day of the jobs-posted series. `date` is a UTC `YYYY-MM-DD`. */
export type AdminSeriesPoint = DailySeriesPoint;

/**
 * The dashboard's aggregations, beyond the plain counters in AdminOverviewDto.
 *
 * Two rules run through this shape and both exist because the client must not
 * have to reconstruct anything:
 *
 * `pipeline.byStatus` always carries every key in `APPLICATION_STATUSES`, zeros
 * included. Omitting empty stages would make the client branch on presence, and
 * a stage that disappears from the chart reads as a stage the platform does not
 * have.
 *
 * A figure that cannot be measured is `null`, never `0`. Zero applications per
 * job is a finding; "there are no open jobs to divide by" is not, and the two
 * must not render as the same number. The landing page's counters already
 * decline the same way.
 */
export type AdminInsightsDto = {
  /** What is waiting for a decision. Every field links to a console screen. */
  triage: {
    pendingRecruiters: number;
    /**
     * Employers missing a logo OR a website — an incomplete profile an admin
     * cannot verify at a glance.
     *
     * `OR`, not `AND`, and the live data is why: every one of production's 27
     * companies carries a logo and not one carries a website, so "missing both"
     * is permanently zero there while "missing either" is all 27.
     */
    companiesMissingBranding: number;
  };
  pipeline: {
    byStatus: Record<ApplicationStatus, number>;
    total: number;
    /** Not yet at a terminal stage — `decidedAt` is null. */
    live: number;
    decided: number;
  };
  /**
   * Demand against capacity. Everything here is scoped to OPEN jobs: a closed
   * role cannot attract an application, so counting it as capacity understates
   * liquidity for a reason unrelated to demand.
   */
  liquidity: {
    openJobs: number;
    jobsWithApplications: number;
    applicationsPerJob: number | null;
  };
  composition: {
    byDepartment: AdminRankedSlice[];
    byType: AdminRankedSlice[];
    remoteOpenJobs: number;
  };
  /** Dense and ascending, one point per UTC day, gaps zero-filled. */
  jobsPostedSeries: AdminSeriesPoint[];
  /**
   * Server-side, so a client describing the numbers' freshness reads the
   * server's clock, not its own. (The console header displayed this as an
   * "as of" stamp until 2026-09-01, when the stamp was removed; the field
   * stays — an aggregation's generation time is API fact, not UI.)
   */
  generatedAt: string;
};

/**
 * What happened recently, across every collection.
 *
 * A narrow projection like every other console read. The feed names the thing
 * that happened and where to go about it, and carries no contact details — a
 * seeker's address has no place in a "what happened" list, and inheriting one
 * later is how a moderation screen becomes an export.
 */
export const ADMIN_ACTIVITY_KINDS = [
  "recruiter_registered",
  "recruiter_auto_approved",
  "job_posted",
  "company_created",
  "application_submitted",
] as const;

export type AdminActivityKind = (typeof ADMIN_ACTIVITY_KINDS)[number];

export type AdminActivityItem = {
  id: string;
  kind: AdminActivityKind;
  at: string;
  label: string;
  detail: string | null;
  /** A console route, or null where no screen resolves this event. */
  href: string | null;
};

export type AdminActivityDto = { items: AdminActivityItem[] };

/**
 * A seeker as the oversight table lists them (Project D).
 *
 * Same rules as every console read: enough to moderate, nothing that turns
 * the screen into an export. `minor` is the derived band, not the DOB; the
 * phone, resume and profile stay in the seeker's own portal.
 */
export type AdminSeekerDto = {
  id: string;
  fullName: string;
  email: string;
  status: "pending" | "active" | "suspended";
  minor: boolean;
  applicationCount: number;
  createdAt: string;
};

/**
 * A recruiter as the monitoring table lists them (Project D) — every
 * recruiter, not just the pending queue. `status` decides the row's actions:
 * pending carries approve/deny, active carries suspend, suspended carries
 * reinstate.
 */
export type AdminRecruiterDto = {
  id: string;
  fullName: string;
  email: string;
  status: "pending" | "active" | "suspended";
  jobCount: number;
  applicationCount: number;
  createdAt: string;
  /** P4's assisted-review signals: the email's domain class, and the company
      whose website domain the email matches, if any. */
  emailDomainKind: "free" | "custom";
  matchingCompany: string | null;
};

/** One row of a per-account status history, newest first. */
export type AccountEventDto = {
  id: string;
  kind: "approved" | "auto_approved" | "denied" | "suspended" | "reinstated";
  reason: string | null;
  at: string;
  /** The acting admin's email, or null where a script made the decision. */
  actorEmail: string | null;
};
