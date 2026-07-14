# Fix round — step 3 review BLOCK (Rule 4: ?view= dropped on 3 open paths). Fix ALL, nothing else.

Branch `feat/redesign-buildout` (already checked out — no git checkout). Commit per fix; never push.

## The finding (docs/reviews/feat-redesign-buildout.md "Step 3")
Saved-view `?view=` is preserved on row-CLICK but DROPPED on 3 other record-open paths, breaking
Rule 4 (Back/refresh/new-tab must preserve the saved view). Each is a `<Link to={\`/work/tasks/${id}\`}>`
that omits the current `location.search`:
- `mos-app/src/components/tasks/task-row.tsx:81` (task-name Link)
- `mos-app/src/components/tasks/row-menu.tsx:36` (row-menu "Open")
- `mos-app/src/components/tasks/mobile-grouped-cards.tsx:84` (mobile card open)

## Fix
Make each Link's `to` include the current `location.search` (the saved-view hook
`use-tasks-saved-view.ts` already exposes `search: location.search` — use that seam, or `useLocation().search`
locally). Result: opening a task via name-link, row-menu Open, open-in-new-tab, and mobile card all
land on `/work/tasks/:id?view=<current>` and preserve the view on refresh/new-tab.

## TDD (BDD — assert the real journey, do not weaken)
Add/extend tests so EACH of the 3 paths is proven to preserve `?view=`: a component/e2e test per path
(name-link, row-menu Open, mobile card) that opens from `?view=overdue` and asserts the resulting URL
keeps `view=overdue` (and refresh keeps the record+view). The existing saved-view e2e
(`shell-url-state.spec.ts` / AC-306..308) is the pattern.

## Gates (from mos-app/)
`npm run typecheck` (0) · `npm run lint` (0) · `npm test` (green) · `npx playwright test` (green).
Paste tails.

## Report: per path fixed + its test. End with: FIX-DONE
