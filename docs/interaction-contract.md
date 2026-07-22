# Interaction Contract — ONE behavior per interaction class (BINDING)

**Why this exists (owner, 2026-07-19):** "always be aware of the interaction layer.. i keep pounding
on UX and IxD… inbox drawer opens on top, task drawer open on the side. still not seeing any cohesion
in the design implementation grammar." Three audit generations measured statics (tokens, structure,
words) and treated behavior as residual — styling, then the sketch, then interaction each "fell
through a layer." The layer WAS the product. This contract makes behavior first-class: every
interaction class has ONE grammar, a conformance row per surface, and a measured check — the
behavioral sibling of the computed-style parity rule.

**Enforcement:** design review Lens (b) MUST run the conformance table below against every surface a
change touches — by DRIVING the interaction (click/keyboard, both regimes), never by reading code or
judging screenshots. A surface may deviate only via a `RATIFY-BEFORE-MERGE:` line naming this file.
New surfaces add a row before merge. The table's "Proof" column names the locking test; an empty
Proof cell is a defect, not a gap.

## The grammar classes

| # | Class | THE one behavior | Primitive |
|---|---|---|---|
| I1 | **Open a record** | In-list click → the shared side panel (page stays live, ≥1100px inline split / <1100px modal). Direct URL / refresh / new-tab → full canonical page. Same renderer, `mode` switch. | `RecordPanelHost` (spec `record-panel-host.spec.md`) |
| I2 | **Close / Back** | ✕ and Esc → underlying page, focus returned to opener. Browser Back → where you came from. In-panel stack Back → pops one. Never a dead end. | host |
| I3 | **Menu / popover** | Trigger click → menu; focus enters first item; Arrow/Home/End cycle ALL `menuitem*` roles; Esc + outside-click close + return focus. | `useMenuPopover` |
| I4 | **Modal / launcher** | Centered dialog, `aria-modal`, focus trap, Esc closes + returns focus. (⌘K, composer, confirm dialogs.) | CommandMenu pattern |
| I5 | **Inline edit** | Text/number edits: Enter / Tab / click-outside COMMITS; **Escape DISCARDS and restores the saved value** (OD-REDESIGN-22). Native selects currently commit eagerly on change as a **provisional exception** because selection is the complete control action; they are not evidence that the universal field-edit primitive is complete. | `useInlineCommit` for text/number; select exception requires owner disposition |
| I6 | **Async action** | Control disabled while pending (`aria-busy`); optimistic update with rollback + `role=status` announcement on failure. | exists on Tasks — generalize, never re-implement |
| I7 | **Navigate** | Exactly one `aria-current="page"` (rail owns it; breadcrumb leaf when the viewer has no rail entry). Redirects preserve query. View state in query params survives refresh/share. | rail + breadcrumb + router |
| I8 | **List select vs activate** | Single click activates (opens I1); selection is explicit (checkbox), never click-ambiguity. | tasks table pattern |
| I9 | **Notify / bell** | Bell → quick-triage panel in the shared host (list → push record → Back → Close). Rail Inbox → full page. One read/handled state. (OD-20 — host Phase 3.) | host P3 |
| I10 | **Form submit** | Labeled fields, `aria-required`, field + submit errors as `role=alert`, double-submit disabled. | create-task pattern |

## Conformance (2026-07-19 — honest state, not aspiration)

> **I4/I7 update (2026-07-21, branch `v3-redesign`).** The overlay-chrome cohesion
> pass hardened two classes: **I4** — command, Signal capture, confirmations, process assignment,
> and Add Person now compose ONE `ModalShell` interaction owner (aria-modal · focus-trap ·
> Esc/backdrop policy · focus return · shared `--scrim`/`--z-modal`). ConfirmArchive composes the
> shared ConfirmDialog preset. The
> z-index tier scale guarantees a modal always outranks a drawer (was: an admin confirm at
> z-50 hidden behind a drawer at z-90). **I7** — Task rows emitted `aria-current="true"`
> alongside the rail's `page`; the row's open/cursor state is now `aria-selected`, so
> **exactly one** `aria-current` holds. Proof: `docs/reviews/cohesion-debt-2026-07-19.md`
> plus the `CHROME-MODAL` source guard and focused modal/command/composer suites.

