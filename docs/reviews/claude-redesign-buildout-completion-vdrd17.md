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
- design: BLOCK — reopened 2026-07-18 (DESIGN-FIDELITY-1, rail) — see below. *(retained history)*
- design: APPROVE — 2026-07-18, fidelity restored and **parity-verified by measurement**: rail
  (DESIGN-FIDELITY-1) + the full two-axis sweep's Importants all fixed and re-measured (A1 ⌘K SVG
  icons 0-emoji · A2 heading navy 15/700 · A3 th 600/38 · A4 radius cascade fixed · B2 sketch plain
  labels · OD-68 sketch rail). Evidence: `parity-sweep-2026-07-18.md` § Resolution. Remaining design
  items are owner-gated ratify features (Signal full-page, canonical composer, shared drawer host,
  Inbox triage, attention control, image-attach slice per OD-69i) — tracked in the ratify list, not
  fidelity blocks.
- security: APPROVE — security-auditor (opus): step 4 BLOCK (HIGH-1 + 3 Low) → all empirically
  CLEARED; step 6 APPROVE (0 Critical/High; Low-1/2/3 hardened in the fix wave, re-verified by
  pgTAP). Steps 5/7/8/9/10/11 carry no new auth/RLS/schema surface beyond those audits' scope.

## Gates (branch tip, Director-run)

| Gate | Result |
|---|---|
| `npm run typecheck` | PASS — 0 errors (tip `37cc2ed`, 2026-07-20) |
| `npm test` (Vitest) | PASS — 280 files / **2868** tests (tip `37cc2ed`, 2026-07-20 — post-cohesion) |
| `supabase test db` (pgTAP) | PASS — 100 files / 727 (2026-07-17; no schema change since) |
| `npx playwright test` | **PASS — exit 0, 54 passed / 2 skipped** (tip `37cc2ed`, 2026-07-20). ⚠ The two prior "green" runs were piped through `tail`, hiding a 6-failure block + masking the exit code — 5 stale oracles + 1 real Rule-5 regression fixed to get here honestly. |
| `bash scripts/pre-merge-check.sh` | PASS — exit 0 (verdicts as recorded; Director-commit range awaits independent battery per the truthful boundary) |

## Ratify before merge — THE CANONICAL OPEN-DECISIONS REGISTER

> **This section is the single source of truth for "what still needs the owner."** A cold-start
> comprehension test (2026-07-20) found the same items described in three places with three
> different status words — the exact drift that lets an item look settled in one doc and open in
> another. Fixed by DESIGNATION, not by adding a doc: `docs/plans/AUTONOMOUS-RUN-STATE.md` and
> `docs/reference/provenance/owner-directives-index.md` now POINT here instead of restating status.
> If any doc disagrees with this list, **this list wins** — and that doc is stale, fix it.
>
> **One status vocabulary. Use exactly these words:**
> - **OPEN** — needs an owner decision before merge. Nobody but the owner resolves it.
> - **PROVISIONAL** — owner approved the *direction*; the final look/wording is still the owner's.
> - **RESOLVED** — the owner ruled (cite the OD); kept here only for traceability.
> - **DEFERRED** — consciously not-now, with a named tracker. Not an owner decision.

Every conservative default taken while the owner was absent, with its home ledger:
1. **PROVISIONAL — Q1 Signal-on-Home** — direction approved (OD-REDESIGN-59), built as specified;
   the FINAL LOOK is reserved to the owner's walkthrough. (step 4)
2. **OPEN — `can_read_signal` SECURITY DEFINER** — deviates from ADR-0050 D4 (INVOKER recurses
   infinitely under self-referential RLS). **This is a DOC-RECONCILIATION item, not an unresolved
   security hole:** the security re-audit APPROVED the shipped function (PUBLIC execute revoked,
   verified), so `security: APPROVE` above is correct — what's open is amending ADR-0050's text to
   match the shipped INVOKER→DEFINER decision. (step 4)
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
14. ~~Modules stay in the rail~~ — **RESOLVED by OD-REDESIGN-68 (owner, 2026-07-18): the rail shows
    your work.** Sketch rail for org-wide roles; role-affiliated modules (flat, no BU headings) for
    floor/BU roles. Implemented + tested (AC-011/011b/011c, More-menu) same day. Open follow-up:
    the phone bottom-tab bar still hardcodes Café as a primary tab for everyone — apply OD-68 there
    or ratify the exception.
15. **AC-013 footer wording** amendment (security HIGH-1 era). (inherited from base)
16. **Signal Retract has no UI** (DB gate only) — author/deputy cannot retract from the app; decide
    defer vs follow-up. (step 4; lifted by the intent-fidelity audit)
