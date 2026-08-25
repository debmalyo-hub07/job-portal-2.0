import { APPLICATION_STATUSES, type ApplicationStatus } from "./enums.js";
import type { Portal } from "./auth.js";

/**
 * The application pipeline's transition rules.
 *
 * Pure functions, no I/O, no schema: the API enforces them and the recruiter's
 * status menu is built from them, so the control cannot offer a move the server
 * would refuse. `APPLICATION_STATUSES` sat unused here for a phase while the
 * model hardcoded three values of its own — the same drift the `JOB_TYPES`
 * comment in enums.ts describes — so everything below derives from that list
 * rather than restating it.
 */

/**
 * The stages an application moves *through*. Ordered, and the order is load
 * bearing: `isForward` reads it to decide whether a change is progress worth
 * emailing about or a correction that should stay quiet.
 */
export const ACTIVE_STATUSES = [
  "applied",
  "reviewed",
  "shortlisted",
  "interview",
  "offered",
] as const satisfies readonly ApplicationStatus[];

/**
 * The stages an application *ends* on. Nothing transitions out of these — a
 * decision the recruiter cannot silently reverse, and a withdrawal the recruiter
 * cannot override.
 */
export const TERMINAL_STATUSES = ["rejected", "withdrawn"] as const satisfies
  readonly ApplicationStatus[];

/**
 * What a recruiter may set. Excludes `applied`, which is the creation default
 * and not a decision, and `withdrawn`, which belongs to the candidate alone —
 * a recruiter withdrawing on someone's behalf would put words in their mouth.
 */
export const RECRUITER_SETTABLE = [
  "reviewed",
  "shortlisted",
  "interview",
  "offered",
  "rejected",
] as const satisfies readonly ApplicationStatus[];

/** The seeker's only transition, and only away from a live application. */
export const SEEKER_SETTABLE = ["withdrawn"] as const satisfies readonly ApplicationStatus[];

export function isTerminal(status: ApplicationStatus): boolean {
  return (TERMINAL_STATUSES as readonly ApplicationStatus[]).includes(status);
}

/** Position in the active pipeline, or -1 for a terminal stage. */
export function rankOf(status: ApplicationStatus): number {
  return (ACTIVE_STATUSES as readonly ApplicationStatus[]).indexOf(status);
}

/**
 * Is `to` further along than `from`?
 *
 * False when either side is terminal: a rejection is not "progress", and there
 * is no way back out of one to measure.
 */
export function isForward(from: ApplicationStatus, to: ApplicationStatus): boolean {
  const a = rankOf(from);
  const b = rankOf(to);
  return a !== -1 && b !== -1 && b > a;
}

export type TransitionRefusal = "TERMINAL" | "SAME_STATUS" | "NOT_ALLOWED_FOR_PORTAL";

/**
 * May `actor` move an application from `from` to `to`?
 *
 * Returns `null` when the move is legal, or the reason it is not. A reason
 * rather than a boolean because the three refusals are different HTTP answers:
 * a terminal application and a repeated status are both 409 CONFLICT, while a
 * portal reaching for someone else's transition is 403.
 *
 * Same-status is refused rather than treated as a no-op. A double-submitted
 * decision would otherwise append a second history entry and send a second
 * email for one action — and the codebase already answers a repeated admin
 * denial with 409 rather than pretending idempotence.
 */
export function transitionRefusal(
  from: ApplicationStatus,
  to: ApplicationStatus,
  actor: Portal,
): TransitionRefusal | null {
  if (isTerminal(from)) return "TERMINAL";
  if (from === to) return "SAME_STATUS";
  const allowed: readonly ApplicationStatus[] =
    actor === "recruiter" ? RECRUITER_SETTABLE : actor === "seeker" ? SEEKER_SETTABLE : [];
  if (!allowed.includes(to)) return "NOT_ALLOWED_FOR_PORTAL";
  return null;
}

export function canTransition(
  from: ApplicationStatus,
  to: ApplicationStatus,
  actor: Portal,
): boolean {
  return transitionRefusal(from, to, actor) === null;
}

/**
 * Which stages email the candidate.
 *
 * `reviewed` is deliberately absent: it means "somebody opened your file", which
 * a recruiter may set across a whole list in one sitting. Mailing it would teach
 * candidates that a Cairn email carries no news, which is how the ones that do
 * carry news get ignored.
 */
const NOTIFIES_SEEKER = ["shortlisted", "interview", "offered", "rejected"] as const satisfies
  readonly ApplicationStatus[];

/**
 * Should this transition email the candidate?
 *
 * Backward moves never do. A recruiter correcting a mis-click from `interview`
 * back to `shortlisted` has told the candidate nothing, and "you have been
 * shortlisted" arriving after "you have an interview" reads as a downgrade the
 * recruiter never meant to announce.
 */
export function notifiesSeeker(from: ApplicationStatus, to: ApplicationStatus): boolean {
  if (!(NOTIFIES_SEEKER as readonly ApplicationStatus[]).includes(to)) return false;
  // `rejected` is terminal, so it has no rank and is never "forward" — but it is
  // always news.
  return to === "rejected" || isForward(from, to);
}

/** Every status, for exhaustiveness checks in consumers. */
export const ALL_APPLICATION_STATUSES: readonly ApplicationStatus[] = APPLICATION_STATUSES;
