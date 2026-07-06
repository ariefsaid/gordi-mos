# ADR-0019 — IA north-star: five destinations, taxonomy, and the surfaces every stream lands on

- Status: **Accepted** (owner-approved 2026-07-04 — grill-with-docs session, decision-by-decision)
- Deciders: Owner (Arief) + Director
- Related: ADR-0017 (agent-composed UI — user views, kit, deputy; Home v2 rides on it) ·
  ADR-0018 (agent-stack port — delivers Inbox machinery ADR-0044-analog, user_views, automations) ·
  ADR-0011 (access roles — evolved by ADR-0020) · ADR-0012 (ESB outbox — the AR/pending-bills
  write-back path if validated) · ADR-0010 (OLTP/OLAP split — reporting read-models feed Home KPIs) ·
  `CONTEXT.md` (Home, My Week, Inbox, Business Unit, Activity, Revenue stream, Reference data,
  Follow-up, Pending bill — all resolved this session) · `docs/decisions.md` OD-IA-1.
- Scope note: records the **information architecture and direction decisions**. No migration, route,
  or component is authorized by this ADR alone — each slice goes through its own spec → plan → build
  → review loop.

## Context

MOS started as task ownership + weekly/daily updates, then grew the Kitchen module, cascade catalog,
admin, and a sales dashboard. The rail already shows the failure shape: a per-activity nav group
(**Kitchen**, 5 links) that would multiply with every activity rolled in (bar, roastery, ecommerce…).
Meanwhile the owner's bar moved from "minimum" to **viable**: MOS must become the operating system
for all ~30 people in a 10-year-old company that runs on forked gsheets — the canonical failure being
a promo priced against a stale COGS copy because Finance forked "new COGS 2026" instead of updating
the linked one.

Streams MOS must absorb: kitchen ✓ / bar / roastery / ecommerce ops · cross-activity KPI drill-down ·
COGS + budgeting workbench · communication · follow-ups on B2B AR and retail pending bills · the
objective→task spine as an everyone-surface (today objectives are an admin-only catalog).

## Decisions

