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
    homeHref: "/hire",
    crossLinkLabel: "Looking for a job?",
    crossLinkText: "Browse jobs",
    crossLinkHref: "/",
    loginHref: "/hire/login",
    signupHref: "/hire/signup",
  },
};
