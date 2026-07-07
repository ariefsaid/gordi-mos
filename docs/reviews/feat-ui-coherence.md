# feat/ui-coherence — shipped ledger (2026-07-07)

Branch `feat/ui-coherence` off `dev` @ `6b36295`. Executes the retrofit plan in
[docs/reviews/ui-coherence-audit-2026-07-07.md](ui-coherence-audit-2026-07-07.md) §F. **Merged to `dev`**
in `dee6f8b` (pushed). Review battery is recorded below; `scripts/pre-merge-check.sh` passed before merge.

## Review verdicts
- spec: PASS — Director review, 2026-07-07. Branch conforms to audit §F plus deputy C2/C3 after ADR-0045/0049; no scope expansion beyond the ratified no-FAB deputy launcher, shared-kit cleanup, typed widgets, safe markdown, and rendered mobile follow-up.
- code-quality: PASS — Director close-read + green gates. Shared primitives reused; Tasks native-select exceptions preserved; assistant widget validation is shared server/client; phone `MyTasksCard` is a single-render breakpoint branch. Verification: `npm run typecheck`, `npm run lint -- --max-warnings=0`, full `npm test` (244 files / 2362 tests), and `npm run build`.
- design: PASS — Director 4-lens rendered review (desktop auth/home/deputy and phone auth/home/deputy). One phone Home issue was found: `MyTasksCard` clipped a five-column table under the bottom tab bar. Fixed with stacked phone cards and re-rendered; no remaining visual blocker.
- security: PASS — Director trust-boundary review. Markdown uses a fixed allowlist with no raw HTML and URL-scheme filtering; user turns remain literal; invalid widget artifacts fail closed; `query_entity` reads still run through caller-JWT/RLS and no service-role or business-write path changed.

## Owner decisions locked
- **FAB: RESOLVED (owner-agreed).** No floating action button paradigm. Deputy launcher = neutral
  top-bar icon on **every** viewport (desktop + phone). DESIGN.md ruling written (below).
- Delegation: pi CLI — **glm-5.2** = opus-tier (hard rebuilds), **glm-4.7** = sonnet-tier (mechanical).
  Invocation: `pi --provider zai --model glm-4.7 -p --no-session -t read,write,edit,bash,grep,glob "<brief>" < /dev/null`
  ⚠️ pi stdout is sometimes swallowed — **verify by `git status`/reading files, do NOT trust an empty return.**
  glm-5.2 was 429-saturated during this session; pace it, fall to glm-4.7 for templated work.

## DONE (committed on branch, merged to dev)
- `5739c70` — **Select primitive** `mos-app/src/components/ui/select.tsx` (+`Select.css`,`select.test.tsx`,
  10/10 green). Mirrors `text-input.tsx`. Wraps native `<select>` + token chrome (appearance:none,
  chevron, disabled/error parity). Later commits wired the safe non-Tasks dropdown call sites. Plus **DESIGN.md** ratifications:
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
- `cdefdaa` — **ADR checkpoint for deputy C2/C3**: authored and accepted ADR-0045 (typed transcript widgets)
  and ADR-0049 (safe assistant markdown), preserving the numeric IDs referenced by the expansion spec.
- **Deputy C2/C3 implementation**: Assistant prose now renders through
  `react-markdown` + `remark-gfm` with a fixed element set, no raw HTML, URL-scheme allowlist, and user turns
  still literal. `query_entity` now accepts optional `as:"table"`; successful reads emit a validated
  `data_table` artifact while the normal tool-result grounding loop remains unchanged. `widgets.ts` is the
  shared server/client validation boundary; live SSE and persisted thread display both fold valid artifact
  widgets into the transcript; invalid artifact payloads drop fail-closed. Prompt no longer says "respond in
  plain text" and advertises the table hint. Verification so far: red Deputy tests first, then green
  `npm test -- src/components/assistant/AssistantPanel.test.tsx src/lib/agent/agentSchema.test.ts
  src/lib/agent/handler.test.ts src/lib/agent/history.test.ts src/lib/agent/agentPrompt.test.ts` (44 tests),
  `npm run typecheck`, `npm run lint -- --max-warnings=0`, full `npm test` (244 files / 2361 tests), and
  `npm run build` (existing large-chunk warning only).
- **Rendered review follow-up**: phone viewport review caught the Home `MyTasksCard` still rendering its
  five-column mini-table, clipping Status/Owner/Due/Activity under the bottom tab bar. Fixed with a
  single-render `useIsDesktop()` branch: desktop keeps the table; phone renders stacked task cards with
  the same task link/status/owner/due/activity data. Verification: red `RI-MOBILE` component test, then
  green `npm test -- src/components/weekly/my-tasks-card.test.tsx`; refreshed Playwright phone screenshot
  confirmed the clipped table is gone.

## Merge verification
Implementation is merged to `dev`. Gate evidence: `npm run typecheck`, `npm run lint -- --max-warnings=0`,
full `npm test` (244 files / 2362 tests), `npm run build`, rendered desktop/phone review, and
`bash scripts/pre-merge-check.sh` exit 0.

## Deferred (needs design-eyeball, NOT mechanical — own reviewed pass)
Kitchen **rail nesting/parent** (nest the 5 under a "Kitchen" sub-heading — audit C2 residue), 3-level
Kitchen **breadcrumb node** ("Operate › Kitchen › Plan"), **header-tint B5** (Inbox no `secondary/35%`
wash — fold into state-kit rollout), Admin bare-crumb parent.

## Regression guards still to add (audit §Regression-invariant)
(a) **DONE:** no raw `<select>` in `src/pages`/`src/components` outside the primitive + documented Tasks
exceptions (`RI-IXD-5`);
(b) **DONE for retrofit targets:** Follow-ups, Sales, Kitchen Stock, and Kitchen Pushes import shared
DataTable + state-kit (`RI-IXD-8`); (c) **DONE for Follow-ups:** renders card-list <768px
(RTL, no h-overflow); (d) **DONE:** no `brand-orange` outside tokens/logo/view-tab underline (`RI-IXD-7`).

## Future merge-to-main note
This branch is already on `dev`; any later `dev`→`main` promotion still needs its own release ledger/battery.
Local stack gotchas: `supabase start --ignore-health-check -x studio,imgproxy,inbucket,edge-runtime,vector,
analytics,realtime`; `supabase db reset` reseeds dev personas (pw `Passw0rd!dev`); clear localStorage on
stale-session hangs. DB Postgres :44322 / API :44321 (gordi-mos stack).
