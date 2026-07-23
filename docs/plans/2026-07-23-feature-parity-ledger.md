# Feature-Parity Ledger — V3 Redesign vs the shipped floor + the redesign vision

> **Owner's feeling (verbatim):** *"i feel like we've lost so many features from the start of the
> redesign… each is less and less feature… like a moving quicksand"* and *"we havent even captured
> those that were missing!"*
>
> **Method.** Four generation inventories were reconciled: **baseline** (the shipped pre-redesign app
> on `main` — the feature FLOOR, 107 features), **prototype** (110), **e7** (150), **build** (the
> current `v3-redesign` worktree, 135). Every feature that appears in any generation is classified by
> its fate in the build. Disputed presence/absence was verified by `grep` in
> `mos-app/src` (READ-ONLY). Decision coverage checked against `docs/decisions.md` (OD-*),
> `SALVAGE-INVENTORY.md`, `CONVERGENCE-AUDIT.md`, and `docs/backlog.md`.

---

## 1. Verdict — is the owner right, and by how much?

**Yes and no, and the distinction is the whole story.**

There are **two different "lost feature" claims**, and they have opposite answers:

### (A) Against the SHIPPED FLOOR (baseline `main`) — the owner is *mostly wrong*. The floor held.

| Fate | Count | % of 107 |
|---|---:|---:|
| CARRIED / IMPROVED | **91** | 85% |
| DELIBERATELY-CUT (OD-cited) | **13** | 12% |
| SILENT-LOSS (no OD, no backlog) | **2** | 2% |
| MOCKUP-ONLY-FICTION / trivial-drop | **1** | 1% |

The build re-skinned and re-homed almost the entire shipped app. The visible "shrinkage" is
**one dominant, deliberate, owner-locked deletion** — `OD-REDESIGN-33` collapsing **Weekly Updates +
Daily Log → Signals** — which alone accounts for **8 of the 13 cuts** (My Week, weekly write/review,
the two home strips, the manager team module, daily-log feed/filters/form, the weekly/daily ⌘K quick
actions). Those are not quicksand; they are a signed strategic simplification. Only **2** shipped
features left with no paper trail.

### (B) Against the REDESIGN VISION (what prototype→e7→OD-REDESIGN promised) — the owner is *right*, and this is the real quicksand.

The redesign didn't just re-skin the floor; it **promised a much larger surface** — Standards +
quality-loop, Process designer + Process Runs, Shifts, an **agentic** (acting, not just aware) Deputy,
a **composable Home canvas**, multi-view databases (Board/Timeline), and an admin governance matrix.
The build ships **the floor + Signals**. Most of that promised *new* value is **unbuilt**, and — unlike
the floor — **much of it is not tracked anywhere as outstanding scope**. That is exactly the "features
we haven't even captured as missing" the owner named.

**Bottom line:** the shipped floor did not silently erode (85% carried, ~2% silent). The **redesign's
new value did** — it exists in e7/prototype/OD, was never built, and fell out of the tracked backlog.
The felt "less and less" is the gap between the vision the owner grilled into being (OD-REDESIGN-1..66)
and a build that so far delivers the *old* app in the *new* IA. **7 vision surfaces are silent, un-queued
scope.** The restoration queue below is that missing scope, made visible.

### Per-surface health (build vs baseline floor)

| Surface | Floor fate | Note |
|---|---|---|
| shell-nav | Carried / improved | PageFamilyFrame > PageHead; Work-in-rail; Events added (OD-57) |
| command (⌘K) | Carried | weekly/daily quick actions cut with their features |
| home | **Half-cut** | finance KPIs → Money (OD-17); weekly/ops strips + team module + My Week → Signals (OD-33/48); attention-brief refinement deferred to Step 5 (OD-64) |
| tasks | Carried | minus multi-view (silent) + bulk-select (deferred OD-P3-6) |
| record-viewer | Carried | RACI + Notes tab removed deliberately (OD-62 / mockup-fidelity rule) |
| signals (was Inbox) | Improved | full Signal model: revisions, acks, comments, linked-work all built |
| money | Carried 1:1 | dashboard/budget/pricing/follow-ups intact |
| kitchen → Café | Improved | all 5 screens + opening home ported |
| catalogs / admin / auth / deputy | Carried | admin = people+roles parity; governance matrix NOT built (vision gap) |

---

## 2. SILENT-LOSS table — the restoration candidates (ordered by user impact)

