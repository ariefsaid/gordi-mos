# Review ledger — `claude/redesign-buildout-completion-vdrd17` (redesign buildout steps 4–11, cloud autonomous run OD-REDESIGN-67)

**What this branch is:** `origin/claude/redesign-buildout-completion-6vu4tr` (= `feat/redesign-buildout`
steps 1–3 + the base-closing reviews, all four verdicts APPROVE, gate exit 0) **plus the complete
autonomous build-out of steps 4–11**: Signal v1, Home proper, Occurrence-as-tasks, Café retrofit,
catalog re-home closure, Money+Inbox alignment (flag-gated), Events stub, and the decommission sweep —
each step carried through the full battery (spec → code-quality → design 4-lens rendered → security
where schema/RLS changed), every BLOCK fixed and re-verified, per OD-REDESIGN-67 (owner reviews once,
after step 11).

**Evidence of record (one ledger per step — full findings, fix waves, scope cards, ratify items):**
- Step 4 Signal v1 — `claude-redesign-buildout-completion-vdrd17-step4.md`
- Step 5 Home proper — `feat-redesign-buildout.md` §"Step 5" (scope card, fix wave, re-review)
- Step 6 Occurrence-as-tasks — `claude-redesign-buildout-completion-vdrd17-step6.md`
- Step 7 Café retrofit — `claude-redesign-buildout-completion-vdrd17-step7.md`
- Step 8 Catalog re-home — `claude-redesign-buildout-completion-vdrd17-step8.md`
- Step 9 Money + Inbox — `claude-redesign-buildout-completion-vdrd17-step9.md`
- Step 10 Events stub — `claude-redesign-buildout-completion-vdrd17-step10.md`
- Step 11 Decommission sweep — `claude-redesign-buildout-completion-vdrd17-step11.md`
- Design-authority audit (token authority, mockup ownership, calibration fixes, O1–O3 dispositions) —
  `design-authority-audit-2026-07-17.md`

## Verdicts

<!-- Machine-read by scripts/pre-merge-check.sh. Last line per review wins. -->
<!-- Consolidated: every step's battery is APPROVE in its own ledger; the lines below summarize the
     branch-wide outcome. Steps with BLOCK→fix→APPROVE cycles: 4 (design: unstyled surfaces;
     security: HIGH-1), 5 (design: Rule-8 phone), 6 (design: due-list flood; pending re-review below). -->

- spec: APPROVE — per-step spec reviews (opus), 2026-07-16/17: steps 4, 5, 6, 7, 8, 9, 10, 11 all
  APPROVE with AC-by-AC coverage tables in the step ledgers; every AC owned by one test at its layer.
- code-quality: APPROVE — per-step code-quality reviews (opus): steps 4–11 all APPROVE; step-6
  fix-then-ship items (silent write failures, useOccurrenceGroups extraction) FIXED and verified.
- design: APPROVE — all eight steps. Steps 4, 5, 6 each BLOCK→fix→re-review APPROVE with rendered
  evidence (step 6's manager front re-scored 4/10→8.5/10); steps 7, 8, 9, 10 first-pass APPROVE.
  HOLISTIC cross-module pass (final visual/regression, 3 personas × 2 breakpoints): SHIP — one
  grammar confirmed, retired surfaces absent everywhere (rail/⌘K/routes), F1/F2/F3 frictionless at
  390px, table-density convention holds. Its 2 Important + 2 copy minors fixed in 785cdf3 (Deputy
  retired-noun chip, catalog Add composes its noun, Money H1, NotFound link).
- security: APPROVE — security-auditor (opus): step 4 BLOCK (HIGH-1 + 3 Low) → all empirically
  CLEARED; step 6 APPROVE (0 Critical/High; Low-1/2/3 hardened in the fix wave, re-verified by
  pgTAP). Steps 5/7/8/9/10/11 carry no new auth/RLS/schema surface beyond those audits' scope.

## Gates (branch tip, Director-run)

| Gate | Result |
|---|---|
| `npm run typecheck` | PASS — 0 errors |
| `npm run lint -- --max-warnings=0` (eslint + stylelint) | PASS — 0 |
| `npm test` (Vitest) | PASS — 273 files / 2760 tests (post-sweep tree) |
| `supabase test db` (pgTAP) | PASS — 100 files / 727 tests |
| `npx playwright test` (full live e2e) | PASS — 52 passed / 2 intentional skips (F1, F2, F3, AC-630, AC-720 all green) |
| `bash scripts/pre-merge-check.sh` | **PASS — exit 0** (all required reviews cleared; run 2026-07-17 at branch close) |

## Ratify before merge (consolidated — the owner's one post-step-11 list)

Every conservative default taken while the owner was absent, with its home ledger:
1. **Q1 Signal-on-Home** — provisionally approved (OD-REDESIGN-59); built as specified. (step 4)
2. **`can_read_signal` SECURITY DEFINER** — deviation from ADR-0050 D4 (INVOKER recurses); ratify into the ADR. (step 4)
3. **`comments_select` signal tightening** — reader-of-parent SELECT gate. (step 4)
4. **A7 fixture role-strip reading** of AC-403/406 (Team membership alone ≠ read under BU-scoped R2). (step 4)
5. **Attention pill not built** (spec §4 had no owning AC) — defer vs follow-up. (step 4)
6. **Record surface panel-only** (page-mode branch unbuilt). (step 4)
7. **"Owning Team" / "Occurred at" composer labels** — spec-literal wording kept; plain-language rename optional. (step 4)
8. **Region-order store = localStorage** (profile column later) + inline Home toggle + "My items first" wording. (step 5)
9. **Step-6 RATIFY-1..10** — extend work_lines; WIB period keys; explicit-Start no-scheduler; shallow supervisor resolution; ops_lead+admin `process.start`; org-readable runs; pending-never-guess; idempotency grain; human completion; OD-12 checklist boundary. (step 6)
10. **Step-7 RATIFY-7A..7F** — members cannot start the opening (7A, the load-bearing café call); no kitchen-schema bridge (7B); dev-seed-only binding (7C); /cafe as Café home (7D — shipped); capability mirror (7E); name-based process resolution (7F). (step 7)
11. **RATIFY-8A ⌘K-only catalog access on phone** — Option A implemented and design-endorsed. (step 8)
12. **SHOW_FOLLOWUPS stays false** (backup/restore go-live gate); Door-2 minimal link pending its flag-on design review. (step 9)
13. **Events placeholder copy** (rewritten post-review — final wording yours) + quiet archetype. (step 10)
14. **Modules stay in the rail** — Director default; override window open until merge. (inherited)
15. **AC-013 footer wording** amendment (security HIGH-1 era). (inherited from base)

## Deferred debt (tracked, non-blocking)

- Signals feed/archive pagination before volume grows (step 4 CQ). Fan-out concurrent-uncommitted
  race (B2B-era). `due_process_runs` weekly/monthly surfacing + scale. Assign-dialog focus-trap
  (house overlay debt). Dedicated café-lead e2e persona (replaces the shared-persona grant).
  FR-708 deep-link as rendered link (currently description text). Step-10 phone ⌘K launcher
  affordance polish.
