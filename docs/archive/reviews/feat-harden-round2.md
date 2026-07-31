# Review battery — feat/harden-round2 (pre-F hardening A1–A6)

Closes the round-2 MVP-readiness audit blocklist (`docs/reviews/mvp-readiness-audit-round2-2026-07-07.md`).
Six fixes built via pi/GLM (glm-5.2/4.7), each Director close-reviewed end-to-end + consolidated-verified.
Integration branch merges: feat/harden-{task-tenancy,comments-guard,error-boundary,reporting-rls,budget-rpc,ci-coverage}.

## Fixes
| # | Finding | Sev | Fix | Owning test |
|---|---|---|---|---|
| A1 | `mos.tasks` cross-org R/A/C/I/BU/created_by refs (existence-only FKs) | Sec High | `mos._guard_task_refs()` BEFORE INS/UPD trigger (INVOKER, mirrors `ops._guard_log_entry`) + created_by/org_id immutability | pgTAP `79` |
| A2 | `mos.comments.entity_id` bare-uuid cross-org/existence oracle | Sec/Adv Med | `mos._guard_comment_entity()` CASE-per-entity same-org guard (23514) | pgTAP `80` |
| A3 | No React error boundary + no telemetry sink (white-screen prod) | Rel/Obs High | `<ErrorBoundary>` + router `errorElement` + pluggable `reportError` seam (ADR-0010-D7 injection point, no vendor dep) | `ErrorBoundary.test.tsx` · `telemetry.test.ts` |
| A4 | `reporting_writer` `using(true)/check(true)` cross-org write | Sec Med | **Documentation + F fix path.** null/bogus org already blocked by `org_id NOT NULL + FK`; the exists-check first attempted broke every write (`42501` — no SELECT on shared.orgs) and was redundant. True per-run scoping needs the snapshot job to set `app.reporting_org` GUC → F. | existing `61`/`76` |
| A5 | Client-computed COGS stored as capture-of-record + 2 non-tx inserts | Data Med | `mos.capture_budget()` SECURITY DEFINER RPC — atomic budget+lines, server-recomputes total from linked cost lines (link-never-copy), fail-loud on missing cost line, `can('cogs.write')` gate, caller-pinned org/created_by. **Director added `owning_bu_id` same-org guard (A1-class seam).** | pgTAP `82` (17) |
| A6 | Coverage allowlist hid admin/pages; `AC-PB-012` flag e2e never ran in CI | Test Med | coverage `include → src/**` globs; `VITE_SHOW_PLAN_BUDGET=true` on the Playwright CI step | (config) |

## Director verification (all green, machine unloaded — earlier flake was 100% env timeout)
- **pgTAP:** `supabase db reset && supabase test db` → **82 files / 570 tests PASS** (79/80/82 + existing 61/76 restored by the A4 revert).
- **Unit:** `vitest run` → **2345/2345 PASS (245 files)**; **coverage 95.43% lines / 85.35% funcs / 86.82% branch / 95.43% stmts** — all above thresholds (A6 broadening is safe).
- **Typecheck:** `tsc -b` zero errors. **Lint:** `eslint . && stylelint` exit 0.

## Defects caught + fixed in review (glm builders couldn't run pgTAP under the shared-DB rule)
- A4's exists-check broke all reporting writes (`42501`) + regressed `61`/`76` → reverted to documentation.
- A2 test used malformed follow_up UUIDs (`22P02`) → corrected to seeded ids.
- A5 test `plan(14)` miscount (16 assertions) → `plan(17)`; `owning_bu_id` same-org guard + pgTAP case added; `budget-page.test.tsx` stale `totalBudgetedCogs` assertion updated (server recomputes).

## Residual (tracked, not blocking dev)
- **A4 true fix → F:** snapshot job sets `app.reporting_org` GUC; policies scope `with check (org_id = current_setting(...))`. (`docs/backlog.md` F.)
- A2 guard tests task + follow_up branches; weekly_update/daily_log branches are code-verified-identical (columns confirmed).

**Verdict: MERGE to dev.** Full battery green. main promotion stays owner-gated at F.
