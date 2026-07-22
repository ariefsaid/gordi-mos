# Lane brief — remove Task selection scaffolding until a real bulk action ships (OD-REDESIGN-83.2)

**Work in place in THIS working directory** (`.claude/worktrees/v3-selection-cut`, branch
`v3/selection-cut` checked out — never `git checkout`/`git switch`). npm commands inside
`mos-app/`. Commit here when green.

## The ratified decision (docs/decisions.md OD-REDESIGN-83.2 — read it)

Tasks renders selection checkboxes + select-all but NO bulk action exists; Signals is honest
(no selection). The dead affordance goes. This closes the last NEEDS-DECISION row of
`docs/reviews/v3-table-parity-matrix.md` (read that row for the exact file:line pointers:
`task-collection-adapter.tsx` advertises selection; `tasks-table-body.tsx` + `task-row.tsx`
render the checkbox column; `row-checkbox.tsx` is the primitive).

## Scope

1. Stop advertising selection in the Task collection adapter (mirror how
   `signal-collection-adapter.tsx` declares it false/empty).
2. Remove the checkbox column (header select-all + row checkboxes) from the Task table body
   and row; renumber/adjust the nth-child column width rules in `TasksWorkspace.css`
   accordingly — CAREFUL: the priority-tier media query and the `width:auto` identity column
   contract (cascade-fixes RI-3 test) must stay intact; update those tests' column indices.
3. Keep `row-checkbox.tsx` on disk ONLY if something else uses it (grep); otherwise delete it
   and its test.
4. The `checked/onCheck` props and any selection state plumbing that becomes dead: remove it
   (typecheck will chase the seams). Do not leave commented-out code.
5. Update every test that drives or asserts checkboxes/select-all (tasks-workspace,
   task-row, cascade suites, a11y/tap-target suites if they reference the checkbox).
   Journey steps change; goal-oracles stay.
6. Update the parity matrix row: verdict CONVERGED, disposition "selection removed until a
   real bulk action (OD-REDESIGN-83.2)".

## Constraints
- Do NOT touch: Signals files, record-collection engine/toolbar, overlay/record hosts, Home.
- Mobile grouped cards: if they render checkboxes, same removal applies.
- No Supabase, no full-suite, no browsers, no new deps. Focused vitest only.
- No `package-lock.json` in the commit (`git checkout -- mos-app/package-lock.json` allowed).
- Smoke gate: typecheck · eslint changed --max-warnings=0 · stylelint changed css · focused
  vitest on all touched suites · `git diff --check`.
- Commit trailer: `Co-Authored-By: GLM-4.7 via pi <noreply@gordi.id>`.

## Report back
Files changed/deleted; the new Task table column set + width shares at base and ≤1120px
tiers; test counts; anything that still references selection that you deliberately left.
