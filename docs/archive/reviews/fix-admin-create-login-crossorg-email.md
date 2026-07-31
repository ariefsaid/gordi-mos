# Review ledger — fix/admin-create-login-crossorg-email

Diff scope: `git diff origin/main..HEAD` — D11-audit Medium fix: `admin_create_login` cross-org
duplicate-email → clean `22023 'email already in use'` (no raw `23505` / no cross-org DETAIL leak), and
`admin-users.ts` `surface()` helper so no raw Postgres error text reaches the client. New migration
`20260629000001` (CREATE OR REPLACE), pgTAP `59`, admin-users.ts + tests.

## Verdicts

- spec: PASS — spec-reviewer 2026-06-29 (sonnet). All 4 task requirements met (new migration with clean
  22023 + no DETAIL; original `…0626000001` untouched; every wrapper routed through `surface()`, zero raw
  `error.message` forwarded; pgTAP 59 asserts clean code+message + no orphan; gates green). No over-reach —
  exactly 4 files changed.
- code-quality: FIX-THEN-SHIP — code-quality-reviewer 2026-06-29 (sonnet). Strengths: tight `surface()`,
  correct CREATE-OR-REPLACE in a new migration, exception scoped to only the insert, honest tests. Before-merge
  items **all addressed**: (1) comment in admin-users.ts that `%`-format raises can't match the allowlist →
  degrade to generic (guard at UI); (2) 4th pgTAP assertion proving no orphaned `auth.users` row (plan 3→4);
  minors — runnable DOWN script, "logic-identical" wording, console-note (no premature eslint-disable — it
  would be flagged unused under --max-warnings=0).
- security: PASS — security-auditor 2026-06-29 (opus, prod lens). **CLEAR — closes D11, B2B seam clean**, no
  High/Critical. Leak closed at both layers (SQL clean 22023 + JS `surface()` sanitization, defense-in-depth);
  the broad `unique_violation` catch masks nothing (all 8 `auth.users` unique indexes checked — only the email
  key can fire; token-column partial indexes exclude empty strings); identities/people writes outside the catch
  still surface; CREATE-OR-REPLACE preserves search_path/authz/EXECUTE posture; allowlist all org-agnostic.

## Gates

| Gate | Status |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS (`--max-warnings=0`) |
| `npm test` (Vitest) | PASS — 1358/1358 |
| `supabase test db` (pgTAP) | PASS — admin 52/53/56 regression-clean + new `59` (4/4) run vs local DB |

## Decision

MERGE-READY — review battery cleared, `pre-merge-check.sh` exit 0. Closes the D11 single→multi-org (B2B)
blocker. **Staging:** the new migration `20260629000001` needs `supabase db push` to staging when the owner
authorizes (owner has restricted staging pushes) — until then staging keeps the old raw-error behavior; main /
prod-path carries the fix.
