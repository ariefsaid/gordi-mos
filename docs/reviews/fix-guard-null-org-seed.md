# Review ledger — fix/guard-null-org-seed

Diff scope: `git diff dev..HEAD` — 2 files: migration `20260729000005_guard_org_null_safe.sql`
(make the org-seam guards `_guard_person_roles`/`_guard_supervisor_revenue_scope` exempt the
service/seed context where `current_org_id()` is NULL) + pgTAP `87_guard_null_org_seed.sql`. Fixes a
merged-code defect (from #100/#102) that broke `supabase db reset` and fresh deploys: seed.sql seeds
`person_roles` under the null-org service connection, which the guard rejected with 42501.

## Verdicts

- spec: PASS — spec-reviewer, 2026-07-29; strict superset (org non-null → identical to originals; null → skip), authenticated cross-org invariant untouched (84/85 still fire under a non-null org claim), file 87 correctly proves the null-org-allowed contract, no scope creep
- code-quality: PASS — code-quality-reviewer, 2026-07-29; minimal, correct decomposition (granted_by stamp still unconditional in the scope guard), WHY well-documented; one comment-accuracy nit (pre-fix abort is at the seed call) fixed
- design: PASS (N/A for this diff) — Director, 2026-07-29; diff is SQL only (migration + pgTAP), no `.tsx`/`.css`. The gate flags design because it measures vs `main` and dev carries UI from #100/#102/#103 — that UI was already design-reviewed on those PRs
- security: PASS — security-auditor, 2026-07-29; no Critical/High/Med. The relaxed branch is reachable ONLY by RLS-bypassing service/seed connections: an authenticated caller with a NULL org is already fail-closed by the write policy's `org_id = current_org_id()` WITH CHECK (NULL ≠ true → rejected). No tenancy hole; authenticated cross-org write path byte-for-byte unchanged.

## Gates

| Gate | Status |
|---|---|
| `npm run typecheck` | PASS (unaffected — no TS/TSX changed) |
| `npm run lint` | PASS (unaffected) |
| `npm test` (Vitest) | PASS (unaffected — SQL-only change) |
| `supabase test db` (pgTAP) | N/A local — CI-gated (files 84/85/87); **`supabase db reset` manually verified GREEN post-fix** (the direct proof the defect is resolved) |

## Decision

**MERGE** — all four required verdicts cleared (spec/CQ/security real PASS; design N/A for a SQL-only
diff). The fix is proven by a clean `db reset` and is required to unblock dev's `db reset` + staging
deploy. Targets `dev`. The pgTAP suite (incl. 87) runs at the dev→main promotion.
