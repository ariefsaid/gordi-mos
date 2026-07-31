# Plan — Follow-up settlement bridge v1 (2026-07-07)

- Spec: `docs/specs/follow-up-bridge.spec.md`. Authority: ADR-0019 D5/D13/D14-4, ADR-0020,
  ADR-0012, CONTEXT.md *Follow-up*/*Pending bill*, decisions.md AR1/AR2/AR3.
- Branch: `feat/ar-followup-bridge` (worktree; work in place, commit, do NOT push/merge).
- Verify gates (from `mos-app/`): `npm run typecheck` · `npm run lint:ci` · `npm test -- --run`
  · `cd supabase && supabase db test` · `npx playwright test e2e/AC-524-follow-up.spec.ts`.

## Task 1 — Migration: tables, capability, helper, RPC, recon views
File: `supabase/migrations/20260709000001_mos_follow_ups.sql` (after `20260708000002`).
- `mos.follow_ups` + `mos.follow_up_events` (§2 schema, CHECKs, partial-unique, indexes).
- `shared.role_capabilities` seed: `followup.confirm` → finance + admin.
- `mos.can_work_lane(p_lane text)` — STABLE SECURITY INVOKER; admin OR held-role BU-code match.
- `mos.transition_follow_up(p_follow_up_id, p_transition, p_options jsonb) returns mos.follow_ups`
  — SECURITY DEFINER; lock → cross-org guard → lane/capability gate → state-machine + required
  fields → write event → recompute balance/state → return row. `set search_path = ''`, revoke
  public/anon, grant `authenticated`.
- RLS: read policies FR-503/504 (admin OR finance OR can_work_lane(lane)); NO insert/update/delete
  policies for authenticated (service_role only) → FR-514.
- `mos.follow_up_recon_summary` (view), `reporting.esb_ar_reduction` (table, finance/admin RLS),
  `mos.follow_up_recon_drift` (view). Grants to authenticated/service_role. Reversible DOWN.
- Verify: `cd supabase && supabase db reset` applies clean.

## Task 2 — pgTAP suite (RLS + RPC contracts + money invariant)
Files: `supabase/tests/74_follow_ups_rls.sql`, `75_follow_up_transition_rpc.sql`.
Test-seed helper `mos._test_seed_follow_ups()` (SECURITY DEFINER, postgres/service_role only)
seeding: coded BUs (`b2b_sales`/`retail_ops`) under org WU-A, 2 chasers (one per lane) + a
finance holder, and open b2b_ar + retail_pending follow-ups. AC-500..519, AC-517 money check.
- Verify: `cd supabase && supabase db test` → 74/75 green (and the whole suite still green).

## Task 3 — Frontend substrate
- `mos-app/src/config/features.ts`: add `export const SHOW_FOLLOWUPS = false`.
- `mos-app/src/lib/db/directory.ts`: extend `BusinessUnitOption` + select to include `code`
  (additive; existing callers ignore the field).
- `mos-app/src/lib/follow-up-lanes.ts`: client derivation — `canWorkAnyLane(roles, bus)` and
  `canWorkLane(lane, ...)` from the viewer's held-role BU codes (mirror server `can_work_lane`;
  RLS remains the authority).

## Task 4 — Data module + types
File: `mos-app/src/lib/db/follow-ups.ts` (+ `.types.ts`).
- `listFollowUps(filters)` / `listFollowUpEvents(id)` / `transitionFollowUp(id, verb, opts)`
  via `supabase.schema('mos')` + `rpc('transition_follow_up', …)`. Typed `FollowUpRow`,
  `FollowUpEvent`, `FollowUpTransition`, `FollowUpRpcError` (P0003 / 42501 / P0002 branches).
- Aging helpers (overdue/soon via `due_date` + WIB today — reuse `due-status.ts`).
- Recon: `listReconSummary()`, `listReconDrift()` (finance/admin surface).
- Unit tests `follow-ups.test.ts` (mock supabase: list/transition/error-code mapping).

## Task 5 — Work Follow-up queue page
Files: `mos-app/src/pages/follow-ups-page.tsx` (+ `.css`, `.test.tsx`).
- `PageFrame variant="data"`; loads lane(s) from viewer; table rows = counterparty · original ·
  running balance · state pill · due/aging · assignee; inline advance buttons per valid
  transition (chase / promise / partial / settle / confirm).
- Settle + partial open an inline form (amount [prefill = balance for settle] · cash_in_date ·
  evidence · note); settle/partial disabled until required fields present (AC-521).
- Confirm shown only to finance/admin; chasers never see the confirm button.
- Read-only source_invoice_ref drill link; error/loading/empty states; optimistic refresh.
- RTL tests: render rows + state-correct buttons (AC-520), settle-disabled-until-required
  (AC-521), confirm-hidden-for-chaser.

## Task 6 — Home AR-aging tile + nav + i18n + router
- `mos-app/src/pages/home-page.tsx`: add the AR-aging tile (gated `canSeeFinance ||
  canWorkAnyLane`; members see nothing — AC-522), showing overdue · chased · promised · partial
  counts, drilling to `/work/follow-ups` (AC-523). Behind `SHOW_FOLLOWUPS`.
- `mos-app/src/shell/destinations.tsx`: add `/work/follow-ups` (labelKey `nav.followUps`) to the
  Work destination, behind `SHOW_FOLLOWUPS`.
- `mos-app/src/router.tsx`: add `work/follow-ups` route → `<FollowUpsPage />` (or `<Navigate>`
  when flag off).
- `mos-app/src/i18n/messages.ts`: add `nav.followUps` + follow-ups.* strings, en + id (parity).
- `home-page.test.tsx`: member→no tile (AC-522); finance→tile + drill (AC-523).

## Task 7 — e2e
File: `mos-app/e2e/AC-524-follow-up.spec.ts`.
- Seed an open `b2b_ar` follow-up (service-role /pg/query). VIEWER (Cahya — holds Sales Lead →
  b2b_sales lane) chases → promises → partials → settles-with-evidence → reaches `settled`.
  Fitri (finance) signs in + confirms → `confirmed`. Teardown removes the seeded rows. (AC-524.)
- Requires `SHOW_FOLLOWUPS = true` for the e2e run only — set via the e2e env (the flag is a
  build-time const, so the e2e is run with the flag flipped in a committed e2e override, OR the
  route is exercised directly). Decision: flip `SHOW_FOLLOWUPS=true` is a code change the
  Director owns at go-live; the e2e therefore drives the route + RPC directly and asserts the
  DB state, decoupled from the flag (the flag only hides chrome). Documented in the spec header.

## Task 8 — Final gates + commit
- `npm run typecheck` (0) · `npm run lint:ci` (0) · `npm test -- --run` (green) ·
  `cd supabase && supabase db test` (green) · `npx playwright test AC-524` (green).
- Commit per task with trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Report `git log --oneline dev..HEAD`; flag RLS/money/flag-gating choices for the Director.
