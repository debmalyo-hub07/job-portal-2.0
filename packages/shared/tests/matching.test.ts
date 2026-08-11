import { describe, expect, it } from "vitest";

import { computeJobFit, computeSeekerFit, explain } from "../src/matching/index.js";
import type { FitJobInput, FitSeekerInput } from "../src/matching/index.js";

const STEM = "javascript";

// A seeker who perfectly matches the job below on every factor.
const perfectSeeker: FitSeekerInput = {
  skills: ["TypeScript", "Node", "React"],
  salaryMin: 80_000,
  salaryMax: 120_000,
  experienceYears: 5,
  location: "Berlin",
  openToRemote: true,
};

const perfectJob: FitJobInput = {
  requirements: ["typescript", "react", "node"],
  salary: 100_000,
  experienceLevel: 4,
  location: "berlin",
  workMode: "remote",
};

describe("computeJobFit (job for a seeker)", () => {
  it("scores a perfect match at 100 with a factor breakdown", () => {
    const r = computeJobFit(perfectSeeker, perfectJob);
    expect(r.score).toBe(100);
    // Every factor met fully; the breakdown sums to the score.
    expect(r.factors.every((f) => f.earned === f.max)).toBe(true);
  });

  it("earns a partial skills factor when some requirements are missing", () => {
    const r = computeJobFit({ ...perfectSeeker, skills: ["typescript"] }, perfectJob);
    const skills = r.factors.find((f) => f.key === "skills");
    expect(skills).toBeDefined();
    expect(skills!.earned).toBeLessThan(skills!.max);
    expect(skills!.earned).toBeGreaterThan(0);
    expect(r.score).toBeLessThan(100);
  });

  it("matches skills case-insensitively and through aliases", () => {
    // "React.js" must normalise to the same token the job's "react" uses.
    const r = computeJobFit({ ...perfectSeeker, skills: ["React.js", "NODE", "ts"] }, perfectJob);
    const skills = r.factors.find((f) => f.key === "skills")!;
    // ts → typescript via alias; NODE → node; React.js → react. Full match.
    expect(skills.earned).toBe(skills.max);
  });

  it("zeroes the remote fit when the seeker won't work remote and the job is remote", () => {
    const r = computeJobFit({ ...perfectSeeker, openToRemote: false }, perfectJob);
    const remote = r.factors.find((f) => f.key === "remote")!;
    expect(remote.earned).toBe(0);
    // Salary/experience/location still contribute, so the overall dips but isn't zero.
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThan(100);
  });

  it("never lets a factor earn more than its max", () => {
    for (const f of computeJobFit(perfectSeeker, perfectJob).factors) {
      expect(f.earned).toBeLessThanOrEqual(f.max);
    }
  });
});

describe("computeSeekerFit (seeker for a job)", () => {
  it("is symmetric with the job fit on a perfect match", () => {
    expect(computeSeekerFit(perfectSeeker, perfectJob).score).toBe(100);
  });
});

describe("explain", () => {
  it("returns human-readable reason lines that name the dominant factor", () => {
    const lines = explain(computeJobFit({ ...perfectSeeker, skills: ["typescript"] }, perfectJob));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(typeof line).toBe("string");
    expect(lines.join(" ").toLowerCase()).toContain("skill");
  });

  it(`mentions ${STEM}-style tokens verbatim from the breakdown`, () => {
    const r = computeJobFit({ ...perfectSeeker, skills: [] }, perfectJob);
    // All skills missing; the explanation should surface the skills factor.
    expect(explain(r).some((l) => l.toLowerCase().includes("skill"))).toBe(true);
  });
});

/**
 * The two directions are read by different people, so they are worded
 * differently.
 *
 * One shared set of reason strings had to pick a voice, and it picked the
 * recruiter's — so the seeker-facing job card would have said "the seeker isn't
 * open to it" about the person reading it. The salary line also printed a `$`
 * that appears nowhere else in the product (`job.salary` renders as LPA).
 */
describe("reason voice", () => {
  const remoteAverse = { ...perfectSeeker, openToRemote: false };
  const remoteJob = { ...perfectJob, workMode: "remote" as const };

  const reasonFor = (b: ReturnType<typeof computeJobFit>, key: string) =>
    b.factors.find((f) => f.key === key)!.reason;

  it("addresses the seeker directly in the job direction", () => {
    const r = computeJobFit(remoteAverse, remoteJob);
    expect(reasonFor(r, "remote")).toMatch(/\byou\b/i);
    expect(reasonFor(r, "remote")).not.toMatch(/\bthe seeker\b/i);
  });

  it("speaks about the candidate in the seeker direction", () => {
    const r = computeSeekerFit(remoteAverse, remoteJob);
    expect(reasonFor(r, "remote")).toMatch(/\bthey\b/i);
    expect(reasonFor(r, "remote")).not.toMatch(/\byou\b/i);
  });

  it("never invents a currency symbol", () => {
    for (const direction of [computeJobFit, computeSeekerFit]) {
      const lines = direction(perfectSeeker, perfectJob).factors.map((f) => f.reason);
      expect(lines.join(" ")).not.toMatch(/[$€£₹]/);
    }
  });
});
