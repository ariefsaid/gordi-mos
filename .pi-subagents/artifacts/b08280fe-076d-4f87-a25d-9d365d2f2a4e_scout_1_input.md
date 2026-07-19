# Task for scout

[Read from: /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/reviews/feat-redesign-buildout.md, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/reviews/claude-redesign-buildout-completion-vdrd17.md, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/reviews/claude-redesign-buildout-completion-vdrd17-step4.md, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/reviews/claude-redesign-buildout-completion-vdrd17-step6.md, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/reviews/claude-redesign-buildout-completion-vdrd17-step7.md, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/reviews/claude-redesign-buildout-completion-vdrd17-step8.md, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/reviews/claude-redesign-buildout-completion-vdrd17-step9.md, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/reviews/claude-redesign-buildout-completion-vdrd17-step10.md, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/reviews/claude-redesign-buildout-completion-vdrd17-step11.md, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/reviews/design-authority-audit-2026-07-17.md, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/plans/2026-07-14-redesign-buildout.md, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/plans/2026-07-14-redesign-styling-pass.plan.md, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/plans/2026-07-14-redesign-shell-routes.plan.md, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/plans/2026-07-15-redesign-tasks-rehome.plan.md, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/mos-app/src/shell/app-shell.tsx, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/mos-app/src/shell/rail.tsx, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/mos-app/src/shell/rail-nav.tsx, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/mos-app/src/shell/bottom-tab-bar.tsx, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/mos-app/src/shell/mobile-drawer.tsx, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/mos-app/src/pages/home-page.tsx, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/mos-app/src/pages/home-page.css, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/mos-app/src/pages/stacked-union-home.tsx, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/mos-app/src/pages/stacked-union-home.css, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/mos-app/src/pages/signals-archive-page.tsx, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/mos-app/src/pages/tasks-layout.tsx, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/mos-app/src/components/tasks/TasksWorkspace.css]

READ-ONLY build/evidence audit. Do not edit files, start/stop servers, read secrets, or perform app writes. Inspect docs/reviews/feat-redesign-buildout.md and all claude-redesign-buildout-completion-vdrd17-step*.md plus relevant design review ledgers; inspect actual mos-app React/CSS route and shell implementation. Compare claims to mockup ownership and call out likely regressions / unreviewable states with exact path+line evidence. Focus responsive/mobile, Rule 8 capture-first, Rule 11 reuse, manager scanning vs least-technical obviousness. Return concise evidence-backed findings only, no fixes.

## Acceptance Contract
Acceptance level: reviewed
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Implement the requested change without widening scope
- criterion-2: Return evidence sufficient for an independent acceptance review

Required evidence: changed-files, tests-added, commands-run, validation-output, residual-risks, no-staged-files

Review gate: required by reviewer.

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```