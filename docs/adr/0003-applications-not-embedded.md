# ADR-0003: Applications are a collection, not an array on jobs

**Status:** Accepted (2026-07-31) — implementation scheduled for Phase 1C

## Context

The inherited `jobs` schema embeds an array of application ids:

```js
applications: [{ type: Schema.Types.ObjectId, ref: "Application" }]
```

and `applyJob` pushes to it on every application:

```js
job.applications.push(newApplication._id);
await job.save();
```

This has three failure modes:

1. **Unbounded growth.** MongoDB documents are capped at 16 MB. A job with
   enough applications eventually cannot be saved, at which point it silently
   stops accepting applications — the worst possible failure for a job portal,
   because it looks like nothing is wrong.
2. **Write amplification.** Every application rewrites the entire job document,
   including its description and requirements.
3. **Lost updates.** Two concurrent applications each read the job, push to their
   own copy of the array, and save. One overwrites the other.

The data is already duplicated: `applications` documents hold a `job` reference,
so the array is a second source of truth that can disagree with the first.

## Decision

Remove `applications` from the `jobs` schema. Query the `applications`
collection by `job` instead, with these indexes:

```
{ job: 1, seeker: 1 }   unique   — enforces apply-once in the database
{ seeker: 1, createdAt: -1 }     — a seeker's application list
{ company: 1, status: 1 }        — a recruiter's pipeline view
```

Maintain a `jobs.applicationCount` integer via `$inc` for display purposes,
since showing a count should not require loading every application.

`applications` also denormalizes `company`, so a recruiter can query across all
their jobs without a join.

## Consequences

**Good**

- No document size ceiling on a job's popularity.
- Applying writes one small document instead of rewriting a large one.
- The unique compound index makes duplicate-apply structurally impossible. The
  current `findOne`-then-`create` check is a race that two simultaneous requests
  both pass; a database constraint is not.
- One source of truth.

**Bad**

- Fetching a job with its applications is two queries rather than one populate.
  In practice they are wanted separately: seekers view a job without applicants,
  recruiters view applicants with pagination.
- `applicationCount` can drift from reality if an `$inc` fails after its insert
  succeeds. Acceptable for a display counter; authoritative counts come from a
  `countDocuments` query.
- Requires a migration materializing existing array entries into documents.