A feature present in a prior generation, absent from the build, with **no OD and no backlog entry**.
"Last seen in" makes the never-captured ones visible.

| # | Feature | Last seen in | What it did | Evidence (absence) | Proposed disposition |
|---|---|---|---|---|---|
| **S1** | **Multi-view database: Board / Kanban / Timeline** | baseline (stub) → **e7 (real)** | Same records rendered as status-column board + date-rail timeline, not just a table. **Locked by OD-REDESIGN-2/7/8** ("β's multi-view database… Table/Kanban/Timeline"). | `task-collection-adapter.tsx:45` presentation = `'table' \| 'card'`; line 230 *"There is no disabled Board/Calendar presentation."* e7-033/034 had both live. | **REDESIGN** — build against the locked OD (Kanban first; Timeline where applicable). Signature redesign promise; currently silently downgraded to Table/Card. |
| **S2** | **Standards library + quality-loop** (Checks → Exception → correction Task → evidence → audit) | prototype (F068/094/095) → e7 (e7-066/067) | The whole "prove it was done right" spine: typed Standard steps, live pass/fail, evidence-required-on-fail, auto-raised Exceptions. **Locked by OD-REDESIGN-4/30/31.** | No Standard/Check/Exception record or page in `pages/` or `components/`; `grep` finds only keyword mentions. | **REDESIGN** — needs the deferred typed-Standard schema ADR (OD-4). Large; the governance value proposition of the redesign. |
| **S3** | **Process designer + Process Runs** (recurring-work runtime) | prototype (F090) → e7 (e7-060/065) | Author recurring workflows; each occurrence spawns Tasks with run-level completion/history. **Locked by OD-REDESIGN-11/12/13/58.** | Partial only: occurrence roll-up (`group-header-row` occurrenceRollup) + due-runs list (`due-runs-list.tsx`) exist; **no designer, no Run record, no Standard binding**. `components/processes/` = pending-resolution + occurrence-assign only. | **REDESIGN** — the surfacing half is started; the definition/Run half is missing and unscheduled. Schema ADR was deferred to "buildout step 6" (OD-58) but no backlog line carries it. |
| **S4** | **Agentic Deputy (the six-gap closure)** | prototype (F028) → e7 (e7-099/100/101/102) | Deputy *acts*: navigates the user, inline `@`-reach in any text, composes a widget into the workspace, in-context reversible writes, per-surface threads. **Locked by OD-REDESIGN-9/24/32** — the *headline* "agent-native" paradigm. | `AssistantPanel.tsx` has transcript/approval/rating/record-seed but **no** navigate tool, inline-`@`, or compose-to-workspace (`grep` empty). It is "context-aware, not context-acting" — exactly the PMO floor the redesign said to exceed. | **REDESIGN** — the redesign's stated identity. Build ships the PMO-level panel it was meant to surpass. |
| **S5** | **Composable Home canvas / Deputy-widget drop** | prototype (F019/F028) → e7 (e7-025/102) | User/Deputy compose Home from authorized widgets; accepted widgets pin to Home (not the transcript). **Locked by OD-REDESIGN-17/25/26** + headline OD-9. | Home is a fixed attention/personal stream (`home-stream.tsx`); the only "personal" control is an order toggle. Widgets exist behind dev-only `SHOW_USER_VIEWS` (`DevViewsPage`), never user-facing. | **REDESIGN** (or explicit RATIFY-defer) — currently neither shipped nor owner-acknowledged as deferred. `user_views` substrate exists; the surface doesn't. |
| **S6** | **Admin governance matrix** (access-by-person, preview-as-person, role-defaults, transfer-person, org-structure config) | e7 (e7-134..139) | The effective person×capability matrix + org/BU/Team/Role/Signal-layer config. **Locked by OD-REDESIGN-28/52.** | `components/admin/` = people list + role-editor + login mgmt only (baseline parity). No matrix / preview-as / role-defaults / transfer / org config. | **REDESIGN** — deferred by nature (later admin slice) but has **no backlog home**; it should be an explicit tracked epic, not silent. |
| **S7** | **Cascade ladder cross-view** (Objective → Project/Process → Task) | **baseline (BL-052)** | One screen showing the strategy-to-execution ladder with Mine/All + workload caption. | `/work/cascade` → `Navigate to="/work/tasks"` (`router.tsx:130`). Up/down-trace survives inside the catalogs (B122/B123) but the single ladder visualization is gone. | **RATIFY-CUT or REDESIGN** — partly absorbed into catalog traces; confirm the ladder isn't wanted, or rebuild as an Objectives roll-up. Lowest impact of the seven. |

