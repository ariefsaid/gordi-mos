# Review ledger — feat/manager-tier-role-assignment

Diff scope: `git diff $(git merge-base main HEAD)..HEAD` — adds a `manager` financial-visibility
access tier (company-wide revenue + COGS/margin SELECT on `reporting.*`, org-scoped, view-only) and
admin assignment of **Jabatan** (Position, `shared.person_roles`) + **Access level**
(`shared.person_access_roles`, incl. `manager`). ADR-0050. Two migrations + 3 pgTAP files + types/DAL +
admin UI (RoleEditor/PositionPicker/UserTable) + SPA reach gates.

## Verdicts

- spec: PASS — spec-reviewer, 2026-07-29; all AC-101..129 have owning tests at correct layer, both intentional inversions real; minor non-blocking note (AC-123 tests manager toggle-on, toggle-off covered generically)
- code-quality: FIX-THEN-SHIP — code-quality-reviewer, 2026-07-29; Issue 1 (stale dialog snapshot) FIXED in 9f6df3c (+regression test); Issues 2–6 non-blocking follow-ups
- design: FIX-THEN-SHIP — design-reviewer, 2026-07-29 (4-lens, admin /people); terminology lock honored, no Critical; #4 fixed in 9f6df3c; #1 slug-leak / #2 dialog-scroll / #3 row hit-target all fixed in e28d277 (+6 regression tests); minors #5/#6 deferred (optional)
- security: FIX-THEN-SHIP — security-auditor, 2026-07-29; no Critical/High, tenancy + stored-vs-derived JWT boundary intact; MEDIUM (derived-vs-granted manager conflation) FIXED in 9f6df3c; LOW pgTAP gaps closed (AC-116/117)

## Gates

| Gate | Status |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` (Vitest) | PASS — 2484/2484, 244 files |
| `supabase test db` (pgTAP) | N/A local — CI-gated (local gordi stack not running; pmo-portal occupies ports) |

## Decision

**MERGE** — all four reviews pass (spec PASS; security/code-quality/design FIX-THEN-SHIP with every
blocking finding fixed on-branch: security MEDIUM `9f6df3c`, CQ Issue 1 `9f6df3c`, design #1–#4
`9f6df3c`+`e28d277`). Local battery green (typecheck/lint/test/build). pgTAP (30/83/84) runs in CI —
that check is the merge gate for the RLS layer, per the ship-via-PR rule. Owner approves the merge.
