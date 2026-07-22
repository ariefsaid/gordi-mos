# Lane brief — collection header to E7-beating anatomy (single worker)

**Work in THIS worktree** (`.claude/worktrees/v3-e7-header`, branch `v3/e7-header` checked out —
never `git checkout`/`git switch`). npm inside `mos-app/`. Commit when green.

## Owner law (verbatim): "why settle for less than e7" — E7 is the FLOOR, per axis.

The live E7 reference is running at `http://localhost:8766/e7-prototype.html#/work` (serve is up).
Open it with the agent-browser CLI and STUDY the Tasks screen before coding. Its exact anatomy:

1. Page head: `Tasks` title / `N items · <view>` meta / one quiet job sentence / `Create Task`
   button right. (Ours is already close — keep.)
2. Toolbar row: `SAVED VIEW` micro-label + view chips [My tasks|Today|...] LEFT (saved views are
   the PRIMARY axis and come first); presentation switch [Table|Board|Timeline] RIGHT.
3. Query row: search input LEFT; RIGHT-aligned quiet controls: [sort ▾] [grouping ▾] [Save view].
   FLAT — nothing disclosed on desktop.
4. Result card: the table lives INSIDE a bordered card that opens with a result header —
   `<view> · <collection>` left, `N items in your scope` right — then the table.

## Change our `CollectionToolbar` + `RecordCollection` surface (Tasks AND Signals inherit):

- `mos-app/src/components/record-collection/collection-toolbar.tsx` + `.css`:
  a. Row 1 reorder: view-chip strip (presets + saved chips, existing merged strip) FIRST-left,
     with a small `Saved view` micro-label like E7's `SAVED VIEW` (the i18n key exists from the
     current slice); presentation ViewTabs moves RIGHT (row-end).
  b. Row 2 (query): search left; then a spacer; then the view-option selects (group, sort)
     rendered INLINE right-aligned as quiet selects, then the `Save view` ghost button, then
     domain `toggles`. DELETE the desktop "View options" disclosure trigger/row and its dot —
     E7 proves the flat row is calmer. KEEP the phone behavior exactly as-is (OD-61: everything
     behind the single phone `View & filters` disclosure; the `!isDesktop` auto-expanded options
     row logic collapses into simply rendering the same flat controls inside the phone panel).
  c. Domain FILTER selects (team/status/person/category...) stay LEFT next to search (they are
     query, not view shape). If the row gets crowded at 1280 with Tasks' 3 filters + 2 view
     options, the view options may wrap to a second right-aligned line — but no disclosure.
- Result header (`record-collection.tsx/.css`, added by the current slice as a plain band):
  reframe to the E7 result-card anatomy: the header + table share ONE card frame (border-radius
  on the card, header as its first row: `<view name> · <collection label>` left, localized
  `N items in your scope` right — replace the current `N results` wording; i18n both locales).
- Tests: update collection-toolbar/tasks-workspace/signals-archive/tasks-page/cascade journeys —
  the `ensureViewOptionsOpen()` helpers become no-ops/removed since controls are visible again;
  keep every goal-oracle. Delete tests that exist ONLY to prove the disclosure. Keep phone tests
  (View & filters) untouched.

## Gates
- typecheck · eslint changed --max-warnings=0 · stylelint changed css · focused vitest:
  record-collection, tasks-workspace, tasks-page, signals-archive, cascade-d1, cascade-fixes ·
  `git diff --check`. Render Tasks at 1280 via agent-browser (`http://localhost:5199` serves a
  DIFFERENT worktree — do NOT use it; instead run `npm run dev -- --port 5210` here, log in via
  the Director demo login, screenshot, kill the server) and include what you saw in the report.
- No Supabase start (the shared stack is already up — your dev server just points at it via the
  existing `.env`; copy `.env` from `../v3-redesign/mos-app/.env` if missing). No full suite.
- No package-lock.json in commits. Trailer: `Co-Authored-By: GLM-4.7 via pi <noreply@gordi.id>`.

## Report: files changed, the final row-1/row-2 orders, what the 1280 render showed, test counts.
