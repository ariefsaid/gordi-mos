# Review ledger — docs/goo-charter-compliance

Diff scope: `git diff main..HEAD` — **docs-only** charter-compliance pass. Corrects the GOO ESB
coordinate (`stg-erp.esb.co.id` → `stg7.esb.co.id/core-stg`) across the spec, ADR-0010, ADR-0012,
decisions, backlog, platform-status; adds the verified tenant-costing finding (`/assembly-actual` not
deployed on GOO) and the live Transfer round-trip evidence; adds `docs/reference/esb-goo-integration.md`
(future-agent reference); and records the previously-missing review ledgers (#76 + the kitchen-app
worker PRs). No code, no migrations, no `.tsx`/`.css`.

## Verdicts

- spec: PASS — substantive spec + ADR-0012 amendments authored by **eng-planner** (the charter's spec/ADR owner) and Director-verified against live ESB findings (2026-06-26); all FR-/AC- IDs preserved; no OD-K conflict (findings *sharpen* OD-K-3, do not reopen it).
- code-quality: PASS — docs-only; prose reviewed for factual accuracy + clarity; coordinates match live-verified results; reference doc is self-contained for a cold future agent.

<!-- security: not required — no auth/RLS/migration/schema paths changed (docs/ only). -->
<!-- design: not required — no *.tsx / *.css changed. -->

## Gates

| Gate | Status |
|---|---|
| `npm run typecheck` | N/A (no app code changed) |
| `npm run lint` | N/A (no app code changed) |
| `npm test` (Vitest) | N/A (no app code changed) |
| `supabase test db` (pgTAP) | N/A (no migrations changed) |

## Decision

MERGE — docs-only correctness + future-proofing; the substantive change was role-authored (eng-planner) and Director-verified against the live ESB staging API.