### D1 — Taxonomy: BU (team) · Activity (workstream) · Revenue stream (money lens)
**Business Unit** = a team in the org chart (Marketing, HR, Finance, Retail Ops, B2B Ops, B2B Sales) —
owns people, objectives, budgets. **Activity** = an operating workstream within a BU (kitchen, bar,
ecommerce inside Retail Ops; roasting inside B2B Ops) — the unit ops surfaces organize around.
**Revenue stream** = a reporting lens (Cafe Ops, Ecommerce, B2B) that may span Activities. A
**Module** is code serving usually one slice of one Activity (today's Kitchen module =
plan/log/stock/review, one part of the kitchen Activity). The earlier BU seed rows ("Kitchen and
Bar", "Cafe Ops – General") predate this and **need a re-mapping migration** (tracked).

### D2 — Five destinations + Admin; activity is a dimension, never a nav root
| Destination | Owns |
|---|---|
| **Home** `/` | KPI hub + **My Week panel**, role-aware; every tile declares a drill target — no dead-end numbers |
| **Work** | Tasks · objective→task cascade view for everyone (admin catalog becomes its manage mode) · follow-up queues · weekly updates |
| **Operate** | One entry per rolled-in Activity (Kitchen today; Bar, Roastery, Ecommerce as captured) — each module shaped by that Activity's real workflow, not a template |
| **Plan** | Reference data (COGS, ingredients, recipes, price lists) + the workbenches using it (menu/promo pricing, new-branch budgeting) |
| **Inbox** | Notifications, @mentions, approvals — a to-triage router, never a place conversation lives |

Nav stays five items forever; rolling in an Activity adds data + a module, not IA. My Week is
demoted from home-surface to a **panel on Home** (component survives). "Dashboard" is acceptable
copy for Home's KPI area.

### D3 — Home: coded v1, composable v2
v1 (the My-Week-replacement slice) is a **coded Surface** — slot layout, each slot = one read-model
query + one kit primitive (deliberately the compiled-user-view shape). v2, after the ADR-0018 port:
Home's KPI area becomes the **org-default user view** — recomposed as data, no deploy; a user
customizing Home saves their own view over the default (ADR-0017 D5/D6).

### D4 — Comms: MOS owns work-item communication only
Comments/updates attach to the entity (task, objective, log entry, follow-up, reference record);
@mentions route through Inbox. **Free-form conversation stays in WhatsApp.** Comms is a pattern
(comment thread + mention) added per entity plus the ported notifications machinery — not a Module.

### D5 — Money follow-ups: two streams, one fix; MOS owns settlement grain
**B2B AR** (invoices in ESB, trustworthy; chased from a gsheet) and **retail pending bills**
(owner/regular tabs; ESB never closes them at invoice level — only aggregate journal reductions).
Both: MOS mirrors issuance in, **owns invoice/tab-grain settlement state** (chase, promises,
partials, paid-with-evidence), works them from the Work follow-up queue with two-BU workflow
(B2B Ops/Retail chases, Finance settles). ESB **write-back only if the API validates** — a gating
pre-implementation spike (inventory `gordi-esb-bak` docs/spikes first); fallback = MOS is grain
> **Spike RESULT (2026-07-04): LIKELY-NOT — reconciliation branch chosen.** 292 documented
> endpoints, zero AR-settlement writes; ESB itself settles pending bills via memorial journals.
> Findings + the one remaining owner action (ask the ESB PIC re undocumented endpoints):
> `docs/reference/esb-settlement-api-spike.md`.
truth, ESB keeps aggregates, bridge = reconciliation. Real aging = ESB issuance × MOS settlement —
computable correctly for the first time anywhere in the company.

### D6 — Canonical record, many presentations; two vendored kit primitives
People work differently (checklist vs doc-with-notes; line items vs spreadsheet grid). MOS serves
that as **views over the same canonical rows — never forked data per presentation** (the gsheet
failure must not be re-imported). Two primitives enter the ADR-0017 kit, **vendored not hand-built**:
`doc-editor` (block editor — content stored as structured block JSON, never an HTML/markdown blob,
so embedded checklist items stay queryable data) and `data-grid` (editable spreadsheet-like grid).
License gate: MIT/Apache/MPL in; **AGPL out** (standing firewall — vendor libraries, never lift
product code). Exact library choice belongs to the design-plan, hidden behind the primitive.

### D7 — Reference data: ESB feeds it, MOS owns it
Certified records (COGS etc.) live in MOS OLTP with one owning BU, visible freshness, and change
history; consumers **link, never copy**. ESB/warehouse pulls seed and inform actuals (reporting
read-models); they never own the record — otherwise "the sheet" becomes "the sync".

### D8 — Mobile: bottom tabs, phone-first binding
Phone chrome = bottom tab bar of the five destinations (tabs render per access); desktop keeps the
rail regrouped to the same five — one IA, two chromes. **Every new surface is specced phone-first**
(kitchen redesign's phone-card pattern is the norm). PWA (installable, push-capable) rides on this.

### D9 — Notifications: Inbox + PWA push v1; adapter seam; WhatsApp only on evidence
Notification rows fan out through a **channel-adapter seam**. v1 channels: in-app Inbox + PWA push
(assigned / mentioned / approval / escalation). WhatsApp Business API deferred until unread
escalations prove push insufficient; email skipped (digest later if wanted). Rollout playbook owns
PWA installation.

### D10 — Sheet-retirement playbook (per ported gsheet)
(1) Port — replaces the sheet's **intended functionality**, not just data; reconciliation recorded.
(2) Dual-run, **time-boxed** (default 2 weeks), exit criterion set before the window starts.
(3) Declared cutover — the gsheet is made **literally read-only** (Drive permission flip) by the
owning BU lead, owner ratifies. (4) Tombstone — read-only sheet kept for history + a docs ledger
line. The teeth are the time-box and the permission flip; dual-run-forever is the named anti-pattern.

### D11 — Agent placement: global panel, not a destination
The deputy is a slide-over panel available on every surface (top-bar button next to ⌘K on desktop;
FAB above the tab bar on phone), inheriting the current surface/entity as live context (ported
ADR-0045-analog). Composition output lands **in** the owning surface; the agent is never where
results live. The five destinations stay five.

### D12 — Bilingual (en/id) via an i18n seam from the Home slice on
The org thinks in both; ops staff adoption cannot pay an English tax. The string catalog ships in
the Home-slice shell; v1 may ship English strings, but **every string goes through the catalog from
day one** — retrofitting i18n across 50 surfaces later is the expensive path.

### D13 — Backup gate before settlement truth
The moment MOS owns settlement grain (D5) and certified COGS (D7), MOS data is money truth existing
nowhere else. **Binding gate:** before the AR/pending-bills bridge goes live, MOS has a tested
backup/restore posture (PITR or scheduled dumps + a performed restore drill).

### D14 — Sequencing
1. **Home v1 + `sales_margin_daily`** (the My-Week-replacement slice, aimed at this ADR's shape)
2. **Agent port** (ADR-0018 P1→P3; Inbox machinery arrives here) — ESB-API spike runs in parallel
3. **Work spine** (cascade view + follow-up family) — prerequisite for the live management-week
   validation with real managers (the standing scope watch-item)
4. **AR + pending-bills bridge** (gated on the ESB spike + D13 backup gate)
5. **Plan / reference data** (COGS records first — kills the promo failure), workbenches after
6. **Activity roll-ins** (bar, roastery, ecommerce) — per ops pain, owner-led workflow capture

## Deferred (recorded, first instance decides)
Audit/history uniformity (one activity-log pattern, decided at Plan build) · budgeting scope v1
(instinct: promo/menu pricing first) · adoption telemetry (decided at Work-spine build) · ESB
decoupling posture (already held: warehouse + versioned contracts + outbox — stays binding) ·
HR/Marketing modules (enter via generic Work/Plan; no module until demand) · intra-BU activity-level
permission scoping (only on evidence of real conflict — see ADR-0020).

## Consequences
- The rail's Kitchen group dissolves into Operate; existing routes keep working during migration —
  nav regrouping lands with the Home slice, deeper moves per-slice.
- `shared.business_units` seed re-mapping is a real migration with data pointing at old rows.
- Every new entity gets: comments+mentions (D4), org_id+RLS (standing), `can()` authorization
  (ADR-0020), phone-first spec (D8), catalog strings (D12).
- The IA holds at 6 BUs × many Activities without new top-level nav — the growth test this ADR
  exists to pass.
