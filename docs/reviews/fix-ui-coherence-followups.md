# Review battery — `fix/ui-coherence-followups`

Branch off `dev`. Completes the UI-coherence + deputy-battery work per
[docs/plans/2026-07-07-coherence-completion.md](../plans/2026-07-07-coherence-completion.md), plus the D7
language-bleed fix and the independent validation of the prior merged branch. Director-orchestrated (pi
glm-5.2/4.7, backgrounded), **every wave Director-verified** (typecheck + lint + FULL `npx vitest run` +
build; rendered spot-check of the flagship port). No auth/RLS/schema/migration path changed.

## Scope (11 commits)
- `1e14c55` D7 language bleed → i18n (Kitchen Stock headers, Weekly placeholder).
- `585f67b` fix the 48-test regression D7 caused (I18nProvider harness gaps; caught by the full suite).
- `4fc0b3b` Director independent validation of the previously-merged `feat/ui-coherence` (see that ledger).
- `96dc9db` **W1.1** DataTable row grouping (`groups?`, collapsible headers, phone section labels; later
  extended with `hint?` and `headerActions?`). Flat-mode unchanged.
- `1fc4e5e` **W1.2** Kitchen Plan + Pesanan → shared grouped DataTable (retired their kt-table components).
- `e2df850` **W2.1** deputy widgets render as real primitives (data_insight→KPITile, data_chart→ChartFrame
  with token SVG bar + a11y table fallback), fail-closed.
- `a98f179` **W1.3** Kitchen Log → shared DataTable (Planned/Off-plan groups, stepper render-cells).
- `8d65e54` **W1.4/W1.5** Kitchen Review → shared DataTable (`headerActions` slot for bulk-approve/gate);
  **retired the entire kt-table grammar** (kitchen-group-header + kitchen-table.css + review table/cards/row,
  14 files). **All 5 kitchen screens now use the ONE shared DataTable.**
- `912fdb1` **W2.2** deputy agent EMITS insight/chart widgets (query_entity `as` enum + builders + prompt),
  fail-closed; `deno check` clean.

## Machine-readable verdicts (parsed by `pre-merge-check.sh`)
- spec: SHIP — completes plan §W1.1–W1.5 + W2.1–W2.2 + D7; no scope creep; behavior invariants preserved
  (kitchen submit payloads, gating AC-020/021/022/030/040/041/042, follow-up money-path untouched here).
- code-quality: SHIP — one shared table primitive replaces the private kt-table grammar; grouping extensions
  (`hint`/`headerActions`) are additive + backward-compatible; deputy builders are pure + fail-closed; Director
  fixed defects glm's targeted-verify missed (matchMedia mock typecheck error; 2 prompt/schema tests; the D7
  regression). Verified: `npm run typecheck`, `npm run lint --max-warnings=0`, full `npm test`
  (233 files / 2297 tests), `npm run build`, `deno check` on the edge handler.
- design: SHIP — rendered spot-check (Director, dev build): Kitchen Log renders through the shared DataTable
  with KPI tiles, Production/Transfer seg, the tokened Select, the collapsible "Planned today" group header,
  stepper cells, and status pills — visually identical in function to the pre-port bespoke table, now unified.
  Kitchen rail nesting + 3-level breadcrumb + neutral header deputy launcher (no orange FAB) all present.
- security: PASS — no auth/RLS/schema/migration changed. W2.2 changes only the post-read widget *presentation*
  (builders run on the already-RLS-scoped query_entity result; dispatch is fail-closed; unknown `as` → table).
  Deputy markdown/widget fail-closed validation (from the prior branch) intact.

