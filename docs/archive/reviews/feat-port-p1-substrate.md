# Review battery — `feat/port-p1-substrate` (ADR-0018 P1: view-composition substrate)

**Scope:** `git diff dev...feat/port-p1-substrate` — the ported-adapted trusted core (viewspec
types/registry/compiler/executor/schema/renderer), `mos.user_views` + `shared.is_managed_by` +
pgTAP, user-views DAL, DEV+flag-gated harness (`/dev/views`), i18n keys, firewall test, e2e (authored,
skip-gated). Plan: `docs/plans/2026-07-04-port-p1-substrate.md` (plan-first; §7a-style Director
annotations: compose-view→P2 confirmed, D7 pragmatic ceilings adopted).
**Run:** 2026-07-04, Director-orchestrated. Build: 3 agents (sonnet ×2, ui-sonnet); reviews opus ×3;
fix wave ui-sonnet; Director render-verify ×2 (pre/post hydration).

### Machine-readable verdicts (parsed by `pre-merge-check.sh`)
- spec: SHIP — compliant (opus): all 20 AC-UV ids owned at layer; whitelist=7 entities, org_id in no allowedColumns; ceilings per Director-confirmed split; P2 boundary held (zero LLM/edge-function). Its two Importants: the flag flip was the Director's own uncommitted verify edit (reverted), the ledger is this file.
- code-quality: SHIP — fix-then-ship (opus) with all 3 Importants FIXED in the fix wave: aggregate-truncation signal + lower-bound caveat; compiler unions groupBy/aggregate columns into resolvedSelect; renderer useMemo derive (no loading flash). Minors fixed too (MAX_PANELS constant, Link vs href, in-list cap, c8-ignored dead branch with WHY).
- design: SHIP — Director render-verify post-hydration: DataTable renders the REAL kit primitive (desktop `<table>` id/title/status/due_date × 6 live rows; **phone-card mode at 380px** — the primitive's own responsive behavior, proving genuine hydration); KPITile hydrates aggregate over a reporting entity under the finance JWT; save-rejection UX surfaces the ValidationError code. Screenshot: p1-harness-hydrated-desktop.jpeg.
- security: PASS — CLEAR-WITH-HARDENING (opus), hardening LANDED same-battery: M1 save-time compile gate (live-verified: `pg_shadow` spec → "Spec rejected — UNKNOWN_ENTITY", not persisted); L1 no-spec-data-in-JSX invariant documented + XSS-inertness tested (was P2 debt, pulled forward with the Director's hydration overrule); L2 in-list cap; L4 shape guards. Auditor's own adversarial probes (prototype pollution, case tricks, orderBy injection, groupBy escalation, cycle bombs on is_managed_by, dual-hat inversion) all blocked; harness confirmed DCE'd from prod bundle.

## Evidence
- **1907 Vitest green** (172 files) · **356 pgTAP green** (incl. 13 new user_views RLS assertions,
  verified line-by-line) · typecheck clean · ESLint `--max-warnings=0` clean · changed-file coverage
  ≥80% everywhere (most ≥97%).
- Director overrule during battery: renderer's plan-sanctioned "name + row count" hydration rejected —
  **real primitive hydration** (DataTable/KPITile/FreshnessLabel, text-only binding) landed with the
  security invariant as a tested constraint.
- Live render-verify (Fitri/finance): compose→save→persist (RLS row)→reopen→render loop end-to-end;
  cross-plane spec (mos tasks + reporting revenue) both render; flag-gate held (route absent until the
  local flag flip; flip reverted, committed default stays `false`).

## Follow-ups (tracked, non-blocking)
- **P2 items:** DB-side aggregation (the 500-row truncation becomes a real limit for wide reporting
  windows — P1 surfaces `truncated` honestly); server-side spec re-validation in compose-view (never
  trust client compile); drill-hrefs need the URL-scheme allowlist when they arrive; ChartFrame data
  binding (frame renders with a pending note).
- orderBy is a documented no-op under aggregate (comment at the executor); revisit if composers hit it.
- `views.panel.rows` English-only pluralization — fine for the dev harness, revisit if it graduates.
- e2e `dev-views.spec.ts` authored, skip-gated on SHOW_USER_VIEWS — activates when the flag ships.

## Sign-off
- All four lenses green; every Important + the Medium fixed and re-verified inside this battery.
- Remaining before merge: `bash scripts/pre-merge-check.sh` exit 0 on this branch.