17. **Signal "Create follow-up Task" is a minimal title-only capture** (auto R=A=viewer), not the
    canonical Task composer prefilled — confirm or upgrade. (step 4; lifted by the audit)
18. **Weekly-Update team roster on Home** — FIXED post-audit (TeamModule now suppressed by
    hideLegacyCadenceCards per OD-33/48/64); ratify whether `SHOW_WEEKLY_UPDATES` should flip to
    false globally now that no redesign surface consumes the write flow. (steps 5/11; audit twist #1)

## Design fidelity — reopened (2026-07-18, owner-caught, BLOCKING)

**DESIGN-FIDELITY-1 — the rail's treatment was never ported from e7; only the color tokens were.**
The step-1 styling pass warmed the token *values* (background/navy/blue — genuinely applied) but did
not wire e7's rail *treatment*: which elements use which token, at what metric/state. Measured
`getComputedStyle`, same elements, both rendered (`d92f63d` app :5173 vs e7 :8766):

| Property | e7 (owning mockup) | app | |
|---|---|---|---|
| **Selected bg** | `rgba(54,97,226,0.1)` blue wash | `p3(.984,.976,.957)` — warm-grey ~1.5% off page bg | ❌ washed out |
| **Selected text** | `rgb(29,72,201)` blue | near-black | ❌ no color cue |
| **Selected weight** | 600 | 500 | ❌ |
| **Rail bg** | `rgb(253,253,252)` panel | transparent | ❌ no rail surface |
| Nav-item height | 36px | 28px | ❌ tighter |
| Item padding | 0 10px | 0 8px | ❌ |
| Font-size | 13.5px | 14px | ❌ |

**Severity: Important / blocking.** It is the first surface seen and the selected-state is the
primary "where am I" cue; washed to ~invisible, the whole rail reads as unstyled — the owner's exact
report. **Fix location:** `mos-app/src/shell/rail-nav.tsx`, the nav-item active-branch `className`
(currently `bg-accent font-medium` → resolves to the near-invisible warm-grey) + the rail container
needs a panel background. Port e7's values above. This is a Rule-11 / SALVAGE fidelity port ("e7 OWNS
the visual system"), not a redesign of it — use e7's exact values, do not invent.

**Why every prior stage missed it (process finding, fixed).** Lens (a) checked *"token fidelity — no
off-palette values"*, which PASSES on the wrong token at the wrong metric (the app is 100% on-palette
and still wrong). No review — per-step, holistic, or the mockup cross-version audit — did a
computed-style diff of the same surface in both e7 and the app; the mockup audit was tuned for
*structural forks* (same rail structure = "FAITHFUL") and treatment gaps inside a faithful structure
fell through. Same shape as this project's recurring silent-proxy failures (grep-crash secret scan,
git-fail merge gate, storage-wipe auth test): the pass condition stands in for the goal, passes, and
the goal fails silently. **Method fixed:** a MANDATORY computed-style parity step is now in
`design-reviewer.md` Lens (a) and `docs/design-workflow.md` §2 — measure the composed result vs the
owning mockup, never infer fidelity from tokens-present or a screenshot glance.

**DESIGN-FIDELITY-1 — RESOLVED 2026-07-18** (`mos-app/src/shell/rail-nav.tsx`, `itemBase`). Root cause
confirmed at token level: active `bg-accent` → `--surface-secondary` = `p3(.984,.976,.957)`, the SAME
warm-grey as the rail panel bg → zero-contrast selection. Fix ports e7's treatment into the app's token
system (Rule-11, not a reinvention): active bg → `--ds-color-blue3` light-blue tint; label + icon → The
One Blue (`text-primary`); weight → `font-semibold` (600); height `h-9` (36); padding `px-2.5` (10).
Parity re-verified by measurement (the now-mandatory step), same elements both renders:

| Property | e7 | app before | app after |
|---|---|---|---|
| Selected bg | blue wash | warm-grey (= panel, invisible) | `p3(.933,.948,.992)` blue tint ✓ |
| Selected text | blue | near-black | `p3(.276,.384,.837)` The One Blue ✓ |
| Selected weight | 600 | 500 | 600 ✓ |
| Item height | 36 | 28 | 36 ✓ |
| Padding | 0 10px | 0 8px | 0 10px ✓ |
| Font-size | 13.5px | 14px | 14px (0.5px, sub-perceptual — Minor) |

