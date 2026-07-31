# Review ledger — feat/supervisor-revenue-scope

Diff scope: `git diff feat/manager-tier-role-assignment..HEAD` — adds the `supervisor` access tier
(6th value) with **per-person, per-branch revenue scope**: a new `reporting.supervisor_revenue_scope`
table (admin-writes, supervisor self-read), a scoped `EXISTS` arm on the revenue SELECT policy
(fail-closed, margin table untouched), the `canViewFinance` → `canViewRevenue`/`canViewMargin` split,
a `RevenueScopePicker` admin surface, and revenue-only home/dashboard for supervisors. ADR-0051.
Stacked on the manager-tier branch (PR #100); this ledger covers the supervisor delta only.

## Verdicts

- spec: FIX-THEN-SHIP — spec-reviewer, 2026-07-29; all FRs implemented; 2 missing pgTAP assertions (AC-304 non-admin scope INSERT, AC-315 manager arm) ADDED in 2f00ed0 (85 plan 13→14, 86 plan 11→12)
- code-quality: PASS — code-quality-reviewer, 2026-07-29; no blocking issues; trivial cleanups (dead type wired, stale comment) done in 2f00ed0; picker-dedup + prop-drill filed as follow-ups
- design: FIX-THEN-SHIP — design-reviewer, 2026-07-29 (4-lens, RevenueScopePicker + revenue-only dashboard/home); no Critical, margin surfaces confirmed absent (not zeroed); Important (channel grouping not expressed) FIXED in 95864e9 (per-channel fieldset/legend + POS/B2B sub-headings + whole-channel differentiation) with regression test; Home lone-tile stretch fixed; whole-channel↔branch interactive-linking (#5) deferred (RLS handles redundancy)
- security: PASS — security-auditor, 2026-07-29; no Critical/High/Med; scoped EXISTS sound, fail-closed, org-isolated, no write path, self-read not a leak; 2 LOW pgTAP gaps (L1/L2) closed in 2f00ed0, L3 comment fixed

## Gates

| Gate | Status |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` (Vitest) | PASS — 2511/2511, 245 files |
| `supabase test db` (pgTAP) | N/A local — CI-gated (files 30/85/86; local gordi stack unavailable) |

## Decision

**MERGE** — all four reviews cleared (spec/design FIX-THEN-SHIP with every blocking finding fixed
on-branch: spec AC-304/AC-315 `2f00ed0`, design channel-grouping `95864e9`; security + code-quality
PASS). Local battery green (typecheck/lint/build/test 2511). pgTAP (30/85/86) runs in CI — that check
is the RLS merge gate per the ship-via-PR rule. Stacked on PR #100 (manager tier); rebase onto `dev`
after #100 merges. Owner approves the merge.
