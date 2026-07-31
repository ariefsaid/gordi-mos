-- M1 (security audit 2026-07-08, docs/reviews/security-audit-dev-main-2026-07-08.md "Medium — M1";
-- open follow-up in docs/reviews/dev.md): close the last open security finding in the repo.
--
-- mos.budgets / mos.budget_lines retain DIRECT insert/update grants on `authenticated`
-- (20260710000003_mos_budgets.sql:99-100) that BYPASS the mos.capture_budget SECURITY DEFINER RPC
-- (20260712000003_mos_capture_budget_rpc.sql). The `mos` schema is PostgREST-exposed, so a finance/admin
-- user (a cogs.write holder) can POST/PATCH mos.budgets / mos.budget_lines DIRECTLY and skip the two
-- guarantees the RPC is the intended sole write path for:
--   (a) the server-side recompute of total_budgeted_cogs from the linked cost lines (the A5
--       "no client-trusted total" fix) — a direct write can set any arbitrary total;
--   (b) the same-org owning_bu_id check (review A1-class cross-org reference seam, RPC step 2a) — a
--       direct write can hang a budget off another org's business unit via the existence-only FK.
-- created_by is also mutable on a direct UPDATE (no immutability guard, unlike mos.tasks).
--
-- The fix is proportionately small because the write surface is already correct on every reachable path:
--   1. mos.capture_budget is SECURITY DEFINER (20260712000003:38), so it keeps working after the table
--      grants are revoked — it inserts into mos.budgets / mos.budget_lines as its OWNER, not as the
--      caller. (Verified against the catalog: prosecdef = true.)
--   2. The client never writes the tables directly. mos-app/src/lib/db/plan-budget.ts reads via
--      `.from('budgets').select(...)` and writes ONLY via `.rpc('capture_budget', ...)`; there is no
--      UPDATE / archive path in the client. (grep-verified across mos-app/src.)
-- So narrowing the write path to the RPC loses no legitimate behaviour. SELECT on both tables is kept
-- unchanged — the finance/admin READ surface is untouched. The INSERT/UPDATE RLS policies stay in place
-- as defence-in-depth behind the RPC's own checks; they are simply no longer the first line.
--
-- pgTAP proof: supabase/tests/78_mos_budgets_rls_link.sql now asserts the direct insert is REFUSED
-- (42501) AND that finance can still capture via mos.capture_budget (AC-PB-013 / AC-PB-009).

revoke insert, update on mos.budgets        from authenticated;
revoke insert            on mos.budget_lines from authenticated;

-- DOWN:
-- grant select, insert, update on mos.budgets        to authenticated;  -- restores the pre-M1 grants (re-opens the bypass — do NOT do this on a shared prod DB)
-- grant select, insert            on mos.budget_lines to authenticated;
