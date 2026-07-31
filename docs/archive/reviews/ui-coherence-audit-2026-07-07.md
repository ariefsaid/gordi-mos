# UI Coherence Audit — whole-app (2026-07-07)

Basis: design-reviewer (opus; `impeccable`·`taste`·`design-review`) rendered EVERY authenticated screen as
Director at desktop 1280 + phone 375, cross-read the code. Triggered by the owner's verdict: *"bleeds,
disjointed UX, feels like several apps thrown into 1, no IxD convention."* Feeds the task #19 retrofit plan.

**Verdict: correct complaint, and it's an APPLICATION gap — convention-application (targeted refactor), NOT
a ground-up redesign.** A shared kit exists (`PageFrame`/`PageHead`, `state-kit`, `dashboard/data-table`,
`Button`, `StatusPill`, the DB-view toolbar) and the best screens (Home cockpit, Tasks + task drawer, Daily
Log) use it beautifully. But ~5 modules were each built to a private grammar and never adopted the kit —
**Follow-ups, Kitchen ×5, catalog managers (Objectives / Projects & Processes), Budget/Pricing, Sales.**
Two (Follow-ups, Kitchen) need real rebuild-to-kit; the rest are mechanical adoption.

## A. Divergence catalog (root of "several apps")
- **D1 — Table/list grammar: 5 implementations for one job.** Canonical DB-view (Tasks) · bespoke raw `<table>` on page bg w/ own CSS + **no mobile reflow** (Follow-ups) · Kitchen's 6 self-contained tables · catalog card-list (Objectives/Projects) · nested tree (Cascade). Only **Sales** imports the shared `dashboard/data-table`.
- **D2 — Filter/toolbar: 3 idioms + off-system control.** Tasks = view-tabs + `seg` + bordered chips (canonical); Cascade = the SAME Mine/All filter as **bare text links**; Kitchen = **native `<select>`** + boxed 3-segment. **11 files render a raw `<select>`** (breaks height/radius/font tokens).
- **D3 — Status pills: 9 pill systems, one ruleless.** 8 components (`state-pill`/`pill`/`chip`/`tag`/`status-pill`/`fail-loud-badge`/`timing-chip`/user-chip) + a 9th CSS-only `follow-ups-pill` = outlined grey, **no dot, no tint** (flat violation of the Tinted-Status Rule).
- **D4 — Empty/error: kit exists, half the app ignores it.** `state-kit`'s `EmptyState` is canonical (Daily Log nails it); Kitchen Review/Pushes, Sales, Pricing, Inbox each hand-roll a bare left-aligned state. **Sales leaks a schema id into UI copy** ("…from `reporting.sales_daily_revenue`").
- **D5 — Page header inconsistent.** Kitchen/Tasks/Daily Log get full `.page-head` (icon+title+meta+hairline); Follow-ups, Sales, Pricing, Budget, Weekly Updates, Objectives, Projects render a bare `<h1>`+subtitle.
- **D6 — Action buttons: 5 paradigms.** Blue primary `+ New…` (correct) vs Follow-ups' **bare text verbs** (Chase/Promise/Partial/Settle) vs catalog "Rename/Archive" text vs Kitchen ± steppers + floating bar vs Weekly Save/Submit. No single row-action affordance.
- **D7 — Language bleed.** Kitchen Stock headers "STOK/TERSEDIA" under English KPI labels; Weekly placeholder "Ringkasan minggu ini…" under an English label.
- **D8 — Orange FAB.** Large filled `brand-orange` "Open deputy" FAB on every screen — **violates the Orange-Sprinkle Rule** (orange = ≤2 tiny marks, never an action) + a FAB paradigm DESIGN.md never defines. Collides with content + Kitchen's Submit bar on phone.

## B. Visual bleeds
- **B1 [worst] — Follow-ups phone horizontal overflow:** raw `<table>` at 375px runs off-edge, State/Due/Actions off-screen — skips the OD-W4-4 table→card reflow.
- **B2 — Tasks desktop:** table overflows its card (h-scroll; "BUSINESS UNIT" clipped).
- **B3 — Kitchen Log floating Submit bar** overlaps group header + rows; on phone stacks with the orange FAB.
- **B4 — Orange FAB overlaps last-row content** on every phone screen.
- **B5 — Header band tint** inconsistent (Inbox header-to-white, no `secondary/35%` wash).

