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

### E6 — Viable, not minimum: the whole-company OS (2026-07-04 · ADR-0019/0020, OD-IA-1/2) ← CURRENT
Owner reset the bar explicitly: *"minimum viable" kept failing on "viable" — capture existing ops,
not just a minimum*. MOS = **the operating system for all ~30 people** in a company running on forked
gsheets. Locked: five destinations (Home/Work/Operate/Plan/Inbox), BU(team)/Activity/Revenue-stream
taxonomy, MOS owns settlement grain (B2B AR + retail pending bills), reference data (ESB feeds / MOS
owns), sheet-retirement playbook, phone-first + bottom tabs, bilingual en/id, `can()` capability
authorization with admin-editable roles. **E1's "first slice" language is historical from here.**

## What never changed (constant across all eras)
Usability + speed beat model completeness · `org_id` + RLS on every business table · owner gates on
spec/mockup/deploy, Director gates merge · review battery before merge · reversible migrations ·
the SDD loop (spec → plan → build → review → accept).

## Maintenance
When an owner decision moves the bar again, add an era here **in the same PR** that records the
decision (ADR/OD), and banner any doc the new era obsoletes. Do not rewrite old docs to match new
requirements — stamp them.
