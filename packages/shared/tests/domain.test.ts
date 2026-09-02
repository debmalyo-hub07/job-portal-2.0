import { describe, expect, it } from "vitest";
import {
  applicationStatusBodySchema,
  bulkStatusBodySchema,
  BULK_STATUS_CAP,
  companyCreateBodySchema,
  jobCreateBodySchema,
  jobListQuerySchema,
  jobStatusBodySchema,
  jobUpdateBodySchema,
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

  it("job status accepts both lifecycle values and nothing else", () => {
    expect(jobStatusBodySchema.parse({ status: "open" }).status).toBe("open");
    expect(jobStatusBodySchema.parse({ status: "closed" }).status).toBe("closed");
    // "draft" and "archived" are the two a reader would assume exist. Neither
    // does, and accepting one would store a value no filter reads.
    for (const status of ["draft", "archived", "filled", ""]) {
      expect(jobStatusBodySchema.safeParse({ status }).success).toBe(false);
    }
  });
});

/**
 * The job edit contract.
 *
 * Per-field rather than one round trip of a full object, for the reason spelled
 * out on `profileUpdateBodySchema` below: the defect this guards against is a
 * *missing* key, and an object literal asserting nine keys still passes when a
 * tenth is dropped from the schema. An unwritable field on an edit form is
 * silent — the control renders, the value posts, and the API drops it.
 */
