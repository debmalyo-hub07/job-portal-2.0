# ADR-0009: Feature flags are an operator's kill switch

Date: 2026-09-01

## Status

Accepted.

## Context

The console automation program's approval tier (P4) must ship off and be
killable at runtime without a deploy. The platform has no such mechanism:
behaviour is compiled in or read from environment variables, and both need a
rebuild.

## Decision

A flag registry in `packages/shared` (`FLAG_REGISTRY`) defines every flag,
its description and its default; a `FeatureFlag` collection stores only
deviations; an admin console screen flips them. Flags are global on/off
only. Server reads resolve through a 15-second in-memory cache, valid
because the deploy is single-instance — the same reasoning as the
in-memory rate-limit store (ADR-0004's world).

This is deliberately an operator's kill switch, not an experiment platform:
no percentage rollouts, no per-user or per-portal targeting, no scheduling.
The registry-in-code design makes a typo a compile error and a default a
reviewed PR; the database cannot accumulate flags nobody reads.

## Consequences

- A second API instance breaks the cache's freshness ceiling (still correct
  within 15s per process) and is the trigger to move resolution to a shared
  store — multi-instance is also what ADR-0004 defers.
- Per-portal granularity, if ever real, is a scope field on the override row
  and one step in the resolver — contained, not a rewrite.
- Percentage rollouts or targeting are out of scope permanently unless a
  future ADR replaces this one; they change both the store and the trust
  model.
