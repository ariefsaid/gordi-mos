# Lane brief — attach the Task dirty-leave guard to the live overlay entry (single worker)

**Work in place in THIS working directory** (`.claude/worktrees/v3-dirty-guard`, branch
`v3/dirty-guard` already checked out — do NOT run `git checkout`/`git switch`). Run all npm
commands inside `mos-app/`. Commit here when green.

## The defect (standing NO-SHIP blocker #1, current-tip audit 2026-07-22)

The dirty-leave machinery EXISTS but is not attached end-to-end on the live Task overlay entry:
- `mos-app/src/shell/overlay-host.tsx` — the host supports a leave-guard/veto transaction
  (see its dirty browser-pop TRANSACTION comments, ~lines 47-70, 108, 265, 363).
- `mos-app/src/components/tasks/record-details-panel.tsx` — bubbles `onDirtyChange` (~line 45)
  so the tenant can attach the guard.

Missing: the LIVE Task record content mounted via the shared RecordPanelHost/overlay entry does
not wire `onDirtyChange` into the entry's leave-guard, so a real in-progress edit can be lost on
Escape / Back / backdrop / route-leave without a retain-or-discard confirmation.

## The contract to implement (owner IA/IxD law — docs/interaction-contract.md, read I-rules first)

- With NO dirty edit: Escape / Back / backdrop close normally (unchanged).
- With a dirty edit (an uncommitted RecordField change): the close attempt is VETOED and a
  retain-or-discard confirmation appears (use the existing shared ConfirmDialog primitive —
  never a bespoke overlay; check how ConfirmArchive composes it).
  - Retain/Cancel → the record stays open, the draft intact, focus returned into the panel.
  - Discard → the close proceeds, the draft is dropped.
- Browser Back follows the host's existing dirty-pop transaction (pre-pop URL restore) — do not
  reinvent it; attach to it.
- I5 note: native selects eager-commit (they are never "dirty"); the guard concerns
  text/number/date drafts going through `useInlineCommit` (see its dirty semantics).

## Method (UI fast-path, binding)

1. Read the seam first: overlay-host.tsx guard API, record-panel-host.tsx, the Task record
   tenant that mounts record-details-panel, `useInlineCommit`, and one existing ConfirmDialog
   consumer. Understand what is already there — the audit says ATTACH, not build.
2. Implement the smallest end-to-end wiring.
3. Focused smoke: typecheck, changed-file eslint, focused vitest on the touched suites.
4. Goal-level tests (RTL/jsdom) proving the REAL journey: open Task panel → edit a field (make
   it dirty) → Escape → confirm dialog appears → Cancel keeps panel + draft; again → Discard
   closes; and a non-dirty Escape closes with NO dialog. Also Back-path veto if testable at
   this layer; note in the report if it needs the e2e layer instead.
5. Commit with trailer `Co-Authored-By: GLM-5.2 via pi <noreply@gordi.id>`.

## Constraints

- Do NOT touch: collection toolbar/tables, Home, Café, Inbox, Deputy, Signals presentation.
  Only the overlay/task-record seam + its tests.
- No Supabase, no full-suite runs, no browsers. No new dependencies or components.
- Do NOT commit package-lock.json drift (`git checkout -- mos-app/package-lock.json` before
  committing is the ONE permitted checkout, file-scoped).
- Escape layering order must be preserved: Deputy-above-record closes Deputy first (see
  deputy-overlay-coexistence) — your guard must not swallow that.

## Report back (final message)

Seam summary (what existed vs what you attached), files changed, journey-test names + counts,
gates, and any contract ambiguity you resolved (state your choice + why) or could not resolve
(flag it — do not guess on interaction grammar).