**Two of the seven (S1, S7) are shipped-floor losses; five (S2–S6) are vision losses "never captured."**
S7 is the only genuinely low-stakes one.

### Baseline collateral worth a one-line ratify (not tabled — arguably OD-covered)
- **Home data-provenance "as of" note** (BL-025) left with the finance KPIs (OD-17 collateral).
- **Settings-stub** rail item (BL-015) — a disabled "coming soon" placeholder; MOCKUP-ONLY-FICTION, do not mourn.

---

## 3. DELIBERATELY-CUT — one line each, with citation

Absent from the build, but a signed decision covers it. **These are not quicksand.**

- **Weekly Updates — write pane** (BL-091) — `OD-REDESIGN-33/48`: filing replaced by generated period summaries.
- **Weekly Updates — manager review pane** (BL-092) — `OD-REDESIGN-33/48`.
- **My Week standalone page** (BL-030) — `OD-REDESIGN-33` (Signal + generated summaries supersede).
- **Home weekly-update strip** (BL-027) — `OD-REDESIGN-33/48`.
- **Home ops strip** (BL-028) — `OD-REDESIGN-33` (Daily Log retired).
- **Home manager team module** (BL-029) — `OD-REDESIGN-48` (no filing roster); team exceptions deferred to attention-Home `OD-REDESIGN-17/64`.
- **Daily Log feed** (BL-093) — `OD-REDESIGN-33/44` (`ops.log_entries` retired; no auto-mirror).
- **Daily Log filters + row actions** (BL-094) — `OD-REDESIGN-33`.
- **Daily Log add/edit form** (BL-095) — `OD-REDESIGN-33`.
- **⌘K "Write weekly update" + "Add Daily Log" quick actions** (BL-021, partial) — `OD-REDESIGN-33` (host features cut; "Create Task" carried).
- **Home finance KPI row** (BL-023) — `OD-REDESIGN-17` (routine KPIs live on Money, not Home).
- **Task RACI editor + owner +N RACI disclosure** (BL-057, BL-046) — `OD-REDESIGN-62` (Task = PIC + Supervisor; RACI reserved for governance).
- **Record "Notes" tab** (BL-059) — mockup-fidelity rule in `CLAUDE.md` (the "Notes-tab incident"); description folded into Details.
- **Task bulk-select / row checkboxes** (BL-040) — `OD-P3-6` ("bulk-select DEFERRED — no row checkboxes in v1").
- **Task Priority field / lane taxonomy** (prototype F102/F103) — superseded by the OD-REDESIGN-40/62 model (Team/PIC/Supervisor/Status; Ad-hoc derived, no Priority); `task-row.tsx:242` documents the deliberate column drop.

---

## 4. CARRIED / IMPROVED rollup (compact, per surface)

- **shell-nav (17/18 carried):** two-chrome nav, grouped rail (Work-in-rail per OD-57), capability gating, bottom-tab, mobile drawer, brand lockup, breadcrumb, notif bell, deputy launcher, user chip, appearance switcher, sign-out, responsive shell, 404/error-boundary. **Improved:** PageHead → `PageFamilyFrame` (shared state grammar, B019); Events destination added (OD-57); legacy-route redirect map (B020).
- **command (carried):** ⌘K, recent tasks, navigate + debounced async record search, keyboard nav; universal actions re-based to Ask Deputy · Share Signal · Create Task (B022).
- **tasks (carried, dense):** split-view workspace, group-by, BU/Status/Person filters, search, show-archived, column sort, group headers + overdue subtotal, workload caption, ⋯ menu, virtualization, keyboard layer, empty/no-results states, mobile grouped cards, inline title edit, status trigger. **Improved:** occurrence roll-up + assign-pending (B061), saved-view chips replace Mine/RACI/All segment (OD-57).
- **record-viewer (carried):** shared record document grammar, value-first inline field edit, control vocabulary, read-only provenance, actions footer, related-records, drawer split/expand/full-page (OD-63), optimistic save + live-announce, archive/unarchive, checklist, activity, comments + @-mentions.
- **signals (improved over baseline Inbox):** full Signal model — composer, feed rows, record with **revisions + acknowledgements + comments + linked-work** (`signal-record.tsx` — OD-39/45/47), archive collection, filters, category picker, record-scoped Ask Deputy, plus the retained Inbox triage (page + bell quick-panel, OD-20).
- **money (carried 1:1):** dashboard Summary/Detail tabs, global toolbar (cut·window·freshness), custom range, revenue + gross-margin KPI tiles, what's-coming stubs, daily-revenue chart + table fallback, sortable detail table, interim/GL footnote, budget + pricing (flag-gated), follow-up queue (OD-8 Cadence/queue; flag-gated).
- **kitchen → Café (improved):** all five screens (Log/Plan/Review/Stock/Pushes) + Café opening home, KPI strip, variance/transfer gates, offline banner, role gates, shared DataTable primitive — ported with Café language.
- **catalogs / admin / other (carried):** Objectives + Projects&Processes catalogs (inline manage), admin People (list, create, roles, password reveal, login mgmt, confirms + toasts), login (+ magic-link, recovery, dev demo persona), auth guards, Deputy panel (approval/question/rating chips), shared overlay/record-panel host, shared state kit, bilingual i18n.

