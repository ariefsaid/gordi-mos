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
| I5 | **Inline edit** | Enter / Tab / click-outside COMMITS; **Escape DISCARDS and restores the saved value** (OD-REDESIGN-22 — owner-locked, currently UNBUILT: shipping selects commit eagerly on change, provenance finding C2). One field-edit primitive owns this. | to build — the next cohesion slice after the host |
| I6 | **Async action** | Control disabled while pending (`aria-busy`); optimistic update with rollback + `role=status` announcement on failure. | exists on Tasks — generalize, never re-implement |
| I7 | **Navigate** | Exactly one `aria-current="page"` (rail owns it; breadcrumb leaf when the viewer has no rail entry). Redirects preserve query. View state in query params survives refresh/share. | rail + breadcrumb + router |
| I8 | **List select vs activate** | Single click activates (opens I1); selection is explicit (checkbox), never click-ambiguity. | tasks table pattern |
| I9 | **Notify / bell** | Bell → quick-triage panel in the shared host (list → push record → Back → Close). Rail Inbox → full page. One read/handled state. (OD-20 — host Phase 3.) | host P3 |
| I10 | **Form submit** | Labeled fields, `aria-required`, field + submit errors as `role=alert`, double-submit disabled. | create-task pattern |

## Conformance (2026-07-19 — honest state, not aspiration)

> **I4/I7 update (2026-07-20, branch `cohesion/chrome`).** The overlay-chrome cohesion
> pass hardened two classes: **I4** — centered confirms now compose ONE primitive
> (`components/ui/confirm-dialog.tsx`: aria-modal · focus-trap · Esc-returns-focus · shared
> `--scrim`/`--z-modal`); ConfirmArchive folded onto it (was a trap-less overlay). The
> z-index tier scale guarantees a modal always outranks a drawer (was: an admin confirm at
> z-50 hidden behind a drawer at z-90). **I7** — Task rows emitted `aria-current="true"`
> alongside the rail's `page`; the row's open/cursor state is now `aria-selected`, so
> **exactly one** `aria-current` holds. Proof: `docs/reviews/cohesion-debt-2026-07-19.md`
> overlay-half table. *(OccurrenceAssignDialog + CreatePersonDialog are still hand-rolled
> overlays — a `ModalShell` follow-up, not yet I4-unified.)*

| Surface | I1 | I2 | I3 | I4 | I5 | I6 | I7 | Proof |
|---|---|---|---|---|---|---|---|---|
| Task record | ✅ | ✅ | ✅ (row menu) | ✅ (archive confirm) | ❌ I5 unbuilt | ✅ | ✅ | task-drawer/split-view suites · `confirm-archive.test` · `task-row.test` "I7 open/cursor is aria-selected" |
| Signal record | ✅ shared host (in-list `?record=` → split/modal; direct `/work/signals/:id` → page) | ✅ | — | — | ❌ | partial | ✅ | AC-RPH-2/3 · record-panel-host + signals-archive suites |
| Inbox | ❌ no panel door (bell navigates away) | n/a | — | — | — | — | ✅ | host P3 → AC-RPH-4/6 |
| Deputy | own host (chrome drift) | partial | — | — | — | — | n/a | host P4 |
| User menu | — | ✅ | ✅ | — | — | — | — | user-chip suite |
| Admin people menu | — | ✅ | ✅ (⋯ + mobile sheet) | — | — | — | — | user-table I3 suite |
| ⌘K / composer | — | ✅ | — | ✅ | — | — | — | command-menu suite |
| Record details fields | — | — | — | — | ✅ inline edits are native selects — eager commit is the correct I5 reading (no free-text field to defer) | ❓ | — | `record-details-panel.test.tsx` "I5 inline edits are eager selects (OD-REDESIGN-22)" |
| Kitchen/Café qty cells | — | — | — | — | ✅ text/number qty routed through `useInlineCommit` (Enter/Tab/blur commit, Escape restores saved qty) | ✅ | — | `qty-cell.test.tsx` / `plan-qty-cell.test.tsx` "I5 inline commit (OD-REDESIGN-22)" |

## Sequence to full conformance (the cohesion program, in flight)

1. **Host P1+P2** (Task extraction + Signal in-host + canonical page) — ✅ DONE (RecordPanelHost;
   Task drawer + Signal record + `/work/signals/:id` all on the one overlay grammar).
2. **Host P3** Inbox two-door (I9) · **P4** Deputy chrome (I1 col).
3. **I5 slice** — the one inline-edit primitive (OD-22), retrofit details-panel + qty cells.
4. ~~**I3 completion** — admin people menu onto `useMenuPopover`.~~ DONE (user-table I3 suite).
5. **Lens (b) measured step** — reviewer drives I1/I2/I3 on every touched surface pair and asserts
   identical outcomes; recorded per review like the computed-style table.

Its VISUAL sibling — the same cohesion problem in styling/component duplication — is
`docs/reviews/cohesion-debt-2026-07-19.md` (glm code hunt + minimax multimodal cross-surface read).

Referenced by: `docs/experience-contract.md` (Rule 6 operationalization), `docs/design-workflow.md`
§2.3(b), `.claude/agents/design-reviewer.md` Lens (b).
