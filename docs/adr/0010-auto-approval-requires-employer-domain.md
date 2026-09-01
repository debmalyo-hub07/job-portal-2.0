# ADR-0010: Auto-approval requires employer-domain proof

Date: 2026-09-02

## Status

Accepted.

## Context

P3 shipped the `autoApproveRecruiterSignups` kill switch. Wiring it needs a
bar, and the honest inventory at a recruiter's verification is thin: a name,
an email, and control of that email. Phone verification is dormant; employer
profiles are created only after approval.

## Decision

Auto-approval fires only when the signup email's registrable domain exactly
matches the website host of a company already on the platform (normalized:
lowercase, scheme and leading `www.` stripped; no subdomain credit, no DNS).
A genuinely new employer can never match and always receives human review —
automation serves only people joining employers already known to the
platform.

The worst case is someone who already controls an address at an employer's
domain entering without review — roughly what a password reset at that
address would allow anyway.

## Consequences

- Auto-approvals record an `auto_approved` account event naming the matched
  company and surface in the console's activity feed; the flag is one click
  from off.
- Weakening the bar (custom domains, subdomain credit, DNS lookups) requires
  replacing this ADR — the conservative default is the point.
- Free-mail signups and new employers queue for a human forever, by design.
