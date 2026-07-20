# Requirements evolution — how the bar moved (read before trusting any older doc)

**Why this doc exists:** MOS's requirements have *evolved deliberately*, several times, by owner
decision. Every doc in this repo is stamped by the era it was written in — a spec, brief, or mockup
from an earlier era describes **that era's bar, not today's**. A future agent reading
`project-brief.md` ("first slice: tasks + RACI + updates") next to ADR-0019 ("operating system for
all ~30 people") must not conclude the docs contradict each other — the requirement itself moved.
This file is the timeline that keeps that from being confusing.

**Rule:** when two docs disagree, the *later era* wins; the earlier doc is history, kept on purpose.
Current bar = the latest era below + `docs/backlog.md` banners + `docs/decisions.md`.

## The eras

### E1 — First slice (2026-06-10 · `project-brief.md`, early specs, Phase-0 mockups)
Replace the dormant Notion Management OS with a *fast, usable* internal surface: **task ownership +
lightweight RACI + weekly updates + daily ops updates**, for managers + selected ops users.
Long-term OS (Strategy→…→Task) explicitly aspirational, NOT in scope. Bar: **minimum, usable**.
Era-bound docs: `project-brief.md`, `docs/design-mockups/`, `STATUS.md`.

### E2 — Platform foundation (mid-June · ADR-0010/0011/0012, OD-P4)
Requirement grew sideways: MOS is the **first app on a shared Gordi platform** — one self-hosted
Supabase, schema seams (`shared`/`mos`/`ops`/`integrations`/`reporting`), access roles, ESB outbox.
Nothing about the E1 feature bar changed; the *architecture* bar did.
Era doc: `docs/platform-workstream-status.md`.

### E3 — Real ops capture: Kitchen (≈2026-06-20 · kitchen module, redesign, data migration)
"Daily ops *updates*" became "**run an actual operation**": kitchen plan/log/stock/review, ESB push,
real staff logins, real migrated data (521 logs). First proof that MOS replaces a working tool's
*intended functionality*, not just its data — the seed of the later viable-not-minimum principle.

### E4 — Cascade becomes real (late June · ADR-0014/0015, PRs #69/#81)
The E1-aspirational spine partially landed: **Strategy→Objective→Project/Process→Task** as
task-centric fields + admin/ops_lead catalogs. (The *everyone-facing* cascade surface is still open —
scheduled as the Work spine, E6.)

### E5 — Agent-native + the analysis plane (2026-06-30→07-02 · ADR-0017, OD-AN-1/2, warehouse online)
Two new requirement classes at once: (a) **users compose their own UI** (deputy agent, user views,
primitive kit — kit born via the Issue-1 sales dashboard); (b) **MOS is the analysis surface** over a
federated OLAP warehouse (reporting read-models, snapshot-fed; never merged OLTP/OLAP). ADR-0018
(2026-07-04) then re-scoped *how* the agent machinery arrives: **ported from the sibling PMO project**,
not grown (ADR-0017 §4a Issues 2–3 superseded).

### E6 — Viable, not minimum: the whole-company OS (2026-07-04 · ADR-0019/0020, OD-IA-1/2)
Owner reset the bar explicitly: *"minimum viable" kept failing on "viable" — capture existing ops,
not just a minimum*. MOS = **the operating system for all ~30 people** in a company running on forked
gsheets. Locked: five destinations (Home/Work/Operate/Plan/Inbox), BU(team)/Activity/Revenue-stream
taxonomy, MOS owns settlement grain (B2B AR + retail pending bills), reference data (ESB feeds / MOS
owns), sheet-retirement playbook, phone-first + bottom tabs, bilingual en/id, `can()` capability
authorization with admin-editable roles. **E1's "first slice" language is historical from here.**
**Substantially amended by E7:** BU=team taxonomy, the five-destination rail, Home cockpit, and
Plan/Operate guidance no longer hold. Canonical-record, cascade, Inbox-router, agent-panel, financial
truth, and authorization principles survive only where ADR-0025/OD-REDESIGN do not amend them.

### E7 — Full redesign: modules-in-rail, one record workspace, Signals (2026-07-09/10 · ADR-0025, OD-REDESIGN-1..71)
A full IA/IxD/UI reset: the never-used app behaved like "several apps," so the owner treated the
existing app/routes/`DESIGN.md`/mockups/ADRs as *evidence, not authority*. Locked direction: rail =
**Destinations (Home · Work · Money · Inbox) + BU-grouped Modules (Café · Ecommerce · Roastery)** —
no separate Dashboard/Operate/Plan/Reference/Cascade destination (reverses E6's five-destination rail,
ADR-0019 D2). **Home** = a required role-aware attention brief + an authorized personal canvas (not a
KPI cockpit). **Work** = one record workspace with collections + saved views (Tasks, Process Runs,
Projects, Processes, Standards, Objectives, Signals, Follow-ups). **Signal** replaces both mandatory
Weekly Update and the ops-only Daily Log with one org-wide factual layer (no PIC/Supervisor/status;
links many-to-many to Tasks). **Task ownership = PIC + Supervisor**; **RACI is reserved for
Objective/Project/Process**. **Person acts through `can()`** inherited from configurable Access roles
+ individual Allow/Deny overrides; **Team is execution scope, never an actor**. BU (functional) /
Team (concrete group) / Site (physical place) are distinct; governance definitions are BU-scoped,
execution records Team-scoped. System **Object Contracts** (not user Templates) drive creation;
**Blueprint** is deferred. **Process** (versioned definition) vs **Process Run** (occurrence) and a
versioned **Standard** quality-loop are first-class. One **Action Launcher** (phone FAB + desktop
`+ Create`) over a stable command registry. Canonical Phase-0 next step = **update the working mockups
into one decision-complete prototype** (`docs/design-mockups/redesign-mockups-2026-07/`) → **owner approval → SDD →
plan → TDD build → review → BDD acceptance**. Clean data baseline authorized in **direction only**
(OD-REDESIGN-34); no reset/deploy is authorized by the direction itself. Vocabulary: `CONTEXT.md`.

### E8 / V3 — E7 visual language, rebuilt as one coherent app (2026-07-20 · OD-REDESIGN-72) ← CURRENT

The E7 build completed technically but failed owner visual/IxD acceptance: most routes retained
pre-redesign styling beneath the changed shell, component styling remained fragmented, and analogous
records/overlays behaved differently. V3 keeps **E7's visual styling** as the target; it does not
invent a new brand. Its redesign scope is the application-wide visual migration plus correction of
E7's IA/IxD through later owner decisions, the composite lost-good record, `docs/jtbd.md`, and the
binding interaction contract. E7 is therefore a visual reference, not a snapshot to copy wholesale.

V3 proceeds on branch `v3-redesign`. Before SDD/implementation, the owner ratifies the remaining
authority conflicts one at a time; the resulting V3 design/spec and implementation plans must be
wired into this timeline, `docs/backlog.md`, and `docs/agent-context.md` rather than existing as
orphan review prose.

## What never changed (constant across all eras)
Usability + speed beat model completeness · `org_id` + RLS on every business table · owner gates on
spec/mockup/deploy, Director gates merge · review battery before merge · reversible migrations ·
the SDD loop (spec → plan → build → review → accept).

## Maintenance
When an owner decision moves the bar again, add an era here **in the same PR** that records the
decision (ADR/OD), and banner any doc the new era obsoletes. Do not rewrite old docs to match new
requirements — stamp them.


## E7 provenance — where the redesign era came from (added 2026-07-16)

E7 was not decided in this repo; it was decided in agent threads and distilled here.

- **Origin (why a redesign at all):** the 2026-07-08 Codex design-critique thread — the owner asked for
  an unsparing critique of the then-current design, concluding it "behaved like several apps", then
  commissioned high-fidelity mockups.
  `~/.codex/sessions/2026/07/08/rollout-2026-07-08T11-09-22-019f3fea-869f-77e1-8e42-dad5e34ce85a.jsonl`
- **The 50+ QnA grill (what E7 IS):** the 2026-07-10→12 Codex marathon (~7,200 turns) that produced
  **OD-REDESIGN-1..55 + ADR-0025**.
  `~/.codex/sessions/2026/07/10/rollout-2026-07-10T07-02-16-019f4955-0695-7012-a976-14dbee3263b8.jsonl`
- Later Codex threads (the redesign QnA is **Codex-only**; zcode holds build artifacts, not conversation) — caveats + reading order:
  `docs/redesign-decision-index.md` § Provenance.

**📁 Extracted in-repo (cloud-reachable, owner prompts verbatim): `docs/reference/provenance/`** — origin critique, the
grill, and the 2026-07-13→16 frustration thread that closed the mockup loop (OD-56) and produced the
design-iterates-once rule (OD-65) + the two fronts (OD-66).

Raw transcripts are local + unversioned. **The docs are authority; transcripts are archaeology.**
