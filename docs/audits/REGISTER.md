# Audit Coverage Register — Gordi MOS V3

> **GENERATED FILE — do not hand-edit.** Rendered from `docs/audits/surfaces.json` by
> `scripts/audit-register.sh render`. Mutate lifecycle state with `audit-register.sh
> {bump|lock}`; read staleness with `scripts/audit-staleness.sh`. This is the coverage
> authority named in `CLAUDE.md` / `AGENTS.md`: a UI merge requires its surface **locked**
> or explicitly **bumped** (enforced by `scripts/pre-merge-check.sh`).

The register gives design coverage a **denominator** (every surface below), a **memory**
(generation + locked commit), and disciplined re-audit triggers (generation bump / pin
insufficiency / milestone Luna) — so "what else is un-audited?" is a query, not a discovery.
Full model: `docs/plans/wise-discovering-frog.md`; per-dimension owning checks:
`docs/quality-model.md`.

**Generated:** 2026-07-23 · **backfill baseline:** `3d550af` · **surfaces:** 25 · **dimensions:** 2

**Lifecycle tally:** LOCKED 18 · BUMPED 0 · DUE 7

## Global due axes (apply to EVERY surface)

- **locale-id** — Indonesian locale — PROVABLY NEVER AUDITED on any surface. Step-2 sweep target.
- **dark-mode** — Appearance control ships (shell/appearance-control.tsx) but ZERO audit round used dark. PROVABLY NEVER AUDITED on any surface. Step-2 sweep target — expect the biggest findings crop here.

## Surfaces

| Surface | Routes | Status | Gen | audited@ | locked@ | Pins | Persona-differs | Due axes |
|---|---|---|---|---|---|---|---|---|
| Home | `/` | LOCKED | 1 | `ab61009` | `7e31910` | 2 | member: rail shows only viewer-affiliated module (OD-REDESIGN-68); my-work list scoped to own tasks | persona:member (rail-module + my-work scoping never audited); states: hover/loading/error NOT-REVIEWED (census-r2 3.1) |
| Tasks workspace | `/work/tasks`, `/work/tasks?view=*` | LOCKED | 1 | `ab61009` | `669f14f` | 6 | — | states: loading/error/desktop-popover NOT-REVIEWED (census-r2 3.2) |
| Task record (drawer + full page) | `/work/tasks/:taskId` | LOCKED | 2 | `ab61009` | `7e31910` | 3 | member: read-only record — no edit affordances (census-r2 3.3 Kitchen persona) | anatomy conformance (Step 2.5 / FR-ANAT-009) not yet pinned; states: loading/error NOT-REVIEWED (census-r2 3.3) |
| Task create (new) | `/work/tasks/new` | LOCKED | 1 | `ab61009` | `7e31910` | 2 | — | states: field-error/submit-error/submitting NOT-REVIEWED (census-r2 3.4) |
| Signals archive | `/work/signals` | LOCKED | 1 | `ab61009` | `7e31910` | 1 | — | states: empty/error/hover NOT-REVIEWED (census-r2 3.5) |
| Signal record (panel + full page) | `/work/signals/:signalId`, `?record=<id>` | LOCKED | 2 | `ab61009` | `7e31910` | 1 | — | states: error/whole-empty/hover NOT-REVIEWED (census-r2 3.6) |
| Inbox (deputy triage) | `/inbox` | LOCKED | 1 | `ab61009` | `3d5b147` | 2 | — | states: populated-triage/hover/loading/error NOT-REVIEWED — only EMPTY rendered (census-r2 DO-8, F-INBOX-2) |
| Cafe opening home | `/cafe` | LOCKED | 1 | `3d99815` | `3d5b147` | 1 | member: capture-only (no review/pushes); ops_lead: sees resolve-queue + rollup | states: started-panel/team-picker/loading/error NOT-REVIEWED — >half the route (census-r2 DO-8) |
| Kitchen sub-tabs (log/plan/stock/review/pushes) | `/cafe/log`, `/cafe/plan`, `/cafe/stock`, `/cafe/review`, `/cafe/pushes` | LOCKED | 1 | `542c48b` | `7b67d86` | 1 | member: log/plan/stock only — review + pushes gated (RequireAccessRole ops_lead/admin); ops_lead: all five tabs | persona:member vs ops_lead tab-gating render never audited; review/pushes states NOT-REVIEWED |
| Objectives catalog | `/work/objectives` | LOCKED | 1 | `ab61009` | `3d550af` | 2 | member: no access (RequireCapability objective.manage — absent, not disabled); ops_lead: no access | 8 of 9 states NOT-REVIEWED (census-r2 3.10) |
| Projects & Processes catalog | `/work/projects` | LOCKED | 1 | `ab61009` | `3d550af` | 2 | ops_lead: visible (workline.manage per OD-C-2); member: no access (absent) | 8 of 9 states NOT-REVIEWED (census-r2 3.10) |
| Money summary + detail | `/money`, `/money/detail` | LOCKED | 1 | `3d550af` | `7b67d86` | 3 | finance: PRIMARY non-admin audience — the only non-admin door to Money (RequireAccessRole finance/admin); admin: same render as finance; member: no access (absent); ops_lead: no access | persona:finance never audited AS Fitri (the audience the surface exists for); dimension:data-viz D17 — the revenue chart never audited AS A CHART (axes/legend/encoding; uupm data-viz rules) |
| Money plan (Budget + Pricing) | `/money/budget`, `/money/pricing` | LOCKED | 1 | `7689133` | `7e31910` | 1 | finance: gated finance/admin + flag SHOW_PLAN_BUDGET; member: no access; ops_lead: no access | — |
| Follow-ups queue | `/money/follow-ups`, `/work/follow-ups?view=followups` | LOCKED | 1 | `ab61009` | `7b67d86` | 1 | finance: gated finance/admin + flag SHOW_FOLLOWUPS | flag SHOW_FOLLOWUPS off — only reserved placeholder rendered; populated/loading/error NOT-REVIEWED |
| Follow-up record | `/work/follow-ups/:id` | LOCKED | 2 | `6d32409` | `6d32409` | 0 | finance: gated + flag SHOW_FOLLOWUPS | — |
| Admin — People | `/admin/people` | LOCKED | 1 | `ab61009` | `7e31910` | 1 | admin: only audience (AdminRoute); finance: no access; ops_lead: no access; member: no access | states: hover/loading/error/empties/menus NOT-REVIEWED (census-r2 3.12) |
| Events | `/events` | DUE | 1 | — | — | 0 | — | NEVER AUDITED — job-sentence + sanctioned empty state (Step 10). Owes gen-1 battery. |
| Profile | `/profile` | DUE | 1 | — | — | 0 | — | NEVER AUDITED — real page; language selection lives here (OD-70). Owes gen-1 battery — the locale-id sweep's natural host. |
| Login + Recovery | `/login`, `/recovery` | DUE | 1 | — | — | 3 | — | NEVER AUDITED as a design surface (e2e cover flow, not composition/craft). Owes gen-1 battery — the pre-auth first impression. |
| Not-found + module stubs | `/*`, `/ecommerce`, `/roastery` | LOCKED | 1 | `ce9e5e8` | `ce9e5e8` | 0 | — | — |
| Top-bar cluster (bell / create / account) | `*(global chrome)` | DUE | 1 | — | — | 2 | member: account chip + role; create/bell invariant; admin: same cluster | NEVER AUDITED AS A SURFACE — the bell/create/account cluster on every viewport. Owes gen-1 battery. |
| Rail + bottom-nav + More drawer | `*(global chrome)` | LOCKED | 1 | `ab61009` | `7b67d86` | 4 | member: rail shows only affiliated module (OD-REDESIGN-68); Money/Admin absent; bottom-nav promotes viewer module; finance: Money present in rail; ops_lead: Projects + Café present; admin: Admin + Money present | MORE DRAWER never audited as a surface (mobile secondary nav); persona rail variants (member/finance/ops_lead differ) never audited per-class |
| Command menu (Cmd-K) | `*(global overlay)` | DUE | 1 | — | — | 1 | — | NEVER AUDITED AS A SURFACE — the Cmd-K palette (open/typing/results/no-results). Owes gen-1 battery. |
| Deputy panel | `*(global overlay, SHOW_ASSISTANT)` | DUE | 1 | — | — | 2 | — | NEVER AUDITED AS A SURFACE — the deputy companion (right-edge track, coexistence with Inbox overlay). Owes gen-1 battery. |
| Signal composer host | `*(global overlay)` | DUE | 1 | — | — | 2 | — | NEVER AUDITED AS A SURFACE — the composer host (one command, many entry points). Owes gen-1 battery; carries open FLAG-4 (team default) + FLAG-5 (datetime locale). |

