# Gordi MOS — Roadmap (living doc; created 2026-06-10)

> **Redesign is the current direction (2026-07-09/10).** The IA-phasing notes below (the 2026-07-04
> "five fixed destinations Home / Work / Operate / Plan / Inbox" sequencing, and the pre-redesign
> slice ordering) are **partially superseded by ADR-0025**
> (`docs/adr/0025-ia-modules-in-rail-redesign-direction.md`) + **`docs/decisions.md` OD-REDESIGN-1..55**.
> Current model: rail = **Destinations (Home · Work · Money · Inbox) + BU-grouped Modules (Café ·
> Ecommerce · Roastery)**; no separate Dashboard/Operate/Plan/Reference destination; Weekly Update/
> Daily Log replaced by live period views + Signal; Task ownership = PIC + Supervisor. Canonical
> next step = **owner review of `docs/jtbd.md` v0.4 + the E7 prototype brief, then update the redesign
> working set into one decision-complete prototype** (`docs/design-mockups/redesign-mockups-2026-07/`)
> → **owner prototype approval → SDD → plan → TDD build → review →
> BDD acceptance**. The phase structure and owner gates below remain the working cadence; the
> *destination/scope* vocabulary has moved on.

Phasing to MVP, optimized for speed-to-daily-use. Current product truth is indexed by
`docs/redesign-decision-index.md`; `docs/project-brief.md` is era-bound E1 history. Read
`docs/requirements-evolution.md` (E1→E7) before trusting any phase's original scope. One issue at a time per the
Director loop (`docs/director-playbook.md`). Each phase ends at an **owner gate**.

## Phase 0 — Frontend mockups (E6 done; E7 redesign gate active)
Goal: lock the redesigned IA and interaction model in one interactive prototype before redesign specs. Static HTML only
(`docs/design-mockups/`), to the adopted `DESIGN.md` tokens. Full procedure:
`docs/design-workflow.md` §1.
- **0.1** IA proposals (2–3 competing shells for `/mos`) — resolves the brief's open IA question.
- **0.2** Key-screen mockups: My Tasks list (RACI-visible, filterable) · task detail (RACI fields) ·
  weekly update (write + review) · daily ops feed (kitchen-mirrored events).
- **0.3** Owner picks IA + signs off screens; picks recorded in `docs/decisions.md`.
- **Gate:** owner sign-off on mockups. Also decide here: user-facing app name (brief open question).

## Phase 1 — Foundation (DONE)
Goal: a deployable empty shell with real auth and the schema seams.
- **1.1** Scaffold `mos-app/` (React 19 + Vite + TS + react-router-dom 7, base path `/mos`),
  CI gates (typecheck / lint / unit / build), Playwright harness.
- **1.2** Supabase foundation: self-hosted stack config, schemas `shared` / `mos` / `ops` /
  `integrations`, `shared.people` + roles + business units, RLS + `org_id` seam, seed data, pgTAP harness.
- **1.3** Auth: Supabase Auth login, session, profile from `shared.people`, role surface in the app shell.
- **1.4** App shell per the picked IA mockup (nav, routing, empty states).
- **Gate:** owner logs in at a preview URL and sees the shell with their own name/role.

## Phase 2 — First slice (the MVP) (DONE — feature-complete 2026-06-12; 2.4 owner-deferred)
Goal: daily/weekly management workflow usable by managers + selected ops users.
- **2.1** Tasks + ownership + lightweight RACI (fields, not matrix — locked): CRUD, list with
  RACI/owner/status filters, task detail. The core entity.
- **2.2** Weekly updates: write (per person/area), review surface for managers, week-keyed.
- **2.3** Daily Log (daily ops): the `/ops` feed surface; manual entry first. (Surface named "Daily Log", OD-P2-15.)
- **2.4** Kitchen mirror: approved kitchen activity → `ops` daily updates (read-only mirror;
  kitchen app untouched). Needs owner decision on which events first (THE WALL).
- **Gate:** owner + 1–2 managers run a real week in it (tasks owned, weekly updates filed, daily
  feed populated).

