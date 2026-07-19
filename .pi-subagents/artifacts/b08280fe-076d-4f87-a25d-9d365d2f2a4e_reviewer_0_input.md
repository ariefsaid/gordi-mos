# Task for reviewer

[Read from: /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/DESIGN.md, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/experience-contract.md, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/jtbd.md, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/decisions.md, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/reference/provenance/03-frustration-and-buildout-2026-07-13_16.md, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/design-mockups/redesign-mockups-2026-07/SALVAGE-INVENTORY.md, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/design-mockups/redesign-mockups-2026-07/e7-prototype.html, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/design-mockups/redesign-mockups-2026-07/e7-prototype.css, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/design-mockups/redesign-mockups-2026-07/e7-views.js, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/design-mockups/redesign-mockups-2026-07/e7-records.js, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/design-mockups/redesign-mockups-2026-07/e7-data.js, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/design-mockups/redesign-mockups-2026-07/convergence-flows/index.html, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/design-mockups/redesign-mockups-2026-07/convergence-flows/flows.css, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/design-mockups/redesign-mockups-2026-07/convergence-flows/flows.js, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/design-mockups/redesign-mockups-2026-07/convergence-flows/e7-prototype.css, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/design-mockups/redesign-mockups-2026-07/convergence-flows/e7-data.js, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/design-mockups/redesign-mockups-2026-07/convergence-flows/fixtures.js, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/mos-app/src/app.tsx, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/mos-app/src/router.tsx, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/mos-app/src/index.css, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/mos-app/src/shell/app-shell.tsx, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/mos-app/src/pages/home-page.tsx, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/mos-app/src/pages/home-page.css, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/mos-app/src/pages/tasks-layout.tsx, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/mos-app/src/components/tasks/TasksWorkspace.css, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/mos-app/src/components/signals/signal-record.tsx, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/mos-app/src/components/signals/signal-record.css]

READ-ONLY cross-version mockup ownership audit. In current cwd, do not edit files, start servers, read secrets, or perform writes. Read docs/design-mockups/redesign-mockups-2026-07/SALVAGE-INVENTORY.md, DESIGN.md, docs/experience-contract.md, relevant OD-REDESIGN-56..66 in docs/decisions.md, docs/jtbd.md, provenance 03..., then inspect e7 and convergence mockup source and committed screenshots. Compare to mos-app source. Identify only evidence-backed cross-version regressions, with exact paths/line numbers, severity/confidence, confirmed/inference, and explicitly note overrides/deferred scope. Do not propose fixes. Cover Visual, IxD, IA, Product/JTBD and dimensions including mobile <=390, Rule 11, Rule 8, two fronts. Return findings inline only.

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