## DUE — surfaces owing their first (or a re-opened) generation battery

- **Events** [`events`] — DUE: NEVER AUDITED — job-sentence + sanctioned empty state (Step 10). Owes gen-1 battery.
- **Profile** [`profile`] — DUE: NEVER AUDITED — real page; language selection lives here (OD-70). Owes gen-1 battery — the locale-id sweep's natural host.
- **Login + Recovery** [`login-recovery`] — DUE: NEVER AUDITED as a design surface (e2e cover flow, not composition/craft). Owes gen-1 battery — the pre-auth first impression.
- **Top-bar cluster (bell / create / account)** [`chrome-top-bar`] — DUE: NEVER AUDITED AS A SURFACE — the bell/create/account cluster on every viewport. Owes gen-1 battery.
- **Command menu (Cmd-K)** [`chrome-command-menu`] — DUE: NEVER AUDITED AS A SURFACE — the Cmd-K palette (open/typing/results/no-results). Owes gen-1 battery.
- **Deputy panel** [`chrome-deputy-panel`] — DUE: NEVER AUDITED AS A SURFACE — the deputy companion (right-edge track, coexistence with Inbox overlay). Owes gen-1 battery.
- **Signal composer host** [`chrome-signal-composer`] — DUE: NEVER AUDITED AS A SURFACE — the composer host (one command, many entry points). Owes gen-1 battery; carries open FLAG-4 (team default) + FLAG-5 (datetime locale).

## Cross-cutting dimensions (not surfaces — full-matrix audits of record)

| Dimension | audited@ | Ledger | Outstanding |
|---|---|---|---|
| Component matrix (D2 — shared component states) | `ab61009` | `docs/plans/2026-07-23-component-interrogation.md` | axe unscoped run + F2/F5 guards still unbuilt (quality-model D2) |
| Interaction verbs (D4 — 7 cross-surface verbs) | `ab61009` | `docs/plans/2026-07-23-interaction-consistency.md` | 10 owner GAP rulings outstanding; automated interaction-conformance harness unbuilt |

## Backfill provenance

Generation-1 baseline declared at register creation (HEAD 3d550af). auditedAt records the census EVIDENCE commit (provenance); lockedAt records the commit whose tree is the pinned gen-1 baseline (regressions measured from here). Backfilled locks rest on the existing guard/story/e2e pins listed per surface; open census DO-items remain tracked in docs/plans/2026-07-23-census-sweep-r2.md and did not block the gen-1 lock (their fixes largely landed post-ab61009 — see the money + cafe lanes).

*Per-surface findings link to `docs/plans/2026-07-23-census-sweep-r2.md` and the money/
kitchen/cafe lanes. The staleness signal is computed, never remembered:
`bash scripts/audit-staleness.sh`.*
