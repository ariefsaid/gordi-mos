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
- design: BLOCK — reopened 2026-07-18 by owner-caught fidelity finding **DESIGN-FIDELITY-1 (rail
  selected-state + panel bg not ported from e7)** — see § "Design fidelity — reopened" below. The prior
  per-step + holistic APPROVEs stand for structure/flow/a11y, but ALL of them (and the mockup-fidelity
  audit) measured proxies for visual fidelity, never computed-style parity vs the owning mockup, so a
  visible rail regression passed every stage. Verdict returns to APPROVE only after DESIGN-FIDELITY-1 is
  fixed AND re-verified with the now-mandatory computed-style parity step (`design-reviewer.md` Lens a).
  *(Prior state, retained: steps 4/5/6 BLOCK→fix→APPROVE with rendered evidence; 7–10 first-pass
  APPROVE; holistic 3-persona×2-breakpoint pass SHIP for structure; 785cdf3 fixed 2 Important + 2 copy.)*
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