describe("jobUpdateBodySchema", () => {
  const EDITABLE = [
    "title",
    "description",
    "requirements",
    "salary",
    "experience",
    "location",
    "jobType",
    "department",
    "position",
    "remote",
  ];

  it.each(EDITABLE)("carries %s, which the edit form renders", (field) => {
    expect(Object.keys(jobUpdateBodySchema.shape)).toContain(field);
  });

  it("covers every field a job is created with, except the company", () => {
    // Derived from the create schema rather than listed twice: a field added to
    // job creation and forgotten here would otherwise be uneditable forever,
    // and nothing would say so.
    const creatable = Object.keys(jobCreateBodySchema.shape).filter((k) => k !== "companyId");
    expect(Object.keys(jobUpdateBodySchema.shape).sort()).toEqual(creatable.sort());
  });

  /**
   * The employer is not editable, and `.strict()` is what enforces it.
   *
   * Without the strict flag an unknown key is stripped, so a client sending
   * `companyId` would get a 200 and no change — the posting would look moved
   * until the page reloaded. A 400 says what actually happened.
   */
  it("refuses companyId rather than ignoring it", () => {
    expect(Object.keys(jobUpdateBodySchema.shape)).not.toContain("companyId");
    const result = jobUpdateBodySchema.safeParse({
      title: "Still fine",
      companyId: "64b0c8f2a9d3e45f6a7b8c9d",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a single field on its own", () => {
    // A form posts only what changed, so every field has to be independently
    // sufficient. An accidental `.required()` anywhere breaks every partial edit.
    expect(jobUpdateBodySchema.parse({ salary: "18" })).toEqual({ salary: 18 });
    expect(jobUpdateBodySchema.parse({})).toEqual({});
  });

  it("normalises the same way the create schema does", () => {
    const parsed = jobUpdateBodySchema.parse({
      requirements: "ts, node ,",
      salary: "12",
      experience: "3",
      remote: "on",
    });
    // Comma-string in, array out — matching `jobCreateBodySchema`, so an edit
    // round trip through the form cannot quietly reshape the field.
    expect(parsed.requirements).toEqual(["ts", "node"]);
    expect(parsed.salary).toBe(12);
    expect(parsed.experience).toBe(3);
    expect(parsed.remote).toBe(true);
  });

  it("bounds the numbers exactly as creation does", () => {
    expect(jobUpdateBodySchema.safeParse({ salary: "0" }).success).toBe(false);
    expect(jobUpdateBodySchema.safeParse({ experience: "51" }).success).toBe(false);
    expect(jobUpdateBodySchema.safeParse({ jobType: "Freelance" }).success).toBe(false);
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

describe("profileUpdateBodySchema identity fields", () => {
  it("takes phone under its real name and no longer takes phoneNumber", () => {
    expect(profileUpdateBodySchema.parse({ phone: "+919876543210" }).phone).toBe("+919876543210");
    expect(profileUpdateBodySchema.safeParse({ phoneNumber: "+919876543210" }).success).toBe(false);
  });

  it("validates phone the same way registration does", () => {
    // It previously accepted any string up to 20 characters here, so the profile
    // could store a number registration would have refused.
    expect(profileUpdateBodySchema.safeParse({ phone: "9876543210" }).success).toBe(false);
  });

  it("lets a blank clear the phone, the way a blank clears a salary", () => {
    // `phone` is nullable on the model and the dialog posts the box whether or
    // not it holds anything, so a blank has to mean "clear it" rather than 400 an
    // unrelated bio edit. Same shape as `clearableInt`.
    expect(profileUpdateBodySchema.parse({ phone: "" }).phone).toBeNull();
    expect(profileUpdateBodySchema.parse({ phone: "  " }).phone).toBeNull();
  });

  it("accepts dob and gender but refuses a blank for either", () => {
    // Not clearable, deliberately asymmetric with phone above: blanking a dob
    // would re-gate the account, and blanking a gender would erase the
    // difference between "declined to say" and "never asked".
    expect(profileUpdateBodySchema.safeParse({ dob: "1995-03-20" }).success).toBe(true);
    expect(profileUpdateBodySchema.safeParse({ gender: "male" }).success).toBe(true);
    expect(profileUpdateBodySchema.safeParse({ dob: "" }).success).toBe(false);
    expect(profileUpdateBodySchema.safeParse({ gender: "" }).success).toBe(false);
  });

  it("holds the age floor on the correction path too", () => {
    // The gate reads `dob`, so an under-age value accepted here would walk
    // straight past it.
    expect(profileUpdateBodySchema.safeParse({ dob: "2015-01-01" }).success).toBe(false);
  });

  it("accepts designation, which nothing could write before", () => {
    expect(profileUpdateBodySchema.parse({ designation: "Talent Lead" }).designation)
      .toBe("Talent Lead");
  });
});

describe("bulkStatusBodySchema", () => {
  const ids = ["64b0c8f2a9d3e45f6a7b8c9d", "64b0c8f2a9d3e45f6a7b8c9e"];

  it("accepts a legal batch and every settable stage", () => {
    // Derived from RECRUITER_SETTABLE, so the schema and the state machine
    // still name the same set — same assertion the single move's schema has.
    for (const status of RECRUITER_SETTABLE) {
      expect(bulkStatusBodySchema.parse({ applicationIds: ids, status }).status).toBe(status);
    }
  });

  it("refuses an empty batch and a batch over the cap", () => {
    expect(
      bulkStatusBodySchema.safeParse({ applicationIds: [], status: "rejected" }).success,
    ).toBe(false);
    const tooMany = Array.from({ length: BULK_STATUS_CAP + 1 }, () => "64b0c8f2a9d3e45f6a7b8c9d");
    expect(
      bulkStatusBodySchema.safeParse({ applicationIds: tooMany, status: "rejected" }).success,
    ).toBe(false);
  });

  it("refuses a malformed id and the stages a recruiter may not set", () => {
    expect(
      bulkStatusBodySchema.safeParse({ applicationIds: ["not-an-id"], status: "rejected" }).success,
    ).toBe(false);
    // `applied` is the creation default; `withdrawn` is the candidate's alone.
    for (const status of ["applied", "withdrawn"]) {
      expect(bulkStatusBodySchema.safeParse({ applicationIds: ids, status }).success).toBe(false);
    }
  });

  it("is strict about unknown keys", () => {
    expect(
      bulkStatusBodySchema.safeParse({ applicationIds: ids, status: "rejected", reason: "x" })
        .success,
    ).toBe(false);
  });
});
