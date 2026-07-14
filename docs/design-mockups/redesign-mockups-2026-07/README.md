# Gordi MOS — Full Redesign Mockups (2026-07)

> **Direction LOCKED; E7 CANDIDATE BUILT; owner approval still pending (2026-07-10).** The owner approved the redesign direction — authority is now
> **ADR-0025** (`docs/adr/0025-ia-modules-in-rail-redesign-direction.md`) + **`docs/decisions.md`
> OD-REDESIGN-1..55** + **`CONTEXT.md`**. The current Phase-0 candidate is **`e7-prototype.html`** and
> its `e7-*` sources; it is complete enough for owner review but is not signed or approved. `prototype.html`,
> `home.html`, `work.html`, `roastery.html`, `kitchen.html`, and `money.html` are historical inputs. The earlier
> "three paradigms — pick one" framing below is **history**: the chosen direction converges α's flat
> rail + γ's structured canvas + β's multi-view into the one prototype. The former **open questions**
> are resolved: the first destination is **Home** (not "Orient"); creation uses one prescribed
> **Action Launcher** (phone `+` FAB + desktop `+ Create`, ADR-0025 D32 / OD-REDESIGN-46) — the rejected
> item is an ambiguous global **Capture**, not any FAB; the target rail is **Destinations (Home · Work · Money
> · Inbox) + BU-grouped Modules (Café · Ecommerce · Roastery)** (ADR-0025 D1 / OD-REDESIGN-1), not 3/4/5
> flat destinations. Next step = **owner redline/approval of E7 → SDD → plan → TDD build → review →
> BDD acceptance** (AGENTS.md loop). No redesign spec or implementation is authorized by these mockups alone.

The current coverage contract is `PROTOTYPE-BRIEF.md`, derived from `../../jtbd.md` v0.4.

> **E7 CANDIDATE BUILT — awaiting owner Phase-0 approval.** The consolidated interactive prototype is
> **`e7-prototype.html`** (+ `e7-prototype.css`, `e7-data.js`, `e7-records.js`, `e7-views.js`,
> `e7-app.js`), built additively to `PROTOTYPE-BRIEF.md` + the 2026-07-10 plan; all earlier files below
> remain untouched history. Serve with `python3 -m http.server 8765` from this directory and open
> `http://127.0.0.1:8765/e7-prototype.html`. Static coverage gate: `node verify-e7-prototype.mjs`
> (green: J01–J23 · S1–S6 · A1–A14 · 9 states · 3 responsive regimes). Owner screenshots: `shots/e7/`.
> Not approved, not signed — owner redline/approval is the Phase-0 gate.

A full IA / IxD / UI reset, not a repaint. Built by the Director (main session) with the
owner, 2026-07-08.

## Design stance

Treat the current app, routes, `DESIGN.md`, prior Phase-0 mockups, and the sibling
`full-redesign-2026-07/` set as **evidence, not authority**. Keep only what supports the job.
The "Quiet Control Surface" identity (owner-ratified) is the strongest layer of the current
design — the slop lives in the IA and page-grammar layer built on top of it. These mockups
**keep the identity** (with two visual probes that test it) and **rebuild the structure**.

### The disease these mockups cure

From the repo's own audits (`design-teardown-2026-07-07`, `design-audit-post-retrofit-2026-07-08`):

1. **"Several apps", not one** — no spine; tokens shared but page grammars not.
2. **Home makes a promise it can't keep** — cockpit KPIs on a task list; finance tiles show `—`.
3. **Nav teaches the database** — Cascade, Plan, kitchen nav are implementation nouns.
4. **Trust gaps everywhere** — no provenance; real zeroes indistinguishable from broken pipelines.
5. **Empty states emptied, not designed** — four rhythms, zero system.

The recent "retrofit" (W1–W5) **patched** tokens/layout; it did **not cure** the disease.

### The unifying move: pick the atom