Verified: typecheck 0; rail-nav + brand-tokens tests 24/24 pass; screenshot confirms the rail reads as
selected. **Correction to the original finding:** the "transparent rail panel" row above was a
measurement error — the `<aside>` carries `bg-secondary` + a right border; the panel exists (warm
`p3(.984,.976,.957)`, distinct from the cream canvas — the correct warm port of e7's cooler rail, not a
defect). The genuine gaps were the selected-state, height, and padding, all now closed.

**Sweep COMPLETE (2026-07-18) — `parity-sweep-2026-07-18.md` is the evidence of record.** Axis 1
found 3 more Important (⌘K emoji glyphs · section-heading token · table-header weight) + a
duplicate-radius-scale root cause; 9 surfaces measured CLEAN; two earlier audit claims REFUTED by
measurement (⌘K position, tab underline). Axis 2: OD text faithful, 13 shipped-as-said verified; 2 new
findings (composer image-attach DROPPED; Work-children icons DEFAULTED-AROUND). Design stays **BLOCK**
until A1/A2/A3 are ported + parity-re-verified and the owner rules on B1/B2/A4.

## Final fidelity audits (2026-07-18, owner-requested)

Two adversarial audits of the finished build vs the owner's history, the redesign intent, and ALL
mockup generations (`final-intent-fidelity-audit-2026-07-18.md` · `final-mockup-fidelity-audit-2026-07-18.md`):
- **Intent: FAITHFUL-WITH-DRIFTS** — no owner directive silently inverted across specs→builds→fix
  waves; fix waves compound, never fork. Its one genuine twist (retired Weekly-Update roster leaking
  onto Home) FIXED in `beca0dc`; its 3 ratify omissions lifted into items 16–18 above.
- **Mockups: MINOR-LOSSES, no quicksand** — every high-stakes fork confirmed as a conscious
  supersession by consulting the INTERMEDIATE generations. Residue, routed as fast-follows below +
  ratify item 19.

19. **"Create" vs "New/Add" action-verb family** — the ⌘K palette says "Create Task"; buttons say
    "+ New task" / "Add Objective". Two reviewers pulled opposite directions (Rule-7 bare-verb fix vs
    mockup verb fidelity) — an owner taste call; pick one family and it gets locked as a convention.

**Design fast-follows (from the fidelity audits — small, each wants its own mini loop, not a
close-out slip-in):** (a) LG-1 restore e7's Inbox All/Unread/Handled triage filter (owning-mockup
answer, never superseded); (b) LG-2 implement KPITile's declared-but-unimplemented `empty` state and
use it for Home's money glance instead of bare "—" (the original-teardown disease; currently
mitigated by the B-iii next-sync provenance line); (c) LG-3 re-verify Money drill labels/provenance
once real snapshot data exists.

## Deferred debt (tracked, non-blocking)

- Signals feed/archive pagination before volume grows (step 4 CQ). Fan-out concurrent-uncommitted
  race (B2B-era). `due_process_runs` weekly/monthly surfacing + scale. Assign-dialog focus-trap
  (house overlay debt). Dedicated café-lead e2e persona (replaces the shared-persona grant).
  FR-708 deep-link as rendered link (currently description text). Step-10 phone ⌘K launcher
  affordance polish.

## Second-pass audit (2026-07-19, owner-supplied independent auditor) — dispositions