## Outstanding (not blockers for this branch)
- A real `dev`→`main` battery is still owed for any main promotion (task #16 F) — this ledger is branch-scoped.
- `id` locale leaves `kitchen.stock.col.dish` = `Dish` (trivial translation follow-up).

---

## Session 2 (2026-07-07 late) — design teardown + A-level polish (handoff for the next agent)

**Branch/worktree map (READ FIRST):**
- `fix/ui-coherence-followups` @ `7dbf09b` (main checkout) — Session-1 work (kitchen coherence W1.1–1.5,
  deputy battery W2.1–2.2, D7, validation) + the type-scale fix + the 3-lens teardown docs. **Not merged.**
- **`feat/ui-polish-a` @ `1482f93`** (worktree `/Users/ariefsaid/Coding/gordi-mos-uipolish`) — the **A-level UI
  fixes** below. Branched off `7dbf09b`. **Not merged.** (node_modules is symlinked from the main checkout.)
- `feat/dashboard` (worktree `.claude/worktrees/dashboard`) — a **PARALLEL owner-directed session** building
  the `/sales`→`/dashboard` analytical hub (OD-DASH-1..6 in `docs/decisions.md`, `docs/specs/dashboard.spec.md`,
  3 mockups, `docs/plans/2026-07-07-dashboard.md`). Its uncommitted files sit in the main checkout too — **do
  NOT touch/clobber them.** Lanes were kept disjoint; reconcile `feat/ui-polish-a` + `feat/dashboard` at merge.

**The 3-lens rendered design teardown** → [design-teardown-2026-07-07.md](design-teardown-2026-07-07.md)
(sources: design-audit / audit-probe-operator / audit-probe-craft). Owner asked for the "unknown-unknowns," not
just bleeds. Three vision audits (gpt-5.4) converged on 5 root problems: (1) **no page-archetype system** →
"several apps"; (2) **Home's wrong promise** (cockpit chrome + dead KPIs); (3) **empty states emptied not
designed**; (4) **nav teaches the database not the work**; (5) **trust gaps** (no provenance/as-of, no
saved-state, silent redirects). The teardown splits fixes into **A (bounded UI)** / **B (owner design
decisions)** / **C (roadmap/F)**.

**A-level DONE on `feat/ui-polish-a`** (each Director-verified: typecheck + tests + lint):
- `829a754` **A1** the two P0 bleeds (Home My-tasks DUE overrun + `/tasks` DUE off-viewport → col rebalance +
  `.tasks-scroll` overflow-x) **+ A7** mobile content-header reflow.
- `0fd6faf` **A3** routed the last bare empty state (Inbox) through shared state-kit (most routes already used it).
- `1482f93` **A5** inline per-cell saved/pending feedback on the Kitchen Plan editor.
- **A2** (type scale) shipped in `7dbf09b` (body base 16→14, PageHead title 26→24 / subtitle 16→14, KPI label
  12.5→12 — the base was never set, so unsized text inherited browser-16px).
- **A4** (explicit not-live/no-access states for the silent redirects) **DEFERRED** — touches `router.tsx`,
  which the dashboard session is editing; sequence after theirs lands.
- **A6** (provenance/as-of on finance KPIs) **covered** by the dashboard session's `FreshnessLabel` (their spec
  ties every figure to `snapshot_as_of`).

**Owner decisions (this session):** A1–A7 → do now (done); **Home identity → decide after mockups** — but
OD-DASH-2 already answers it ("Home = light role-aware landing; finance tiles link to `/dashboard`"), which
resolves teardown root-problem #2; **B2 archetypes → "plan it properly."**

**NEXT MAJOR PHASE — B2 (the root "several apps" cure):** author 3 page archetypes in `DESIGN.md` —
**Workspace** (title + summary + tool rail + dense body) / **Write-Review** (title + context strip + bounded
form) / **Catalog-Manage** (title + inline create bar + dense list) — with `/dashboard` as a Workspace
instance (align to the dashboard session, but pressure-test). Then retrofit route-by-route. Deserves a fresh
context budget. The "empty states feel unfinished" residual (A3) is a **component-framing** question → fold
into the archetype empty-state spec, not more per-route swaps.

**Gotchas found:**
- ⚠️ **The lint gate is a false-green on warnings.** `npm run lint -- --max-warnings=0` — npm SWALLOWS the flag
  ("Unknown cli config --max-warnings"), so it never reaches eslint; the gate has never enforced zero-warnings.
  There is 1 pre-existing `react-hooks/exhaustive-deps` warning (`kitchen-plan-page.tsx` planGroups useMemo) it
  silently allowed. **Fix: bake `--max-warnings=0` into the `package.json` `lint` script's eslint call.**
- Delegation: **background long pi dispatches** (`run_in_background`) — the 10-min foreground Bash cap was
  clipping glm-5.2 mid-work (mis-read as "model failed"); see [[pi-long-dispatch-timeout]]. **glm-5.2 is
  text-only** (blind for visual audits); **gpt-5.4 is vision-capable** (use it for rendered audits). **agy**
  (Gemini) is documented in the vault as unsuitable for long browser audits (Flash-only, 20/day quota,
  parallel-unsafe). glm hit a 5-hr usage limit mid-session (resets ~01:18) → fell back to gpt-5.4 as implementer.
- Worktree render-verify: the preview MCP browser binds to its own 5173 server and snaps back from other ports;
  to eyeball a worktree, run its dev server (`npm run dev -- --port 5174`) and open it directly.
