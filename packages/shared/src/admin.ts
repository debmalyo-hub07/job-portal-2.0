import { z } from "zod";

import { paginationQuerySchema } from "./pagination.js";

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
});

export type RecruiterDenyBody = z.infer<typeof recruiterDenyBodySchema>;

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
