# Review battery — `feat/ar-followup-bridge` (Issue C: AR / Follow-up settlement bridge v1)

- **Slice:** MOS becomes the per-invoice settlement system-of-record replacing Finance's recon gsheet —
  `mos.follow_ups` + `mos.follow_up_events` + the single `mos.transition_follow_up` SECURITY DEFINER RPC +
  reconciliation views + the Work Follow-up queue. Ships dark (`SHOW_FOLLOWUPS` off). ADR-0019 D5, D14 step 4.
- **Spec:** `docs/specs/follow-up-bridge.spec.md`. **Plan:** `docs/plans/2026-07-07-follow-up-bridge.md`.
- **Build:** gpt-5.5 (z.ai/GLM rate-limited; fallback). **Base:** rebased onto dev `35ca2a6` → merged `937eaf7`.
- **Risk:** HIGH — money-path (settlement lifecycle + running balance + evidence + RLS + SECURITY DEFINER RPC).

## ⚠️ Review-independence caveat (money-path)
Cross-family review normally = gpt-5.5 vs the GLM builder. Here **both providers were rate-limited**, and
gpt-5.5 *built* this — so there is **no separate cross-family review**. The safeguard is a **thorough Director
manual review** of the RLS + RPC + money-math (below) **plus an independent pgTAP re-run** (509 PASS, incl.
the follow_ups RLS + transition-RPC contract tests). It ships **dark**. **A GLM cross-family review is queued
before F / prod-enable** (when quota resets) as the extra money-path pass.

## Verdict lines (machine-checked by `scripts/pre-merge-check.sh`)
- spec: PASS — gpt-5.5 authored + Director-reviewed; matches decisions.md AR1/AR2/AR3 + CONTEXT.md Follow-up.
- code-quality: PASS — Director read the migration end-to-end: single gated write point (RPC), one verb per transition, clean state-machine, reconciliation views honest (security_invoker; drift real not faked).
- design: PASS — Work Follow-up queue structure verified; **visual render + the Home AR tile (AC-522/523) deferred to F** (Home composition — the tile drops into E's money-position-section slot; see the defer commit).
- security: PASS (Director deep-review — the money-path safeguard) — verified: (1) RPC **cross-org guard** before any gate/write (the SECURITY DEFINER footgun — handled); (2) **writes ONLY via the RPC** (no authenticated insert/update/delete policy on either table; force RLS); (3) **settle/partial require evidence + cash_in_date at BOTH the RPC AND a DB CHECK constraint**; (4) money-math invariant (balance ≥ 0, ≤ original, partial ≤ balance, settle zeroes) at RPC + table checks; (5) chase-vs-confirm split (`can_work_lane` for chasing / `followup.confirm` for Finance); (6) **no ESB write-back**; (7) caller-JWT (RPC DEFINER scoped by explicit org + capability gates); (8) reversible DOWN. pgTAP 74/75 prove the RLS + RPC contracts.

## Battery evidence (Director-re-run)
- `npm run typecheck` → **0**. `npm run lint` → **0**. `npm test -- --run` → **2283/2283** (after deferring the Home tile test).
- `supabase db test` → **Files=76, Tests=509, Result: PASS** (Director's own re-run — NOT the builder's self-report, which for the sibling D slice proved unreliable).
- e2e `AC-524-follow-up.spec.ts` (RPC lifecycle proof) authored; builder self-reported 1 passed; the RPC lifecycle is also covered by pgTAP 75.
- Rebase onto dev resolved 5 conflicts (4 additive flags/keys/routes; `home-page.tsx` resolved to E's refactor with the AR tile deferred to F).

## Deferred to F (Home composition)
- The **Home AR aging tile** (AC-522/523) — drops into E's `money-position-section.tsx` slot when
  `SHOW_HOME_STACKED` + `SHOW_FOLLOWUPS` flip at rollout. Re-add the tile + its test then.
- **GLM cross-family money-path review** — run when z.ai quota resets, before prod-enable.
- Test-file numbering: C's `74/75` pgTAP collide with D's `74/75/76` — **renumber D at D's merge** (C landed first).
