import type { Portal } from "@jobportal/shared";

/**
 * Per-portal strings in one place, keyed by Portal.
 *
 * This table is what makes PortalPanel a single component rather than two: the
 * panel differs by content and signal token, never by structure. If a portal
 * ever needs a different *layout*, that is the signal that the shared-language
 * direction has failed — fix it here or revisit the design, do not fork the
 * component.
 */
export const AUTH_COPY: Record<
  Portal,
  {
    wordmarkSuffix: string;
    headline: string;
    sub: string;
    fallbackProof: string;
    /** Three concrete capabilities, shown down the panel's middle. */
    points: readonly string[];
    /** This portal's own landing page — where the wordmark goes. */
    homeHref: string;
    /**
     * The sibling portal to advertise. `null` on admin: it has no public
     * counterpart, and a cross-link from an internal console door to a
     * marketing page is a dead end. Nullable rather than absent so the
     * consumers guard on a value instead of branching on the portal.
     */
    crossLinkLabel: string | null;
    crossLinkText: string | null;
    crossLinkHref: string | null;
    loginHref: string;
    /** `null` where no self-service registration exists — see the admin entry. */
    signupHref: string | null;
  }
> = {
  seeker: {
    wordmarkSuffix: "Portal",
    headline: "Find work that fits.",
    sub: "One profile. Every application tracked in one place.",
    fallbackProof: "New roles are posted by verified companies every week.",
    points: [
      "Apply with one profile — no re-typing your history per job",
      "Track every application and its status in one place",
      "Your resume stays private until you apply",
    ],
    homeHref: "/",
    crossLinkLabel: "Hiring instead?",
    crossLinkText: "Go to hiring",
    crossLinkHref: "/hire",
    loginHref: "/login",
    signupHref: "/signup",
  },
  recruiter: {
    wordmarkSuffix: "Hire",
    headline: "Hire without the noise.",
    sub: "Post a role, see every applicant, decide faster.",
    fallbackProof: "Applicants arrive with a profile and a resume, already parsed.",
    points: [
      "Post a role in a couple of minutes",
      "Every applicant's profile and resume in one list",
      "Accept or reject without leaving the page",
    ],
    homeHref: "/hire",
    crossLinkLabel: "Looking for a job?",
    crossLinkText: "Browse jobs",
    crossLinkHref: "/",
    loginHref: "/hire/login",
    signupHref: "/hire/signup",
  },
  admin: {
    wordmarkSuffix: "Admin",
    headline: "Manage the platform.",
    sub: "Approve recruiters and moderate content.",
    fallbackProof: "Internal console — not publicly advertised.",
    points: [
      "Review and approve pending recruiter accounts",
      "Monitor platform activity",
      "Moderate jobs and maintain quality",
    ],
    homeHref: "/admin",
    // No public counterpart to cross-link to — an internal door linking out to
    // a marketing page is a dead end. Nullable rather than absent so consumers
    // guard on a value instead of branching on the portal.
    crossLinkLabel: null,
    crossLinkText: null,
    crossLinkHref: null,
    loginHref: "/admin/login",
    // No self-service admin registration — admins are seeded and then created
    // by an existing admin.
    signupHref: null,
  },
};