A "company OS" (cockpit + work-management + ops-capture) has no off-the-shelf convention —
that gap *is* the design problem. These mockups pick a **work-management spine** (Linear/Asana/
Height): the work item is the atom; cockpit, capture, and money are lenses on the work graph.
This structurally dissolves the kitchen/cascade/plan sprawl rather than relabeling it.

## How to view

A local server (the mockups use relative links + a shared stylesheet):

```bash
cd docs/design-mockups/redesign-mockups-2026-07
python3 -m http.server 8765
# open http://localhost:8765/
```

**➜ `http://localhost:8765/prototype.html` is a useful shell/interaction reference, not the approved
prototype** (Warmer identity, bigger type,
real responsive, user impersonation) that the five consolidated destination files continue:
`home.html` · `work.html` · `roastery.html` · `kitchen.html` · `money.html` (ADR-0025 D2). Start at
`prototype.html` for the app shell, then follow the rail into the destination files for the current
IA (Destinations Home · Work · Money · Inbox + BU-grouped Modules Café/Ecommerce/Roastery — not the
3-destination spine described in the paradigm comparison below, which is the pre-consolidation
exploration). Switch user via the avatar in the top-right to experience the app as Arief (owner),
Rina (Retail Ops head), Dimas (B2B Ops head), Sari (lead), or Yusuf (roastery operator). The files
contain useful working interactions, but cross-file completeness must be re-verified during consolidation.

`index.html` is the historical rationale hub (diagnosis, spine decision, comparison matrix). The per-variant
files (`a-orient`, `b-four`, `c-five`, `probe-warmer`, `probe-signal`) are the earlier interactive
explorations. None yet demonstrates all OD-REDESIGN-1..55 as one production-fidelity app.

## Files

**Working files to reconcile into the consolidated prototype (not current authority):**

| File | What it is |
|---|---|
| `home.html` | Home destination — attention brief + personal/deputy canvas + shift-aware floor pane. |
| `work.html` | Work destination — one collection/saved-view workspace (Tasks, Process Runs, Projects, Processes, Standards, Objectives, Signals, Follow-ups). |
| `roastery.html` | Roastery Module (B2B Ops) — log/plan/stock/review, shifts, Standards + check-loop. |
| `kitchen.html` | Café Module (Kitchen+Bar, Retail Ops) — log/plan/stock/review, retail-overall shifts, Standards. |
| `money.html` | Money destination — revenue/margin/AR/AP cockpit, follow-up queue summary. |
| `prototype.html` | Shell reference the five files above continue (topbar/rail/persona-menu/deputy-panel/⌘K structure); also retained below as the α-paradigm exploration file. |
| `base.css` / `app.js` / `editor.js` / `icons.js` | Shared foundation (styling, SPA routing, block editor + quality loop, icons) all six files consume. |

**History (2026-07-08/09, pre-consolidation) — three **interaction paradigms** (α flat, β board,
γ pages) explored to pick the mental model that `home.html`/`work.html`/etc. above converge from;
kept for context, not current:**

| File | What it is |
|---|---|
| `index.html` | Rationale hub: diagnosis, paradigm comparison, convergence baseline. |
| `prototype.html` | **Paradigm α (flat/issue-centric, Linear-style):** task is the atom; dense grouped tables; saved views. The refined flagship of the exploration (now doubles as the shell reference above). |
| `b-board.html` | **Paradigm β (board/database-centric, Monday-style):** Project is the atom — a database board with Table/Kanban/Timeline views + custom columns. |
| `g-pages.html` | **Paradigm γ (nested/page-centric, Notion-style):** editable page is the atom; rail IS the tree; every node opens an editable page. |
| `a-orient.html` · `b-four.html` · `c-five.html` · `probe-warmer.html` · `probe-signal.html` | Earlier explorations (nav-count variants + identity probes) — superseded by the three paradigms above; kept as history. |

## The three IA spines (historical — compare on structure, not skin)

