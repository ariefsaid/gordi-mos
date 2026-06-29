# Review ledger — test/kitchen-e2e

Diff scope: `git diff main..HEAD` — adds ONE curated Playwright e2e, `mos-app/e2e/AC-090-kitchen-log-approve.spec.ts`. No app source, schema, auth, or UI (`.tsx`/`.css`) change. Closes the long-standing gap (status §2): no curated kitchen journey existed, which let the `log_date` 400 bug through mocked unit tests.

## Verdicts

- spec: PASS — Director-reviewed (2026-06-29). The test maps 1:1 to **AC-090 [e2e]** (a genuine
  e2e-tagged AC in `docs/specs/kitchen-module.spec.md:625`) — AC id in the test title so `grep -r AC-090`
  finds the proof. It asserts the AC's real GOAL (member logs Production → ops_lead/admin approves →
  `approve_kitchen_log` mints a `PR-<YYYYMMDD>-NNN` batch → entry leaves the Submitted queue →
  `integrations.esb_push` outbox row enqueued with `target_env != gkid`), not the app's incidental state.
  Runs against the real local stack (PostgREST + RLS + RPC), no mocking. AC-090's Daily-Log `/ops` mirror
  clause is intentionally NOT asserted — that mirror is deferred (migration `_014`, AC-060/061) — and the
  test documents this. Verified green ×2.
- code-quality: SHIP — Director-reviewed (2026-06-29). Deterministic and self-cleaning (`beforeAll` upserts
  today's plan; `afterAll` deletes its own kitchen/batch/push/stock/log rows so reruns are stable). Reuses
  the existing `loginAs` helper + `VIEWER`/`MANAGER` fixtures and the established `/pg/query` service-role
  pattern — no new auth mechanism invented. Clear AAA structure, WHY-comments on the two non-obvious test
  mechanics (seed-plan date drift; localStorage-clear before re-auth). typecheck + eslint clean.

## Gates

| Gate | Status |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS (eslint on the spec, 0 errors) |
| `npx playwright test e2e/AC-090-kitchen-log-approve.spec.ts` | PASS (green ×2) |
| `supabase test db` (pgTAP) | N/A (no schema/RLS change) |

## Decision

MERGE — test-only addition, proves AC-090's cross-stack approve path against the real RPC, gates green,
pre-merge-check exit 0.
