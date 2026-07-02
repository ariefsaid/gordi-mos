# Review battery — `dev` branch (agent-native program: reporting slice + Issue-1 sales dashboard)

**Scope:** `git diff main..dev` — ADR-0017 program foundation: the `reporting.sales_daily_revenue`
migration + RLS + pgTAP, the warehouse→Supabase snapshot job, the reporting DAL, the 5 dashboard-kit
primitives, the sales-dashboard page + route/guard, and the supporting docs.
**Run:** 2026-07-02 (Director-orchestrated, per CLAUDE.md "review battery before merge" gate).
**Overall verdict:** **FIX-THEN-SHIP.** No Critical/High. Security clear; spec + code-quality + design each
have a small must-fix set (below). Not yet merge-ready — merge only after the ✳ must-fix items land green.

## Lens verdicts
| Lens | Reviewer | Verdict |
|---|---|---|
| Security (OWASP/STRIDE) | security-auditor (opus) | **CLEAR FOR MERGE** — no Crit/High; Medium/Low hardening only |
| Code quality | code-quality-reviewer (opus) | **fix-then-ship** — "high-quality work"; 1 Important |
| Spec conformance | spec-reviewer (opus) | **matches spec with gaps** — no Crit; 3 Important |
| Design (4-lens) | Director render-verify (desktop+mobile+computed-font) | **fix-then-ship** — One-Blue holds, responsive OK; 1 Important (font regression) |

### Machine-readable verdicts (parsed by `pre-merge-check.sh`)
- spec: SHIP — matches spec; the 3 gaps (dead sort FR-009 · AC-id tagging · pgTAP collision) all RESOLVED + verified 2026-07-02.
- code-quality: SHIP — "high-quality work"; the one Important (dead sortable table) RESOLVED (`a71da55`) + live-verified; follow-ups tracked.
- design: SHIP — One-Blue holds, responsive OK; the `.tabular`→mono font regression RESOLVED (`a71da55`, Inter-tabular) + live-verified.
- security: PASS — CLEAR for merge (no Crit/High); M1 snapshot-superuser + L3 password-length are before-prod, non-blocking.

## ✳ Must-fix before `dev`→`main`
1. **Dead sortable table (FR-009)** — `revenue-columns.tsx` marks columns `sortable: true` and `DataTable`
   renders sort-header buttons, but `sales-dashboard-page.tsx:176-182` passes **no `sort`/`onSortChange`**
   → clicking sorts nothing; `aria-sort="none"` advertises an inert control (accessibility-visible).
   **Flagged independently by BOTH code-quality and spec review.** Fix: wire page sort state (reorder
   `tableRows`) or drop `sortable` until wired.
2. **`.tabular` → SF Mono font regression (app-wide)** — `mos-app/src/index.css:214` points `.tabular` at
   `--font-mono`; DESIGN.md OD-P3-9 (lines 293/295) mandates money = **Inter-tabular, never mono** (SF Mono
   is IDs/codes/⌘K only). Inter was dropped (#55) so the fallback can't engage → all money renders in a
   per-OS system monospace. Restore Inter Variable scoped to `.tabular` only; body/UI stays DM Sans;
   re-verify digit alignment. (Also in `docs/backlog.md` §Doc & code debt.)
3. **AC-id traceability (spec)** — (a) the 4 reporting **script-unit** ACs (AC-007/008/009/010) carry no
   AC-id in their `test_reporting_snapshot.py` titles (`grep -r AC-007 scripts/` finds nothing — violates
   the binding AC-id-in-title convention); (b) `supabase/tests/60_...rls.sql` **reuses** AC-007 (`:40`) and
   AC-010 (`:81`) for DB assertions that in the spec name script-unit ACs → `grep` returns the wrong layer;
   the pgTAP AC-010 actually proves spec AC-008. Tag the script tests; renumber the pgTAP collisions to the
   correct spec IDs.

## Before prod (not merge-blocking)
- **Sec-M1** — the snapshot cron connects as `postgres` **superuser** via the pooler, not `service_role`
  (`reporting-snapshot-cron.sh:34-36`), defeating the migration's least-privilege design (blast radius =
  whole staging DB if the cred leaks). Run under `service_role` or a scoped INSERT/UPDATE role (grants
  exist). op-managed + loopback-adjacent + staging today, so deferred — **do before prod.**
- **Sec-L3** — `config.toml:190` `minimum_password_length = 6`, no complexity, on the auth surface guarding
  finance data. Raise to ≥8 + `lower_upper_letters_digits`.

## Follow-ups (tracked, non-blocking)
- **CQ** — `reporting_snapshot.py:174` `executemany` = 1 round-trip/row; batch before the read-model widens
  (ADR-0017 D3 growth path). `freshness-label.tsx:15` renders in the browser TZ not Asia/Jakarta (finance
  "as of" can read confusingly cross-TZ). `channelMixLabel` independent rounding may not sum to 100.
- **Sec-M2** — `pg_hba` `172.18.0.0/16 trust` → passwordless superuser to any *future* co-tenant container
  on the docker bridge (documented open item; move `gordi` to `scram` + op password when the op SA can write).
- **Sec-L1/L2** — Telegram bot token from `openclaw.json` not op; no pgTAP for the service-role *write* path.
- **~~Test flake~~ — NON-ISSUE (verified 2026-07-02).** The reported `task-detail.test.tsx` failure was a
  **Node-18-vs-22 artifact**, not a clock-drift flake: the fixture date is hardcoded + UTC-formatted
  (deterministic). Suite is **1725/1725 green under Node 22**; `.nvmrc` now pins 22. Nothing to fix.
- **Spec-minor** — AC-011 rests on the un-run e2e (Director owns the live-render layout proof); `DailyRevenueChart`
  legend hardcodes POS/B2B (a 3rd channel renders unlabeled).

## Sign-off
- ✳ **All three must-fix RESOLVED + verified (2026-07-02):**
  1. **Sort (FR-009)** — wired (`a71da55`: pure `sortRevenueRows` + page state + `<DataTable sort onSortChange>` + 7 tests). **Live-render-verified:** clicking "Avg rev/txn" reordered rows ascending + `aria-sort` toggled.
  2. **`.tabular`→Inter font** — `a71da55` (Inter Variable scoped to numeric only). **Live-verified:** KPI money computes `"Inter Variable"` (loaded), no longer SF Mono; body/UI stays DM Sans.
  3. **AC-id traceability** — script tests tagged AC-007/008/009/010; pgTAP collision resolved (`:81`→AC-008, `:40`→new AC-011); `grep -r AC-XXX` truthful; 333 pgTAP assertions pass.
- Suite **1734 green** under Node 22; typecheck + lint clean.
- Live-render (Director, 2026-07-02): populated, responsive (768px→cards, no h-scroll), B2B/Roastery end-to-end, sort works, Inter money — desktop+mobile screenshots at repo root.
- **Remaining before merge:** `bash scripts/pre-merge-check.sh` exit 0.
- Minor follow-up found during verify (non-blocking): the daily-revenue table's compact money renders DM Sans, not `.tabular` (pre-existing tabular-alignment nit).