All three share the Quiet Control Surface identity — so you see *mental-model* differences,
not paint.

- **A — Orient · Work · Inbox** (recommended). Purest work-management spine. Three destinations
  + a global one-tap Capture. Money cockpit = the owner's Orient panel. Ops capture = global `+`.
  Reference = linked where used. **Nowhere to re-append** — structurally can't re-grow "several
  apps". *Risk:* Orient must be ruthlessly scoped or it becomes a dump.
- **B — Orient · Work · Ops · Money** (safer). Keeps Ops and Money first-class as distinct heavy
  rhythms. Inbox demoted to a header bell + slide-over triage. Four destinations. *Risk:* Ops/Money
  grammar must stay unified with Work or B fragments into four mini-apps.
- **C — Now · Work · Ops · Money · Inbox** (contrast baseline). Closest to today; mainly a relabel.
  Five is the proliferation ceiling the redesign is trying to escape — built to justify A or B,
  not to be the target.

## The two identity probes (on spine A, one variable each)

- **Warmer** — shifts only warmth (white→cream, neutral grey→warm, navy softens). Tests whether
  the "Quiet Control Surface" reads as too clinical for a 30-person team living in the app daily.
  If preferred, the `:root` token swap is a `DESIGN.md` amendment with zero structural rework.
- **Signal** — adds a categorical lane-color system (Run / Optimize / Transform) to tables and KPIs.
  Tests whether the One-Blue Rule sacrifices at-a-glance director triage. Argues categorical ≠
  interactive color (an extension of the existing Tinted-Status Rule). *Finding:* `--lane-transform`
  collides with `--brand-orange` (same hue); if it ships, push Transform redder and reuse `--violet`
  for Optimize.

## Historical prototype properties to preserve or reconcile

- The old **Capture** probe demonstrated the need for a thumb-reachable action. The target replaces its
  ambiguous command with the prescribed Action Launcher while preserving reachability.
- **Every cockpit number drills** — no dead ends (JTBD anchor A4). Each KPI declares its drill target.
- **Mobile tap targets are 44px** throughout — pays the systemic P1 debt the post-retrofit audit flagged.
- **Provenance/freshness on every figure** — "live · synced 12 min ago", "next money sync 03:30 WIB",
  "basis: interim". Pays the B-iii provenance debt.
- **Real Gordi data** throughout — real BUs (Retail Ops, B2B Ops, B2B Sales), real activities
  (kitchen, roastery), real money (Rp, AR/AP). No lorem.

**Director assumption for the next prototype (reversible, owner-redlineable):** Budget records appear
canonically in Money and open from Projects, Processes, Tasks, or Modules as linked records rather than
embedded copies. This is a prototype placement, not a new domain decision.

## Open questions for the owner (captured in-variant at the bottom of each)

> **Resolved 2026-07-09/10 — see the top banner and ADR-0025 / OD-REDESIGN.** Kept below as the
> point-in-time record of what each variant probed.

1. **Capture FAB vs No-FAB Rule** — does the rule hold for a whole-company OS, or is it a relic of
   a manager-only assumption?
2. **"Orient" label** — a job verb. Alternatives if too abstract: Today / Home / Cockpit.
3. **Activity vs Destination** — do Roastery/Kitchen read as second-level items, or should they
   nest under Work?
4. **3 vs 4 destinations** — does Money/Ops need to be unmistakably first-class (→ B), or can they
   live as excellent panels on Orient/Work (→ A)?

## What this is NOT

- The redesign direction is ratified; this prototype artifact is not. It remains a **Phase-0 mockup
  proposal** until owner sign-off.
- It does not authorize changes to `DESIGN.md`, app code, schema, resets, or deployment.
- Prototype approval is a **gate**: no redesign spec or implementation proceeds until the owner signs off
  (per `docs/design-workflow.md` §1 and `AGENTS.md` Phase-0 exception).
