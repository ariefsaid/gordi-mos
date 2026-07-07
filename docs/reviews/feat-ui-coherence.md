# feat/ui-coherence — working ledger + agent handoff (2026-07-07)

Branch `feat/ui-coherence` off `dev` @ `6b36295`. Executes the retrofit plan in
[docs/reviews/ui-coherence-audit-2026-07-07.md](ui-coherence-audit-2026-07-07.md) §F. **NOT merged.**
Review battery + `scripts/pre-merge-check.sh` still owed before any merge (see bottom).

## Owner decisions locked
- **FAB: RESOLVED (owner-agreed).** No floating action button paradigm. Deputy launcher = neutral
  top-bar icon on **every** viewport (desktop + phone). DESIGN.md ruling written (below).
- Delegation: pi CLI — **glm-5.2** = opus-tier (hard rebuilds), **glm-4.7** = sonnet-tier (mechanical).
  Invocation: `pi --provider zai --model glm-4.7 -p --no-session -t read,write,edit,bash,grep,glob "<brief>" < /dev/null`
  ⚠️ pi stdout is sometimes swallowed — **verify by `git status`/reading files, do NOT trust an empty return.**
  glm-5.2 was 429-saturated during this session; pace it, fall to glm-4.7 for templated work.

## DONE (committed on branch)
- `5739c70` — **Select primitive** `mos-app/src/components/ui/select.tsx` (+`Select.css`,`select.test.tsx`,
  10/10 green). Mirrors `text-input.tsx`. Wraps native `<select>` + token chrome (appearance:none,
  chevron, disabled/error parity). **Not yet wired to any call site.** Plus **DESIGN.md** ratifications:
  the `[NEW]` Select spec (in §Inputs/Fields) + the **Deputy-Launcher/No-FAB Rule** (near the
  Orange-Sprinkle Rule; supersedes ADR-0019 D11).
- `0832bd1` — **shell/IA/FAB**: deleted `AssistantFab` (orange float) → `AssistantTopBarButton` now
  renders on all viewports (`top-bar.tsx` dropped the `!isNarrow`); Kitchen **"Log"→"Kitchen Log"**
  (`messages.ts` en `Kitchen Log`/id `Log Dapur`, `sections.tsx`); breadcrumb **self-crumb collapse**
  ("Inbox › Inbox"→"Inbox"). AC-AP-001 narrow assertion migrated to the top-bar launcher tests.
  Shell suite green (186), typecheck+lint clean. Fixes audit **D8/B3/B4, C1, C3**.
- `c99cd53` — **Select swap**: safe raw dropdowns in Budget,
  Pricing, Ops add/edit, Daily Log toolbar, Dev Views, CatalogManager, KitchenToolbar, and
  KitchenLogTable now use `@/components/ui/select`. Added `RI-IXD-5` source guard in
  `src/consistency.regression.test.tsx`: no raw `<select>` outside the primitive and documented Tasks
  exceptions (`tasks-toolbar.tsx` overlay + deferred `task-surface.tsx` / `record-details-panel.tsx`).
  Verification: red guard caught the 8 safe-swap files; then green `npm test -- src/components/ui/select.test.tsx
  src/pages/budget-page.test.tsx src/pages/pricing-page.test.tsx src/pages/dev-views-page.test.tsx
  src/pages/ops-add-form.test.tsx src/pages/ops-page.test.tsx src/components/catalog/catalog-manager.test.tsx
  src/components/kitchen/kitchen-toolbar.test.tsx src/components/kitchen/kitchen-log-table.test.tsx
  src/consistency.regression.test.tsx` (137 tests), `npm run typecheck`, and
  `npm run lint -- --max-warnings=0`.
- `53d1014` — **Follow-ups rebuild-to-kit**: `pages/follow-ups-page.tsx` now renders the
  queue through shared `DataTable` (desktop table + <768px card reflow), shared `StatusPill`
  (with optional label for follow-up states), shared `Button`, and `state-kit`; deleted
  `follow-ups-page.css` and retired `follow-ups-pill` / `follow-ups-table` chrome. Preserved
  `?filter=overdue`, canConfirm finance/admin gate, canChase lane gate, and RPC transitions.
  Added `/work/follow-ups/:id` router entry + read-only detail panel so row source links no longer
  land on a missing route; active promise/partial/settle forms render in that detail panel.
  Verification: red RTL assertions for shared DataTable, phone card branch/no overflow wrapper,
  state-kit, and detail route; then green `npm test -- src/pages/follow-ups-page.test.tsx
  src/components/tasks/status-pill.test.tsx src/components/dashboard/data-table.test.tsx
  src/router.test.tsx` (47 tests), `npm run typecheck`, and `npm run lint -- --max-warnings=0`.
