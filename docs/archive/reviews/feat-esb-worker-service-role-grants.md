# Review ledger — feat/esb-worker-service-role-grants

Diff scope: `git diff main..HEAD` — migration `supabase/migrations/20260626000010_esb_worker_service_role_grants.sql`:
grants `service_role` SELECT+UPDATE on `integrations.esb_push` + `ops.kitchen_logs`, SELECT on `ops.wip_items`
(+ schema USAGE). Closes the gap where `20260620000006` assumed service_role writes posting state (AC-007)
but never granted table privileges.

> **Retroactive record (charter-compliance).** This ledger was created 2026-06-26 *after* the branch was
> merged (PR #76). The merge predated the recorded battery — a Director gate miss, documented here for
> traceability. The reviews below were run retroactively against the merged commit; no follow-up fix needed.

## Verdicts

- spec: SHIP — minimum-privilege grants exactly fill the AC-007 worker write-path gap; no INSERT/DELETE on esb_push (AC-005/NFR-002 preserved); conforms to ADR-0012 D1/D3/D4 + spec §3.5. (spec-reviewer, 2026-06-26)
- code-quality: SHIP — correct least-privilege table grants with strong WHY-header; only defect is two redundant schema-USAGE grants already present in `20260611000001` (clarity, not correctness; cosmetic follow-up). (code-quality-reviewer, 2026-06-26)
- security: PASS — least-privilege; no new tenant-isolation hole (service_role already bypasses RLS platform-wide; these add only table grants to a backend-only role); no secrets. (security-auditor, 2026-06-26, as part of the worker battery)

## Gates

| Gate | Status |
|---|---|
| `npm run typecheck` | N/A (SQL migration only) |
| `npm run lint` | N/A |
| `npm test` (Vitest) | N/A |
| `supabase test db` (pgTAP) | N/A — pure GRANT; verified via rolled-back txn (service_role reads all 3 tables after grant) |

## Decision

MERGE (already merged as PR #76, origin/main 047b453). Follow-up nit: drop the two redundant `grant usage` lines.
