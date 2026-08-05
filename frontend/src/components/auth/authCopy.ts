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
    crossLinkLabel: string;
    crossLinkText: string;
    /** The *other* portal's landing page. */
    crossLinkHref: string;
    loginHref: string;
    signupHref: string;
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
};
