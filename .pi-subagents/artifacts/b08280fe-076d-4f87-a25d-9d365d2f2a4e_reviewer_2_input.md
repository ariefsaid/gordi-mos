# Task for reviewer

[Read from: /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/design-mockups/redesign-mockups-2026-07/SALVAGE-INVENTORY.md, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/experience-contract.md, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/jtbd.md, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/decisions.md, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/reference/provenance/03-frustration-and-buildout-2026-07-13_16.md, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/design-mockups/redesign-mockups-2026-07/README.md, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/design-mockups/redesign-mockups-2026-07/CONVERGENCE-AUDIT.md, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/design-mockups/redesign-mockups-2026-07/convergence-flows/SCORECARD.md, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/design-mockups/redesign-mockups-2026-07/e7-prototype.html, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/design-mockups/redesign-mockups-2026-07/e7-views.js, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/design-mockups/redesign-mockups-2026-07/e7-records.js, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/design-mockups/redesign-mockups-2026-07/convergence-flows/index.html, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/design-mockups/redesign-mockups-2026-07/convergence-flows/flows.js, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/docs/design-mockups/redesign-mockups-2026-07/convergence-flows/fixtures.js, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/mos-app/src/router.tsx, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/mos-app/src/shell/app-shell.tsx, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/mos-app/src/pages/home-page.tsx, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/mos-app/src/pages/stacked-union-home.tsx, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/mos-app/src/pages/signals-archive-page.tsx, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/mos-app/src/pages/tasks-layout.tsx, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/mos-app/src/components/signals/signal-record.tsx, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/mos-app/src/components/signals/signal-record-host.tsx, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/mos-app/src/components/tasks/task-surface.tsx, /Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/audit-vdrd17/mos-app/src/components/tasks/task-drawer.tsx]

READ-ONLY four-lens product/IA audit of current redesign. Do not edit, create, delete files, start servers, read env/secrets, or use write controls. Read binding docs: SALVAGE-INVENTORY, experience-contract Rules 1-12, jtbd, decisions OD-56..66, provenance 03. Inspect mockup files/screenshots and app source/routes. Return severity-ranked, evidence-specific findings limited to regressions/lost earlier-approved properties; separate visual, IxD, IA, product/JTBD lenses; include explicit override check and CONFIRMED vs INFERENCE, confidence. Pay special attention Signal fact-vs-work, capture-first mobile, two-front density/obviousness, canonical routes, and component reuse. No fixes.

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