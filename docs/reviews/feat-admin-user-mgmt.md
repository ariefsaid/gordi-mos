# Review ledger — feat/admin-user-mgmt

Diff scope: `git diff cf84cba..HEAD` — admin user-management feature: 3 SECURITY DEFINER provisioning RPCs (`shared.admin_create_login/reset_password/set_login_enabled`) + `admin_list_login_status` read RPC + widened `shared.people` admin write policies + `_guard_people` + extended `_guard_person_access_roles` (no-lockout) + pgTAP 52–57; SPA admin-only `/admin/people` page (list, create person + optional login, reset/disable/enable login, grant/revoke roles, archive/restore) + data layer + route guard + nav.

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
| `npm test` (Vitest) | PASS (1236/1236) |
| `supabase test db` (pgTAP) | PASS for admin 52–57; pre-existing unrelated `51_` AC-213 failure (not this branch) |

## Decision

**HOLD** — design REWORK + security/spec/CQ must-fixes. Rework rounds: (A) DB — H-1 archive no-lockout guard + M-1 org-scope `_count_active_admins` + pgTAP arms; (B) UI — mobile action sheet, confirm dialogs (§4.7), `--shadow-overlay` token, dialog focus management, last-admin UI surfacing, success toasts, route→`/admin/people`, action-layer behavior tests (lift coverage ≥80%), drop dead code. Then re-run design-review + security re-verify, flip verdicts, re-run pre-merge-check.
