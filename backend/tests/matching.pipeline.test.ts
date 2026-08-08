import { describe, expect, it } from "vitest";
import {
  scoreJobForSeeker,
  scoreSeekerForJob,
  toFitJobInput,
  toFitSeekerInput,
} from "../src/services/matching.pipeline.js";
import type { JobDocument } from "../src/models/job.model.js";
import type { SeekerDocument } from "../src/models/seeker.model.js";

// Minimal document-shaped stubs — the projections only read the typed fields,
// so a plain object cast satisfies them without a live Mongo connection.
function seeker(over: Partial<SeekerDocument["profile"]> = {}): SeekerDocument {
  return {
    profile: {
      skills: ["React.js", "ts", "node"],
      experienceYears: 6,
      salaryMin: 80_000,
      salaryMax: 120_000,
      openToRemote: true,
      location: "Berlin",
      ...over,
    },
  } as unknown as SeekerDocument;
}

function job(over: Partial<JobDocument> = {}): JobDocument {
  return {
    requirements: ["typescript", "react", "node"],
    salary: 100_000,
    experienceLevel: 4,
    location: "berlin",
    remote: true,
    ...over,
  } as unknown as JobDocument;
}

describe("projections", () => {
  it("maps a seeker into FitSeekerInput with undefined for unset optional fields", () => {
    const out = toFitSeekerInput(seeker({ salaryMin: null, openToRemote: null }));
    expect(out.salaryMin).toBeUndefined(); // 0 would clamp; null must stay "no constraint"
    expect(out.openToRemote).toBeUndefined(); // null must not read as "not remote"
    expect(out.skills).toContain("React.js");
  });

  it("derives workMode from the flat remote flag", () => {
    expect(toFitJobInput(job({ remote: true })).workMode).toBe("remote");
    expect(toFitJobInput(job({ remote: false })).workMode).toBe("onsite");
  });
});

describe("scoring", () => {
  it("scores a strong match high in both directions", () => {
    const s = seeker();
    const j = job();
    expect(scoreJobForSeeker(s, j).score).toBeGreaterThanOrEqual(85);
    expect(scoreSeekerForJob(s, j).score).toBeGreaterThanOrEqual(85);
  });

  it("drops when the seeker isn't open to a remote role", () => {
    const s = seeker({ openToRemote: false });
    const j = job({ remote: true });
    expect(scoreJobForSeeker(s, j).score).toBeLessThan(
      scoreJobForSeeker(seeker(), job({ remote: true })).score,
    );
  });

  it("produces a factor breakdown the UI can explain", () => {
    const b = scoreJobForSeeker(seeker({ skills: [] }), job());
    expect(b.factors.length).toBeGreaterThan(0);
    for (const f of b.factors) expect(f.earned).toBeLessThanOrEqual(f.max);
  });
});
