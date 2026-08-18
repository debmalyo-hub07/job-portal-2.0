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
    headline: string;
    sub: string;
    fallbackProof: string;
    /** Three concrete capabilities, shown down the panel's middle. */
    points: readonly string[];
    /**
     * This portal's own public landing page — where the wordmark and the Back
     * link both go.
     *
     * `null` on admin. `/admin` resolves to this very sign-in when there is no
     * session, so aiming both controls at it made them no-ops: clicking either
     * one returned you to the page you were leaving. The recruiter portal had the
     * same defect and was fixed by giving `/hire` its landing page back — the
     * console has no marketing page to restore and will not get one, so it
     * renders no control instead of one that lies.
     *
     * Nullable rather than absent for the same reason as `crossLinkHref`: the
     * consumer guards on a value instead of branching on the portal.
     */
    homeHref: string | null;
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
    /**
     * Where "Continue with Google" sends the browser, appended to
     * `VITE_API_URL`.
     *
     * An **API** path, not a client route — hence `Path` where the others say
     * `Href`. It must never reach `<Link>`.
     *
     * `null` on admin, mirroring `buildAuthRouter`, which mounts the Google
     * routes only when `portal !== "admin"`: the highest-privilege portal gains
     * nothing from a third-party identity path, and the routes are absent rather
     * than present-and-refusing so a prober learns less. The button was rendered
     * unconditionally, so the console door offered a control whose only possible
     * outcome was a 404.
     */
    googleStartPath: string | null;
  }
> = {
  seeker: {
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
    googleStartPath: "/seeker/auth/google",
    signupHref: "/signup",
  },
  recruiter: {
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
    googleStartPath: "/recruiter/auth/google",
    signupHref: "/hire/signup",
  },
  admin: {
    headline: "Manage the platform.",
    sub: "Approve recruiters and moderate content.",
    fallbackProof: "Internal console — not publicly advertised.",
    points: [
      "Review and approve pending recruiter accounts",
      "Monitor platform activity",
      "Moderate jobs and maintain quality",
    ],
    // No public landing page to return to — see homeHref above. Every shared
    // auth screen still carries its own link to loginHref, so nothing strands.
    homeHref: null,
    // No public counterpart to cross-link to — an internal door linking out to
    // a marketing page is a dead end. Nullable rather than absent so consumers
    // guard on a value instead of branching on the portal.
    crossLinkLabel: null,
    crossLinkText: null,
    crossLinkHref: null,
    loginHref: "/admin/login",
    // No Google on the console — see googleStartPath above and buildAuthRouter.
    googleStartPath: null,
    // No self-service admin registration — admins are seeded and then created
    // by an existing admin.
    signupHref: null,
  },
};