---

## 5. Restoration queue — the silent losses as concrete work items

Ordered by impact. Items S2–S6 are **the "we haven't even captured those missing" scope** — they need a
backlog home *before* anything else, because right now they are invisible.

1. **[REDESIGN · HIGH] Multi-view database — Board/Kanban (then Timeline).** Restore the OD-REDESIGN-2/7/8
   promise. Add Kanban as a `presentations` entry in `task-collection-adapter.tsx` (records-over-views,
   not a second table). Acceptance: Tasks + Projects switch Table ↔ Board with shared saved-views/filters.
2. **[REDESIGN · HIGH] Standards + quality-loop epic.** Author the deferred typed-Standard schema ADR
   (OD-4). Build Standard record (typed steps), Check submission → Exception → correction Task → evidence
   → audit. This is the redesign's governance value; it has no current tracker.
3. **[REDESIGN · HIGH] Process designer + Process Runs.** Author the OD-REDESIGN-11 schema ADR (owed since
   "buildout step 6"). Build the guided Process designer (OD-13) and the thin occurrence record that owns
   run completion/history/snapshot; connect it to the *already-built* occurrence roll-up + due-runs.
4. **[REDESIGN · HIGH] Agentic Deputy — close the six gaps.** navigate-user tool, inline `@`-reach,
   compose-to-workspace, in-context reversible writes, per-surface threads (OD-9/24/32). Elevate the panel
   from "aware" to "acting" — the stated identity of the app.
5. **[REDESIGN or RATIFY-DEFER · HIGH] Composable Home canvas.** Surface the `user_views` substrate as the
   OD-17/25/26 personal/Deputy-widget canvas, or record an explicit RATIFY-defer so it stops being silent.
6. **[EPIC · MED] Admin governance matrix.** Effective person×capability matrix, preview-as-person,
   role-defaults, transfer-person, org-structure config (OD-28/52). Give it a tracked epic; it is a later
   slice, but "later" must be written down.
7. **[RATIFY-CUT or REDESIGN · LOW] Cascade ladder view.** Confirm the Objective→Project→Task ladder
   (BL-052) is intentionally absorbed into catalog traces, or rebuild it as an Objectives roll-up.

**Already tracked — do NOT re-file (TRACKED-LOSS, for completeness):**
- Objectives / Projects&Processes **record panels** — `backlog.md` convergence-queue ④ (catalogs manage inline only today).
- **Structured-content editor / `/` slash canvas** (OD-16; prototype F050) — `backlog.md` Issue 10.
- **Shift scheduling / rostering** (OD-5; prototype F093/e7) — `backlog.md` "Near-term follow-ups".
- **Events / Ecommerce / Roastery** modules — present as build stubs (B124/B131); scope-tracked.
- **Attention-first Home brief** refinement (team/Process exceptions for managers) — `OD-REDESIGN-64` Step 5.

**Mockup-only fiction — do not mourn or restore:** persona/impersonation switcher (prototype F008 / e7-008,
a demo device — its real descendant is item 6's preview-as-person), 4-button role-switch preview (F018),
"drag widgets to reorder" chips (F019, real version = item 5), Deputy-composed AR-aging / plan-adherence
demo widgets (F084/F110, fixtures), the IA comparison-matrix doc page (F109), text-size S/M/L/XL picker
(F005, never re-proposed), settings-stub rail item (BL-015).
