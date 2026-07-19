# Two-axis parity sweep — 2026-07-18 (owner-ordered, post OD-68)

The redesign's recurring failure class, proven twice (rail selected-state DESIGN-FIDELITY-1; rail
module blocks OD-68): checks measured proxies (tokens in-palette, decision TEXT) instead of the goal
(the owner's mockups, drawings, and words). This sweep ran both axes on branch tip `9ff2c5b`, dev
:5173 vs e7 :8766 / convergence :8134, per SALVAGE ownership. Two independent opus agents;
Director-verified spot-checks on every Important claim.

## Axis 1 — computed-style parity (measured, not eyeballed)

**Important (3):**
| # | Surface | Mockup (owner) | App | Fix locus |
|---|---|---|---|---|
| A1 | ⌘K item icons | e7 coherent SVG icon set | literal emoji `📥` `☕` + mixed unicode glyphs | `command-menu.tsx:105-106` → use `icons.tsx` SVGs (kills the emoji AI-slop tell; one fix, whole palette) |
| A2 | Section headings ("Needs attention" etc.) | navy `rgb(37,61,86)` 15px/700 | near-black 18px/600 | one heading token change, applies app-wide |
| A3 | Task table header | weight 600, h38 | weight 400, h32 | `TaskSurface.css` th — fixes every DB-view header |

**Minor, one root cause (A4):** the app's control radii sit one notch below e7 (buttons 4 / chips 2 /
⌘K-item 4 / panel 8 vs e7 8/8/8/12) because TWO radius token scales coexist and disagree:
`--ds-border-radius-{xs,sm,md}` = 2/4/8 (`theme-light.css:142-144`) vs `--radius-{xs,sm,md}` = 4/8/10
(`index.css:136-138`, "8px — CONTROLS", OD-P3-10). **Owner adjudication:** collapse to the e7-aligned
scale (8 controls / 12 overlays) or ratify the tighter one. Also Minor: secondary-text one tier too
dark + 1px large; search trigger filled vs e7 near-flush; Inbox rows flat vs e7 rounded + missing
All/Unread/Handled chips (structure).

**Measured CLEAN (the skin is closer than it looked):** top bar · page H1 (exact) · card primitive ·
status + attention pills · table body rows · primary button color/shadow · ⌘K centering + item
metrics · composer textarea. **Disputes resolved by measurement:** ⌘K "top-anchored vs centered" is a
NON-divergence (e7's own modal is top-anchored y≈69 vs app y=64, both horizontally centered — an
earlier audit's claim was wrong); orange tab underline is ratified brand (OD-P3-7), not drift; the
task-drawer's quiet shadow is justified by its inline-split paradigm (e7's is an overlay).

## Axis 2 — owner artifacts vs shipped (words → decisions → code)

**Meta-verdict: the OD text is faithful — no OD misquotes the owner.** 13 shipped-as-said items
positively verified in code (⌘K centered, canonical task table, PIC/Supervisor no-RACI, Café rename,
ad-hoc tasks, FAB→⌘K, Signal-on-Team, mention type-badges, feed-on-Home, header anatomy, Events
root, Work 4-children, follow-up demotion). The leaks are upstream/sideways of the decisions:

| # | Finding | Class | Evidence |
|---|---|---|---|
| B1 | **Signal composer image-attach icon** — owner said it 3× verbatim ("a text box, **an icon to add image**, … pills"); every OTHER element of that sentence shipped; the icon never entered any OD/spec/AC; zero image/photo/attach hits in `src/components/signals/` | **DROPPED** at decision step | provenance 02:4343, 03:79, 03:117 |
| B2 | **Work-children icons** — the sketch reading recorded "plain indented labels"; all 4 children ship SVG icons (`sections.tsx:29-32`); deviation logged ONLY in `convergence-flows/SCORECARD.md:103-104` ("say the word to revert"), never a ratify item — **same build turn as the OD-68 modules default; the gate caught neither** | **DEFAULTED-AROUND** | provenance 03:678, 03:736 |

Anchored known-opens placed (not re-derived): Signal full-page (OD-63) · Signal→Task canonical
composer (OD-39) · shared drawer host (Rule 6) · Inbox quick-panel + triage (OD-20/e7) · attention
tap-to-raise (SALVAGE #44) · Home KPI row (OD-17 conflict) · café member-start (RATIFY-7A) ·
localStorage Home order (OD-18/26) · phone task-card hierarchy · desktop Team column.

## The process rule this sweep earns (now binding — CLAUDE.md)

**Every build-time deviation from an owner artifact (sketch, verbatim directive, mockup pick) MUST
become a `RATIFY-BEFORE-MERGE:` line in the step ledger.** A scorecard footnote or "say the word"
flag is not a tracker — that mechanism shipped both sketch deviations and would have auto-caught
B2 and OD-68. Owner-stated affordances that don't become an OD must be recorded as explicitly
REJECTED with a reason, or they are B1-class silent drops.

## Owner calls (from this sweep)

1. **B1 image-attach** — build into composer v1, schedule, or reject explicitly.
2. **B2 Work-children icons** — keep icons or revert to the sketch's plain labels.
3. **A4 radius scale** — collapse duplicates to e7-aligned (8/12) or ratify the tighter scale.

Everything else in Axis 1 (A1/A2/A3 + minors) is settled-law fidelity work — no decision needed,
just the port, each re-verified by computed-style parity.

## Resolution (same day, owner: "proceed")

All executed and **parity re-verified by measurement**: A1 ⌘K = 10/10 SVG slots, 0 emoji, panel
radius 12 ✓ · A2 heading = 15px/700 `--brand-navy-text` ✓ · A3 th = 600/h38 ✓ (supersedes OD-P4-10,
AC-T01 updated as a deliberate change) · A4 `--radius-sm/md/lg` now resolve 8/10/12 — the
`aliases.css` cascade override was the root cause and is removed ✓ · B2 Work children = 0 icons,
plain labels per the sketch ✓ · B1 accepted as its own slice (OD-69i, backlog). Full Vitest
2763/2763 · typecheck 0 · eslint clean.
