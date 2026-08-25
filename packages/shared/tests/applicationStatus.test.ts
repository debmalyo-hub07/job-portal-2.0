import { describe, expect, it } from "vitest";
import {
  ACTIVE_STATUSES,
  APPLICATION_STATUSES,
  RECRUITER_SETTABLE,
  TERMINAL_STATUSES,
  canTransition,
  isForward,
  isTerminal,
  notifiesSeeker,
  transitionRefusal,
  type ApplicationStatus,
} from "../src/index.js";

describe("application status state machine", () => {
  it("partitions every status into exactly one of active or terminal", () => {
    // The guard against a status being added to the enum and to neither list,
    // which would make canTransition silently unreachable for it.
    const covered = [...ACTIVE_STATUSES, ...TERMINAL_STATUSES].sort();
    expect(covered).toEqual([...APPLICATION_STATUSES].sort());
    for (const s of ACTIVE_STATUSES) expect(isTerminal(s)).toBe(false);
    for (const s of TERMINAL_STATUSES) expect(isTerminal(s)).toBe(true);
  });

  it("lets a recruiter move freely among active stages, forwards and back", () => {
    // Backward moves are legal on purpose: a mis-clicked "interview" must be
    // correctable, which a strict forward-only machine would make permanent.
    expect(canTransition("applied", "shortlisted", "recruiter")).toBe(true);
    expect(canTransition("interview", "reviewed", "recruiter")).toBe(true);
    expect(canTransition("offered", "shortlisted", "recruiter")).toBe(true);
  });

  it("locks both terminal stages against every actor", () => {
    for (const from of TERMINAL_STATUSES) {
      for (const to of APPLICATION_STATUSES) {
        if (from === to) continue;
        expect(transitionRefusal(from, to, "recruiter")).toBe("TERMINAL");
        expect(transitionRefusal(from, to, "seeker")).toBe("TERMINAL");
      }
    }
  });

  it("refuses a repeated status rather than treating it as a no-op", () => {
    // A double-submit would otherwise append a second history entry and send a
    // second email for a single decision.
    expect(transitionRefusal("shortlisted", "shortlisted", "recruiter")).toBe("SAME_STATUS");
  });

  it("keeps each portal to its own transitions", () => {
    // The candidate's exit is theirs alone; the recruiter has no route to it.
    expect(transitionRefusal("applied", "withdrawn", "recruiter")).toBe("NOT_ALLOWED_FOR_PORTAL");
    // And a seeker cannot advance or reject their own application.
    for (const to of RECRUITER_SETTABLE) {
      expect(transitionRefusal("applied", to, "seeker")).toBe("NOT_ALLOWED_FOR_PORTAL");
    }
    // An admin has no transitions at all.
    expect(transitionRefusal("applied", "shortlisted", "admin")).toBe("NOT_ALLOWED_FOR_PORTAL");
  });

  it("never reports a terminal stage as forward progress", () => {
    expect(isForward("applied", "offered")).toBe(true);
    expect(isForward("offered", "applied")).toBe(false);
    expect(isForward("applied", "rejected")).toBe(false);
    expect(isForward("applied", "withdrawn")).toBe(false);
  });
});

describe("notification policy", () => {
  it("emails the stages that carry news", () => {
    expect(notifiesSeeker("applied", "shortlisted")).toBe(true);
    expect(notifiesSeeker("shortlisted", "interview")).toBe(true);
    expect(notifiesSeeker("interview", "offered")).toBe(true);
  });

  it("always emails a rejection, which has no rank to compare", () => {
    for (const from of ACTIVE_STATUSES) {
      expect(notifiesSeeker(from, "rejected")).toBe(true);
    }
  });

  it("stays silent on `reviewed`", () => {
    // "Somebody opened your file" is set across a whole list in one sitting;
    // mailing it teaches candidates that a Cairn email carries no news.
    expect(notifiesSeeker("applied", "reviewed")).toBe(false);
  });

  it("stays silent on a backward correction", () => {
    // "You have been shortlisted" arriving after "you have an interview" reads
    // as a downgrade the recruiter never meant to announce.
    expect(notifiesSeeker("interview", "shortlisted")).toBe(false);
    expect(notifiesSeeker("offered", "interview")).toBe(false);
  });

  it("never emails a withdrawal to the candidate who performed it", () => {
    expect(notifiesSeeker("applied", "withdrawn")).toBe(false);
  });
});
