# Review ledger — feat/admin-user-mgmt

Diff scope: `git diff cf84cba..HEAD` — admin user-management feature: 3 SECURITY DEFINER provisioning RPCs (`shared.admin_create_login/reset_password/set_login_enabled`) + `admin_list_login_status` read RPC + widened `shared.people` admin write policies + `_guard_people` + extended `_guard_person_access_roles` (no-lockout) + pgTAP 52–57; SPA admin-only `/admin/people` page (list, create person + optional login, reset/disable/enable login, grant/revoke roles, archive/restore) + data layer + route guard + nav.

## Verdicts (Round 2 — FINAL, 2026-06-29)

Round-1 must-fixes all landed (5 UI fix commits + the security H-1/M-1 fix commit). Re-verified by the
Director: typecheck/lint clean, Vitest 1321/1321 (was 1236 → +85 incl. the coverage-gap tests), pgTAP
admin 52–57 green (H-1 no-lockout + M-1 org-scope proven by `56_admin_no_lockout_and_org.sql`), and a
**rendered-live Round-2 design review (PASS)** confirming all five Round-1 visual defects + the mobile
dead-button are fixed on screen.

- spec: FIX-THEN-SHIP — Round-1 defect (mobile "Manage" no-op) fixed + confirmed on screen (Round-2 design).
- code-quality: FIX-THEN-SHIP — Critical (mobile dead button) fixed; coverage-gap Important addressed (+85 tests, gates green); minors cleared/accepted.
- design: PASS — design-reviewer 2026-06-29 (round 2, rendered live, Dewi/admin). All 5 round-1 fixes confirmed (toggle knob, dialog borders/input token, human role labels, search+status toolbar, portaled edge-flipping ⋯ menu — never clipped at viewport bottom) + mobile dead-button fixed; Lens A/B/C/D clean for this surface. Two **pre-existing, app-wide** token notes carried out-of-band (NOT this branch): `--radius-lg` renders 8px vs DESIGN.md 12px; status-pill radius 6px vs full.
- security: FIX-THEN-SHIP — H-1 (archive-last-admin self-lockout) + M-1 (org-scope `_count_active_admins`) fixed and covered by pgTAP `56`; M-2/L-1/L-2 staging-acceptable / prod-followups (ADR-0016 defers the prod auth surface to the D11 gating review). Trust root confirmed SOLID in Round 1.

**Out-of-band (not blocking this branch):** the app-wide `--radius-lg` 8px-vs-12px regression (DESIGN.md mandates 12px; `src/index.css:129` override) is fixed separately off main, with a DESIGN.md reconciliation of the contested OD-P3-10-vs-"mockup 2026-06-20" comment.

## Verdicts (Round 1 — 2026-06-26)

- spec: FIX-THEN-SHIP — spec-reviewer 2026-06-26. All ACs/FRs genuinely implemented + proven (Vitest 1236, pgTAP 52–57 green). Defect: mobile "Manage" button dispatches unhandled `'manage'` → no-op. Flagged pre-existing unrelated failure `51_mos_cascade_lookups` AC-213 (out of scope, raise separately).
- code-quality: FIX-THEN-SHIP — code-quality-reviewer 2026-06-26. Critical: mobile dead button. Important: changed-code coverage <80% gate (`user-table.tsx`/`handleAction` untested). Minor: dead `useAuth` in create-person-dialog, RPC preamble duplication, stringly-typed `onAction`.
- design: REWORK — design-reviewer 2026-06-26 (code+design-plan conformance; admin route not renderable in dev). Critical: (a1) undefined `--shadow-overlay` token → flat overlays; (b1) no confirm dialogs for reset/disable/archive (plan §4.7 unbuilt); (b2) mobile "Manage" no-op; (a11y-1) no focus-trap/return on AddPerson+RoleEditor. Important: last-admin guard not surfaced in UI; no success toasts; reveal `aria-describedby`; menu keyboard semantics; route noun `/admin/users`→`/admin/people`.
- security: FIX-THEN-SHIP — security-auditor 2026-06-26. Must-fix: **H-1** archive-last-admin org self-lockout (`_guard_people` lacks the no-lockout branch the disable/revoke arms have); **M-1** `_count_active_admins(p_org)` is an authenticated cross-org admin-count oracle (force `p_org = current_org_id()`). Staging-acceptable/prod-followup: M-2 email validation, L-1 `random()` in temp-pw suffix, L-2 clipboard no auto-clear. Trust root (hook-minted unspoofable claims, fail-closed RPC authz, EXECUTE posture, `_guard_people` role-scoping, org-spoof proof) confirmed SOLID.

## Gates (Round 1)

| Gate | Status |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` (Vitest) | PASS (1321/1321 — Round 2) |
| `supabase test db` (pgTAP) | PASS for admin 52–57. (Round-1 local `51_` AC-213 "failure" was shared-local-DB contamination from the stacked cascade `objectives→admin-only` migration, which is NOT on this branch; a clean CI `db reset` from this branch's migrations passes 51.) |

## Decision (Round 2 — FINAL)

**MERGE-READY** — all Round-1 must-fixes landed and re-verified; design re-reviewed live → PASS; `pre-merge-check.sh` exits 0. Ready for **owner merge** (the human checkpoint, per product-expectations Part C). On merge: `supabase db push` to staging, then rebase the stacked `feat/cascade-catalog` onto updated main and merge it. Out-of-band follow-up (separate change, off main): the app-wide `--radius-lg` 12px regression + status-pill radius.

### Decision (Round 1 — superseded) — HOLD
design REWORK + security/spec/CQ must-fixes; rework rounds A (DB: H-1/M-1 + pgTAP) + B (UI: action sheet, confirm dialogs, `--shadow-overlay`, focus mgmt, last-admin surfacing, toasts, route→`/admin/people`, coverage, dead code), then re-review + flip verdicts. ✅ all completed in Round 2 above.
