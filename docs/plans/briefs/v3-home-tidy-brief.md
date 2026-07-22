# Lane brief — Home tidy: embed the "My open tasks" KPI remnant (single worker)

**Work in place in THIS working directory** (`.claude/worktrees/v3-home-tidy`, branch
`v3/home-tidy` already checked out — do NOT run `git checkout`). Commit here when green.
Run all npm commands inside `mos-app/`.

## Goal (owner audit P1, ledger "Home hierarchy remains card-heavy")

The Home page renders a standalone one-tile KPI grid ("My open tasks · 9") above the My tasks
table card. That lone tile is a dashboard remnant (structural card soup). Embed the count into
the My tasks card header instead and delete the standalone tile. This is a PROVISIONAL call —
your commit message and code comment must carry `RATIFY-BEFORE-MERGE: Home KPI-tile embed
(remove vs embed vs keep is an open owner decision)`.

## Exact changes

1. `mos-app/src/pages/home-page.tsx` (~lines 243-252): delete the `home-kpi-grid` block —
   the `<Link to="/work/tasks?view=my-work"><KPITile label={t('home.kpi.tasks')} .../></Link>`
   and its wrapping div. Remove now-unused imports/state IF nothing else uses them (check
   `taskCount`/`taskState` usage — the attention lanes may share the same query; delete ONLY
   what becomes dead. If `taskCount`/`taskState` become dead, remove their computation too).
2. `mos-app/src/components/weekly/my-tasks-card.tsx`: the card header (CardHead) currently shows
   title "My tasks" + subtitle "Where you're PIC or Supervisor · off track first" + "All tasks →"
   link. Append the open count to the header: when ready, show `· N open` where N = the viewer's
   tasks in the card's own `myTasks` set whose status is not Done/Archived (match however the old
   KPI computed "open" — read the old KPI count logic in home-page.tsx FIRST and preserve its
   definition; state that definition in a code comment). While loading show nothing (no dash).
   Keep it plain text in the subtitle line — no new pill/chip/tile component.
3. i18n: add a key for the count text (e.g. `home.myTasks.openCount` = `{count} open` /
   id `{count} terbuka`) in `mos-app/src/i18n/messages.ts` BOTH locales. Do not repurpose
   `home.kpi.tasks`; leave that key in place (other tests may reference it — if `messages.test.ts`
   asserts key parity only, leaving it is safe).
4. Tests (goal-level, UI fast-path — implement first, then lock):
   - Update `mos-app/src/pages/home-page.test.tsx`: remove/adjust assertions expecting the KPI
     tile; add an assertion that Home does NOT render the standalone tile and that the My tasks
     header shows the open count once ready.
   - Update `mos-app/src/components/weekly/my-tasks-card.test.tsx`: header shows `N open`
     matching the seeded fixture's open-task count.

## Constraints

- DESIGN.md tokens only; no new components; no new dependencies.
- Do NOT start Supabase, do NOT run the full test suite, do NOT touch anything outside the
  files above plus their tests.
- Smoke gate before committing: `npm run typecheck` · `npx eslint <changed files>
  --max-warnings=0` · `npx vitest run src/pages/home-page.test.tsx
  src/components/weekly/my-tasks-card.test.tsx src/i18n/` · `git diff --check`. All must pass.
- Commit with a clear message + the RATIFY line + trailer
  `Co-Authored-By: pi nemotron-3-ultra <noreply@gordi.id>`.

## Report back (stdout, final message)

Files changed, the open-count definition you preserved, test counts, and any place you had to
deviate from this brief (deviations must be listed explicitly).