- `0d1dd00` — **Kitchen shared-table retrofit slice**: Stock and Pushes now render through shared
  `DataTable` (desktop table + <768px card reflow) with page-level RI-IXD-6 guards; Pushes preserves
  the ratified dead-letter warning stripe via a new `DataTable.rowClassName` hook. Removed obsolete
  `KitchenStockTable` / `KitchenStockCards` components and CSS. Fixed the Kitchen Log submit/footer
  collision by moving `.kl-footer` back into normal flow and adding a B3 regression. Verification:
  red guards for DataTable row classes, Stock/Pushes DataTable branches, and Log footer position; then
  green `npm test -- src/components/dashboard/data-table.test.tsx src/pages/kitchen-stock-page.test.tsx
  src/pages/kitchen-pushes-page.test.tsx src/pages/kitchen-log-page.test.tsx` (106 tests),
  `npm run typecheck`, `npm run lint -- --max-warnings=0`, full `npm test` (243 files / 2339 tests),
  and `npm run build` (existing large-chunk warning only).
- `198dd27` — **Inbox/Sales state-kit cleanup**: Inbox now respects `useNotifications.loading/error`
  and renders shared `SkeletonRows`, `ErrorState`, and `EmptyState`; removed the Inbox surface wash
  so the header band no longer carries the home-only tint. Sales empty copy no longer exposes the
  internal `reporting.sales_daily_revenue` table name. Verification: red Inbox page state tests + Sales
  D4 copy test; then green `npm test -- src/pages/sales-dashboard-page.test.tsx
  src/pages/inbox-page.test.tsx src/components/inbox/InboxList.test.tsx`,
  `npm test -- src/consistency.regression.test.tsx`, `npm run typecheck`, and
  `npm run lint -- --max-warnings=0`.
- `cc1a0eb` — **content-header/PageHead standardization**: Follow-ups, Sales, Pricing, Budget, Weekly
  Updates, and CatalogManager-backed Objectives/Projects now use `PageHead variant="content"` with
  stable count/meta slots. Added `RI-IA-2` source guard for those targets and `RI-SEC-1` guard against
  internal reporting table names in page copy; Budget empty copy now avoids `reporting.bom_lines`.
  Verification: red source guards and stale Budget expectation; then green `npm test --
  src/consistency.regression.test.tsx src/pages/sales-dashboard-page.test.tsx src/pages/budget-page.test.tsx
  src/pages/pricing-page.test.tsx src/pages/updates-page.test.tsx src/pages/follow-ups-page.test.tsx
  src/components/catalog/catalog-manager.test.tsx src/pages/inbox-page.test.tsx` (134 tests),
  `npm run typecheck`, and `npm run lint -- --max-warnings=0`.

## REMAINING (retrofit plan §F, do in this order)
1. **Deputy C2 + C3** (glm-5.2). Spec: [docs/specs/agent-capability-expansion.md](../specs/agent-capability-expansion.md).
   C2 = safe-markdown in AssistantPanel; C3 = typed-widget results. ⚠️ ADR-0045 §1 / ADR-0049 are
   **referenced but NOT written** — re-read the spec, author the ADRs (eng-planner) before build.
   Battery/viewspec registry is already ported; AssistantPanel is plain-text by design (FR-P2-AP-004).

## Deferred (needs design-eyeball, NOT mechanical — own reviewed pass)
Kitchen **rail nesting/parent** (nest the 5 under a "Kitchen" sub-heading — audit C2 residue), 3-level
Kitchen **breadcrumb node** ("Operate › Kitchen › Plan"), **header-tint B5** (Inbox no `secondary/35%`
wash — fold into state-kit rollout), Admin bare-crumb parent.

## Regression guards still to add (audit §Regression-invariant)
(a) **DONE:** no raw `<select>` in `src/pages`/`src/components` outside the primitive + documented Tasks
exceptions (`RI-IXD-5`);
(b) every list page imports shared DataTable + state-kit; (c) **DONE for Follow-ups:** renders card-list <768px
(RTL, no h-overflow); (d) no `brand-orange` on an interactive element (token guard).

## Before merge-to-main (BINDING gate)
Run the review battery (spec · code-quality · **design 4-lens rendered** since many `*.tsx`/`*.css` changed ·
security if any auth/RLS touched — none so far) and record verdicts in THIS file, then
`bash scripts/pre-merge-check.sh` (exit 0). Render-verify the whole app (owner judges by look-vs-mockup —
[[visual-fidelity-bar]]). Local stack gotchas: `supabase start --ignore-health-check -x studio,imgproxy,
inbucket,edge-runtime,vector,analytics,realtime`; `supabase db reset` reseeds dev personas (pw `Passw0rd!dev`);
clear localStorage on stale-session hangs. DB Postgres :44322 / API :44321 (gordi-mos stack).