## C. IA / navigation disjointedness
- **C1 — "Daily Log" vs "Log"** indistinguishable siblings in OPERATE (ops feed vs Kitchen production log).
- **C2 — Kitchen has no rail parent** — Log/Plan/Stock/Review/Pushes sit flat; 3 names for one place (rail "Log" / breadcrumb "Operate › Log" / page "Kitchen · Log").
- **C3 — Breadcrumbs:** "Inbox › Inbox" self-crumb; Admin = bare "People"; Kitchen loses its "Kitchen" node.
- **C4 — Desktop rail flattens sub-destinations** (all Kitchen; Sales+Budget+Pricing) while the phone bottom-bar correctly collapses to 5 — two structures for one app.

## E. Unifying system (canonical → screens that must adopt). DESIGN.md already specifies all but the `[NEW]`.
1. **ONE table → `dashboard/data-table.tsx`** (has 768px card reflow). Adopt: Follow-ups(critical, kill `follow-ups-page.css` table), Kitchen ×5, Objectives, Projects&Processes.
2. **ONE toolbar → Tasks DB-view toolbar** (`control` chips + `seg`). Adopt: Cascade (Mine/All → `seg`), Kitchen, Ops.
3. **ONE select `[NEW small]`** — a tokened `Select` shell (32px/`input` border/8px/chevron) to replace all 11 native `<select>`. DESIGN.md defines inputs but not select.
4. **ONE pill → `tasks/status-pill.tsx`** (Tinted-Status) w/ variants; retire `follow-ups-pill`, consolidate pill/chip/tag/state-pill. Adopt: Follow-ups(critical), Kitchen, Projects/Objectives(neutral).
5. **ONE state-kit → `ui/state-kit.tsx`**. Adopt: Kitchen Review/Pushes, Sales, Pricing, Inbox; strip the Sales schema string.
6. **ONE page frame → full `PageHead` chrome**. Adopt: Follow-ups, Sales, Pricing, Budget, Weekly Updates, Objectives, Projects.
7. **ONE button system → `Button` variants**. Replace Follow-ups bare verbs + catalog text actions with real buttons / `⋯` row menu.
8. **ONE drill → row→detail drawer at `/…/:id`** (Tasks nails it); consistent `⋯` hover-action for inline-edit modules.
9. **IA fixes `[convention]`:** add a **Kitchen rail parent** (nest the 5); rename rail "Log"→"Kitchen Log" (kills C1); fix "Inbox › Inbox"; breadcrumbs resolve to real parent. A `docs/jtbd.md` mental-model fix.
10. **Orange FAB `[NEW ruling]`:** DESIGN.md forbids orange-as-action → move deputy launcher to a neutral/`primary` header affordance (a header "Open deputy" already exists — drop the floating orange). **Owner decision:** sanction a FAB paradigm at all? If yes, DESIGN.md needs a FAB spec.

## F. Leverage ranking (highest first) → the retrofit plan
1. **Rebuild Follow-ups onto the kit** (DataTable+StatusPill+Button+PageHead+state-kit) — fixes B1+D3+D6+D5 at once. *Rebuild.*
2. **Kill the 11 native `<select>`** with a tokened `Select` — broadest cross-app win.
3. **Kitchen → shared toolbar + DataTable + state-kit** + fix the floating-bar collision (B3). *Rebuild.*
4. **state-kit rollout** (Kitchen Review/Pushes, Sales, Pricing, Inbox) + strip the schema string. Cheap/high polish.
5. **PageHead standardization** across the 7 bare-header screens. Mechanical.
6. **IA cleanup** (Kitchen parent, "Log" rename, breadcrumb self-crumb, header tint). Small change, big "one app" gain.
7. **Orange FAB ruling** — owner decision + removal/redesign.

Plus **deputy C2 markdown + C3 typed-widgets** (owner-requested; `docs/specs/agent-capability-expansion.md`) folded into the same push.

## Regression-invariant guards to add
(a) no raw `<select>` in `src/pages`/`src/components` (lint/grep guard); (b) every list page imports shared DataTable + state-kit (unit); (c) Follow-ups renders card-list <768px, no h-overflow (RTL); (d) no `brand-orange` on an interactive element (token guard).

**Next:** turn E into a `DESIGN.md` addition (the `[NEW]` Select primitive + a FAB ruling) + a module-by-module retrofit plan in `docs/plans/`, execute via ui-implementer, re-verify via design-reviewer. Screenshots were session-temp (ephemeral).