Verdict received: BLOCK / "do not ratify as complete" — 11 findings. Director verified each in code
before acting. **The auditor's core thesis is CONFIRMED and was demonstrated on the Director's own
evidence:** both prior tip e2e runs were piped through `tail`, which ate a **6-failed block** and
masked Playwright's exit code with tail's 0 — "gates green" claims (the Director's AND the cloud
run's post-785cdf3 claim) cited a truncated pipe. The corrected run exposed 6 real failures.

| # | Finding | Disposition |
|---|---|---|
| 1 | Gate evidence stale (ledger describes older tip) | **CONFIRMED — this section + refreshed gates on tip are the correction.** Boundary below. |
| 2 | Rule 12 asserted, not measured | **CONFIRMED.** Cold-start scores (e.g. "barista 8.5/10") are reviewer judgment; the provenance-promised steps/misclicks walkthrough was never run. Relabeled here; a real measured walkthrough is owner-schedulable, not retro-claimable. |
| 3 | Events 'awaiting' = semantic quicksand; AC-1003 bent | **CONFIRMED + FIXED correctly:** the kit gained the missing **'blank' (—) archetype** — step-10's semantics (nothing pending) AND the no-false-success rule both hold; AC-1003 now asserts the dual goal-oracle (neither ✓ nor ↻). |
| 4 | F1/F2/F3 "green" ≠ historical scenarios green | **CONFIRMED.** The e2e journeys prove partial paths (post+buttons-visible; start+resolve). Scenario-complete claims retracted; boundary below. |
| 5 | useMenuPopover skips menuitemradio; vacuous test | **CONFIRMED + FIXED:** selector covers menuitem/radio/checkbox; test asserts ≥4 items incl. the theme radios, real movement. Admin user-table menu adoption: tracked follow-up. |
| 6 | Sales→Ecommerce workMatch wrong (b2b_sales BU) | **CONFIRMED + FIXED:** mapping dropped; the REAL dual-hat fixture (Cafe Ops Lead + Sales Lead → Café only) is now the test. The Director's earlier "exactly the rule working" was a misread. |
| 7 | Profile bespoke grammar + roles[0] only | **CONFIRMED + FIXED:** PageHead adopted; ALL roles rendered; /profile added to the RI-IA-1 invariant it had escaped. |
| 8 | i18n test overclaims "whole app" | **CONFIRMED + FIXED:** test renamed to its true scope + remount-persistence assertion added; the shell flip remains rendered evidence only. |
| 9 | Signal drawer bypasses modal contract | CONFIRMED — folded into the tracked "shared drawer host" ratify item with the a11y specifics (no focus entry/trap/Esc). |
| 10 | Café hides which Team it auto-chose | **FIXED (surface):** bound Team name now rendered. Multi-Team journey remains unmeasured — tracked. |
| 11 | Audit runtime residue committed (`git add -A`) | **CONFIRMED + FIXED:** `.pi-subagents/` + `e11/` untracked and gitignored. Process note: no more `add -A` in dirty worktrees. |

**Also caught by this pass (not in the auditor's list):** 5 stale e2e oracles failing invisibly —
2× "Dashboard" H1 (broken since 785cdf3), the AC-013 roster oracle (asserted a RETIRED surface as
success), AC-021 phone More (pre-OD-68), AC-005 kitchen-title regexes (case-blind grep missed them)
— all rewritten to current law with goals intact; **plus a REAL Rule-5 regression from OD-68**
(railless module routes rendered zero `aria-current="page"`) — fixed: the breadcrumb leaf carries it
exactly when the viewer has no rail entry for that module.

## The truthful boundary (what is actually known, per the owner's standing ask)

- **Implemented + measured:** the domain model (Signals/occurrences/RLS — pgTAP 727), computed-style
  parity on the measured surfaces, the a11y/convention fixes above (live-verified + unit-locked),
  unit suite 2767, e2e per the refreshed run recorded below.
- **Implemented + judgment-only (NOT measured):** Rule-12 cold-start usability (reviewer scores, no
  behavioral walkthrough); dark-mode + phone rendered parity for the 2026-07-18/19 fix batch
  (tokens verified theme-aware; not re-measured rendered).
- **Implemented + partial journey:** F1 Signal (post→buttons; no correct/retract/canonical-Task e2e),
  F2 Café (start→resolve; no typed-check/evidence/exception e2e). S4–S6 unmeasured; Ecommerce/
  Roastery stubs.
- **Ratify-before-merge:** the standing 19-item list + OD-69 calls (image-attach slice, Home KPI
  removal recommendation, tertiary-contrast token, phone bottom-tab Café, member-start 7A).
- **Deferred (tracked):** shared drawer host + Signal full-page + canonical composer + Inbox triage +
  attention control + pagination + admin-menu contract adoption + Rule-12 measured walkthrough.
- **Independent-review boundary:** spec/CQ/design APPROVEs cover the cloud run through `d92f63d`.
  Director commits after it (rail/OD-68/parity/profile/convention/second-pass batches) are
  gate-clean, audit-remediated, and live-verified — but have had **no independent battery**; they are
  part of what the owner's merge review covers.

## OD-71 (four owner ratifications, 2026-07-19) — verification

- (i) verbs→"Create" app-wide: unit 2776 green (all task-creation strings + breadcrumb + assertions).
- (ii) tertiary token darkened: **measured 4.96:1 on the rendered page** (was ~3.4, below AA); token test updated to the new value.
- (iii) café member-start: migration `20260719000001_od71_member_process_start.sql` (reversible) +
  client map + neutralized read-only copy. **pgTAP 727 green** incl. the rewritten `99_*` (member
  CAN start) and `95_*` (finance = non-capable actor). **Security property:** the server double gate
  (`can('process.start')` AND `can_start_process_for_team`) is UNCHANGED — a member can start only
  their own Team's process; the grant only flips the capability half. Proven by pgTAP, NOT by a fresh
  `security-auditor` pass — **flagged for the owner's security confirm** on the grant (it is a
  role_capabilities change; low surface, but on the auth path).
- (iv) `SHOW_WEEKLY_UPDATES=false`: flag flipped; no surface consumed it.
