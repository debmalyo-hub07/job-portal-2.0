import { describe, expect, it } from "vitest";
import {
  applicationStatusBodySchema,
  companyCreateBodySchema,
  jobCreateBodySchema,
  jobListQuerySchema,
  objectIdSchema,
  profileUpdateBodySchema,
} from "../src/domain.js";
import { RECRUITER_SETTABLE } from "../src/applicationStatus.js";

describe("domain schemas", () => {
  it("rejects a malformed object id", () => {
    expect(objectIdSchema.safeParse("not-an-id").success).toBe(false);
    expect(objectIdSchema.safeParse("64b0c8f2a9d3e45f6a7b8c9d").success).toBe(true);
  });

  it("company create requires a trimmed name", () => {
    expect(companyCreateBodySchema.safeParse({ name: "  " }).success).toBe(false);
    const ok = companyCreateBodySchema.parse({ name: "  Acme  " });
    expect(ok.name).toBe("Acme");
  });

  it("job create coerces salary and splits requirements", () => {
    const ok = jobCreateBodySchema.parse({
      title: "Dev", description: "Build things", requirements: "ts, node ,",
      salary: "12", experience: "2", location: "Remote", jobType: "Full-time",
      position: "2", companyId: "64b0c8f2a9d3e45f6a7b8c9d",
    });
    expect(ok.salary).toBe(12);
    expect(ok.requirements).toEqual(["ts", "node"]);
  });

  it("job list query defaults and caps", () => {
    const q = jobListQuerySchema.parse({});
    expect(q).toMatchObject({ page: 1, limit: 20, keyword: "" });
    expect(jobListQuerySchema.safeParse({ keyword: "a".repeat(200) }).success).toBe(false); // see max below
    expect(jobListQuerySchema.safeParse({ keyword: "a".repeat(101) }).success).toBe(false);
  });

  it("status accepts the recruiter-settable stages and nothing else", () => {
    // Derived from RECRUITER_SETTABLE, so this asserts the schema and the state
    // machine still name the same set.
    for (const status of RECRUITER_SETTABLE) {
      expect(applicationStatusBodySchema.parse({ status }).status).toBe(status);
    }
    // `applied` is the creation default, not a decision; `withdrawn` belongs to
    // the candidate. Neither may arrive on a recruiter's request.
    for (const status of ["applied", "withdrawn", "pending", "accepted"]) {
      expect(applicationStatusBodySchema.safeParse({ status }).success).toBe(false);
    }
  });
});

/**
 * The profile write path, which decides whether the fit engine can score.
 *
 * Every field here is read by `matching.pipeline.ts` and returned in
 * `ProfileView`. A field the pipeline reads but this schema omits is permanently
 * `null` for every seeker — it scores as a no-penalty unknown, so the factor
 * exists, runs, and contributes nothing. `experienceYears` and `location` were
 * exactly that from 4A.3 until Phase 5: readable, returned by `/user/profile`,
 * and unsettable by any request.
 *
 * That is why these assertions are per-field rather than one round-trip of a
 * full object: the defect is a *missing* key, and an object literal asserting
 * seven keys still passes when an eighth is dropped from the schema.
 */
describe("profileUpdateBodySchema", () => {
  it("accepts every field the matching pipeline reads", () => {
    const parsed = profileUpdateBodySchema.parse({
      experienceYears: "4",
      location: "  Kolkata  ",
      salaryMin: "8",
      salaryMax: "20",
      openToRemote: "true",
    });

    expect(parsed).toMatchObject({
      experienceYears: 4,
      location: "Kolkata",
      salaryMin: 8,
      salaryMax: 20,
      openToRemote: true,
    });
  });

  it.each(["experienceYears", "location", "salaryMin", "salaryMax", "openToRemote"])(
    "carries %s, which the pipeline scores on",
    (field) => {
      expect(Object.keys(profileUpdateBodySchema.shape)).toContain(field);
    },
  );

  /**
   * The model caps experience at 60 (`seeker.model.ts:12`). A schema that
   * accepted 600 would push the write past Mongoose validation and answer 500
   * where it should answer 400.
   */
  it("bounds experienceYears to the model's range", () => {
    expect(profileUpdateBodySchema.safeParse({ experienceYears: "-1" }).success).toBe(false);
    expect(profileUpdateBodySchema.safeParse({ experienceYears: "61" }).success).toBe(false);
    expect(profileUpdateBodySchema.parse({ experienceYears: "60" }).experienceYears).toBe(60);
  });

  it("treats a blank location as clearing it, not as the string ' '", () => {
    expect(profileUpdateBodySchema.parse({ location: "   " }).location).toBe("");
  });

  /**
   * A blank numeric box means "no constraint", and it has to survive as `null`
   * all the way to `toFitSeekerInput`.
   *
   * `z.coerce.number()` alone turns `""` into `0`, because `Number("")` is `0`.
   * That is not a harmless default: `salaryMin: 0` together with `salaryMax: 0`
   * puts every real salary outside the band, and `salaryFit` then scores the
   * factor at 0 for every job on the board — 25 of the 100 points in the `job`
   * direction, silently, for a seeker who only emptied a box.
   */
  it.each(["experienceYears", "salaryMin", "salaryMax"])(
    "maps a blank %s to null rather than coercing it to 0",
    (field) => {
      const parsed = profileUpdateBodySchema.parse({ [field]: "" }) as Record<string, unknown>;
      expect(parsed[field]).toBeNull();
    },
  );

  it.each(["experienceYears", "salaryMin", "salaryMax"])(
    "still omits %s entirely when the request does not mention it",
    (field) => {
      const parsed = profileUpdateBodySchema.parse({}) as Record<string, unknown>;
      // Absent and blank must stay distinguishable: absent is "leave it alone",
      // blank is "clear it". Collapsing them means a form that posts only the
      // fields it renders would wipe every field it does not.
      expect(field in parsed).toBe(false);
    },
  );

  /**
   * `openToRemote` is three-valued, not two.
   *
   * `remoteFit` returns 1 for `undefined` ("the seeker never said — don't fault
   * the job") and 0 for an explicit `false` against a remote role. A checkbox
   * cannot express the difference: it posts `false` when untouched, so every
   * seeker who ever saved their profile would silently start penalising remote
   * jobs by the factor's full 12 points. The blank option is what keeps the
   * pipeline's no-preference branch reachable.
   */
  it("accepts a blank openToRemote as no preference", () => {
    expect(profileUpdateBodySchema.parse({ openToRemote: "" }).openToRemote).toBeNull();
    expect(profileUpdateBodySchema.parse({ openToRemote: "false" }).openToRemote).toBe(false);
    expect(profileUpdateBodySchema.parse({ openToRemote: "true" }).openToRemote).toBe(true);
  });

  it("rejects a numeric field that is neither blank nor a number", () => {
    expect(profileUpdateBodySchema.safeParse({ salaryMin: "twelve" }).success).toBe(false);
    // Whitespace is blank, exactly as it is for `location` above — trimmed
    // first, then read. `Number("  ")` is 0, so without the trim a stray space
    // would be indistinguishable from a deliberate zero.
    expect(profileUpdateBodySchema.parse({ salaryMin: "  " }).salaryMin).toBeNull();
  });
});