| Surface | I1 | I2 | I3 | I4 | I5 | I6 | I7 | Proof |
|---|---|---|---|---|---|---|---|---|
| Task record | ✅ | ✅ | ✅ (row menu) | ✅ (archive confirm) | ⚠️ provisional select exception; live overlay dirty-leave guard now wired, direct-route blocker remains | ✅ | ✅ | task-drawer/split-view suites · `confirm-archive.test` · `tasks-workspace.test` AC-V3-008 |
| Signal record | ✅ shared `OverlayHost` (in-list record query → split/modal; direct `/work/signals/:id` → page) | ✅ | — | — | ⚠️ no editable field contract in live wrapper | partial | ✅ | Signals archive focused suite + overlay-host route seam |
| Inbox | ✅ shared host; page records use the page-owned split slot and bell quick triage uses the shell slot (seeded notification proof and handled semantics still open) | partial | — | — | — | — | ✅ | inbox host tests; seeded-notification acceptance pending |
| Deputy | ⚠️ chrome-free content through shared `OverlayCompanionSlot`/`RecordPanelHost`; desktop adjacent/compact, phone may layer above mounted record | partial (shared host owns Close/Esc/scrim/focus ✅; browser Back/session stack open) | — | — | — | — | n/a | 94 focused tests independently pass; `AssistantPanel.test.tsx` proves phone Escape leaves record mounted; controller-stack P4 and live scroll containment remain open |
| User menu | — | ✅ | ✅ | — | — | — | — | user-chip suite |
| Admin people menu | — | ✅ | ✅ (⋯ + mobile sheet) | — | — | — | — | user-table I3 suite |
| ⌘K / composer | — | ✅ | — | ✅ | — | — | — | command-menu suite |
| Record details fields | — | — | — | — | ⚠️ native selects eager-commit; provisional I5 exception, not universal conformance | ❓ | — | `record-details-panel.test.tsx` "I5 inline edits are eager selects (OD-REDESIGN-22)" |
| Kitchen/Café qty cells | — | — | — | — | ✅ text/number qty routed through `useInlineCommit` (Enter/Tab/blur commit, Escape restores saved qty) | ✅ | — | `qty-cell.test.tsx` / `plan-qty-cell.test.tsx` "I5 inline commit (OD-REDESIGN-22)" |

## Sequence to full conformance (the cohesion program, in flight)

1. **Host P1+P2** (Task extraction + Signal in-host + canonical page) — ✅ DONE at the production
   consumer seam (the physical `RecordPanelHost` is now mounted through the single `OverlayHost`; Task
   and Signal focused suites pass, with live browser and full-suite acceptance still pending).
2. **Host P3** Inbox two-door (I9) · **P4** Deputy controller-stack migration. Deputy's physical
   chrome now uses `RecordPanelHost`: local Escape/scrim/focus/header ownership is gone, desktop selects
   compact-adjacent layout, and phone may layer above the still-mounted record (OD-REDESIGN-80).
   Rendered geometry plus browser Back/one-session stack ownership remain open.
3. **I5 slice** — decide/document the native-select exception; Task overlay dirty-leave is now
   wired and goal-tested, while the direct route/browser blocker and Signal editable-field path remain.
4. ~~**I3 completion** — admin people menu onto `useMenuPopover`.~~ DONE (user-table I3 suite).
5. **Lens (b) measured step** — reviewer drives I1/I2/I3 on every touched surface pair and asserts
   identical outcomes; recorded per review like the computed-style table.

Its VISUAL sibling — the same cohesion problem in styling/component duplication — is
`docs/reviews/cohesion-debt-2026-07-19.md` (glm code hunt + minimax multimodal cross-surface read).

Referenced by: `docs/experience-contract.md` (Rule 6 operationalization), `docs/design-workflow.md`
§2.3(b), `.claude/agents/design-reviewer.md` Lens (b).
