# Review battery — Buildout step 3 (Tasks re-home)

Reviewer (spec-review + code-quality, CROSS-FAMILY). Read-only. Verdict appended to
`docs/reviews/feat-redesign-buildout.md` under "## Step 3 — Tasks re-home (spec + code-quality, gpt-5.4)".

## Scope
Branch `feat/redesign-buildout`, step-3 commits `fa9967b..HEAD` (git diff fa9967b..HEAD --stat).
Focus: `mos-app/src/components/tasks/use-tasks-saved-view.ts` (NEW), tasks-layout/workspace/toolbar/
drawer rewiring, router, the tasks e2e.

## Read
- `docs/specs/redesign-tasks-rehome.spec.md` + `docs/plans/2026-07-15-redesign-tasks-rehome.plan.md`
  (honor its 3 deviations: ViewTabStrip→toolbar seam; team=label-level only; followups no
  discriminator this step).
- `docs/experience-contract.md` Rules 4/6/11.

## Verdict must cover
1. **Spec conformance:** saved-view URL grammar (?view=mine|team|overdue|followups) correct? Every AC
   met? View→existing-filter mapping faithful (My/Overdue real; Team/Follow-ups label-level per the
   accepted deviations — confirm they're wired, not silently broken)?
2. **Rule 11:** ONLY use-tasks-saved-view.ts is new? TasksWorkspace/TaskSurface/TaskDrawer/DAL
   REWIRED not rebuilt? No duplicate table/drawer/record logic introduced?
3. **Rule 4 URL state:** location.search preserved on row-open, keyboard, +New task, +Add task, drawer
   close? Back/refresh/new-tab safe? Any place that drops ?view=?
4. **Code quality + BDD:** the new/updated tests assert real journeys (not weakened); the URLSearchParams
   logic is centralized in the hook (not spread).
5. **Verdict:** APPROVE / APPROVE-WITH-NITS / BLOCK with line refs.

Director already live-verified: 4 chips render, record-open preserves ?view=overdue, gates green
(2591 unit, saved-view e2e 6/6). Your lens is code+spec conformance. End with: REVIEW-DONE