## Phase 3 — Rollout & hardening (CURRENT)
> **Platform-foundation workstream (pre-rollout, OD-P4):** foundation-first build sequence tracked in
> `docs/platform-workstream-status.md`. **As of 2026-06-21:** access-role layer (SHIPPED) + kitchen
> Module fully on `main` (DB substrate + UI 5 screens + nav + seed + log_date fix). Outstanding:
> kitchen e2e layer · ESB push worker · prod platform deploy (owner-gated) · FastAPI backend +
> provisioning.
- **3.1** Production deploy to `ops.gordi.id/mos` on ris-dev (Caddy path-route; owner-approved). Runbook: `docs/environments.md`.
- **3.2** Onboard managers + selected ops users; collect friction → Human-UX loop
  (`docs/design-workflow.md` §3).
- **3.3** Hardening: security audit pass on auth/RLS across schemas, backups confirmed, monitoring.
- **Gate:** weekly management rhythm actually runs in MOS for 2+ consecutive weeks.

## Post-MVP (explicitly deferred — do not pull forward)
Objectives/outcomes · programs/processes · Standard Work Packages · full RACI matrix UI ·
role/job-description clarity · OKR cascade · kitchen backend migration · roastery app (separate,
Supabase-native from day one) · ESB write-back visibility · shared UI package extraction (only after
both PMO and MOS show repeated use of the same components).

> **Note on "kitchen backend migration":** **Superseded 2026-06-19 by OD-P4-1 / ADR-0010 D10:** the kitchen app migrates into MOS as its first ops Module **before** user rollout (a pre-rollout foundation slice), not Post-MVP. Foundation sequence + status: `docs/platform-workstream-status.md`.

> **Note on agent-composed UI + reporting/sales (2026-06-30):** the **agent-native, user-composed UI**
> program (ADR-0017, Accepted — deputy/RLS dual-plane; OD-AN-1) and its **OLAP→`reporting` snapshot →
> sales-dashboard** track are now **active**, not deferred: they reuse the foundation (RLS · `org_id` ·
> DAL seam · the now-online OLAP warehouse) the architecture is unusually ready for. Build is value-first
> (Issue 1 = a mobile-first operational dashboard that births the primitive kit). Tracked in
> `docs/platform-workstream-status.md` §Current focus + `docs/reference/warehouse-online.md`.
>
> **Note on the agent-stack port (2026-07-04):** ADR-0018 **Accepted** (OD-AN-3) — MOS **ports PMO's
> native agent stack** (copy-adapt, no shared package, no auto-sync), superseding ADR-0017 D8's retired
> sidecar and re-scoping D9 + §4a Issues 2–3 (the registry/DSL now **arrive by port, not grown from
> scratch**). Runtime = same-origin Supabase Edge Functions (no MOS backend tier; the VPS-Node option
> rejected); MOS adds a binding, test-enforced **grounding NFR** PMO lacks. **Sequencing (ADR-0018 D6):**
> next = the `sales_margin_daily` read-model + the **My-Week-replacement dashboard**; **then** the port in
> three trains — **P1 substrate** (shippable with zero conversational agent) → **P2 panel+runtime** →
> **P3 batteries** — each through the full loop, each independently shippable, cherry-pick window
> between trains. Tracked in `docs/backlog.md` (2026-07-04 banner) + `docs/platform-workstream-status.md`.
>
> **IA north-star (2026-07-04):** ADR-0019 **Accepted** (OD-IA-1) — five fixed destinations (**Home /
> Work / Operate / Plan / Inbox** + Admin); taxonomy BU(team)/Activity(workstream)/Revenue-stream(lens);
> Home replaces My Week as `/` (My Week survives as a panel); phone-first + bottom tabs binding;
> bilingual en/id from the Home slice on. ADR-0020 **Accepted** (OD-IA-2) — `can()` capability
> authorization with admin-editable roles. **Refined order:** Home v1 + `sales_margin_daily` → agent
> port P1–P3 (ESB-API spike parallel) → Work spine (objective→task for everyone + follow-up family →
> live management-week validation) → AR/pending-bills bridge (backup-drill gated) → Plan/reference data
> → activity roll-ins (bar/roastery/ecommerce, per ops pain). Full spine: `docs/adr/0019-ia-north-star.md`.
