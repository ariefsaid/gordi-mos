# V3 Storybook component/state/responsive matrix

This deterministic artifact is Issue 2 workbench evidence. It proves canonical story coverage and responsive/a11y configuration; it does not claim application migration or the Issue 9 representative rendered/driven owner gate.

## Package and runner

- Storybook: `10.5.2` with `@storybook/react-vite@10.5.2`
- Addon: `@storybook/addon-a11y@10.5.2`
- Isolated runner: `@storybook/test-runner@0.24.4` (external Playwright/Jest CLI; not a Storybook addon)
- A11y mechanism: `@storybook/addon-a11y` with `parameters.a11y.test: 'error'` executed by `test-storybook`; no Vitest 4 path

## Totals

- Story exports: **28**
- State entries: **36**
- Responsive entries: **3**
- Canonical component jobs represented: **23**
- Viewports: **desktop1280, intermediate, phone390**

## Scope claims

- Application migration completed: **no**
- Representative rendered acceptance completed: **no**
- Future Issue 4 host behavior claimed: **no**

## Known gaps and later owners

- Button loading state is not exposed by the canonical primitive; owner: Issue 3.
- RecordPanelHost remains the current shell; future host behavior is owned by Issue 4.

## Master-spec boundary

- Issue 2: Storybook component/state/responsive matrix proving the reconciled `DESIGN.md` contract.
- Issue 3 unlock: owner approval after this evidence; Page-family primitives and migration guards.
- Issue 9 remains separate: Representative-slice rendered/driven owner gate; provisional IA ratification.

## Jobs

- accessibility.keyboard-focus
- accessibility.runnable-a11y
- accessibility.runtime-proof
- controls.button-state-matrix
- controls.field-state-matrix
- controls.keyboard-focus
- controls.selection-status
- dense-collection.realistic-gordi-records
- dense-collection.state-matrix
- dense-collection.viewport-matrix
- feedback.empty-variants
- feedback.error-retry
- feedback.loading-skeleton
- feedback.saving-saved
- feedback.validation-retry
- foundation.colors-borders-radii-elevation
- foundation.focus-visible
- foundation.icons
- foundation.responsive-frames
- foundation.runtime-fonts-background
- foundation.spacing-rhythm
- foundation.typography-roles
- overlay.anchored-menu
- overlay.command-search
- overlay.confirmation
- overlay.current-record-panel-shell
- page-composition.focused-record
- page-composition.management
- page-composition.workspace

## States

- button.active
- button.default
- button.disabled
- button.focus-visible
- button.hover-documentation
- button.loading-debt
- checkbox.checked
- checkbox.default
- checkbox.disabled
- checkbox.indeterminate
- collection.empty
- collection.error
- collection.filtered-empty
- collection.loading
- collection.ready
- empty.awaiting
- empty.blank
- empty.next-step
- empty.quiet
- error.retry
- feedback.saved
- feedback.saving
- feedback.validation-retry
- loading.shell
- loading.skeleton-rows
- overlay.current-host-shell
- select.default
- select.disabled
- select.error
- select.focus-visible
- status.semantic-tones
- text-input.default
- text-input.disabled
- text-input.error
- text-input.focus-visible
- toggle.default

## Responsive proof

- desktop1280
- intermediate
- phone390

## Canonical production imports

| Symbol | Story source evidence |
| --- | --- |
| Button | mos-app/src/components/ui/button.tsx :: mos-app/src/stories/v3/accessibility-responsive.stories.tsx<br>mos-app/src/components/ui/button.tsx :: mos-app/src/stories/v3/controls.stories.tsx<br>mos-app/src/components/ui/button.tsx :: mos-app/src/stories/v3/foundation.stories.tsx<br>mos-app/src/components/ui/button.tsx :: mos-app/src/stories/v3/overlays.stories.tsx<br>mos-app/src/components/ui/button.tsx :: mos-app/src/stories/v3/page-compositions.stories.tsx |
| TextInput | mos-app/src/components/ui/text-input.tsx :: mos-app/src/stories/v3/controls.stories.tsx<br>mos-app/src/components/ui/text-input.tsx :: mos-app/src/stories/v3/foundation.stories.tsx |
| Select | mos-app/src/components/ui/select.tsx :: mos-app/src/stories/v3/controls.stories.tsx |
| Checkbox | mos-app/src/components/ui/checkbox.tsx :: mos-app/src/stories/v3/controls.stories.tsx |
| Toggle | mos-app/src/components/ui/toggle.tsx :: mos-app/src/stories/v3/controls.stories.tsx |
| Pill | mos-app/src/components/ui/pill.tsx :: mos-app/src/stories/v3/controls.stories.tsx |
| StatusPill | mos-app/src/components/tasks/status-pill.tsx :: mos-app/src/stories/v3/controls.stories.tsx<br>mos-app/src/components/tasks/status-pill.tsx :: mos-app/src/stories/v3/dense-collections.stories.tsx |
| EmptyState | mos-app/src/components/ui/state-kit.tsx :: mos-app/src/stories/v3/feedback.stories.tsx |
| ErrorState | mos-app/src/components/ui/state-kit.tsx :: mos-app/src/stories/v3/feedback.stories.tsx |
| SkeletonRows | mos-app/src/components/ui/state-kit.tsx :: mos-app/src/stories/v3/feedback.stories.tsx |
| LoadingShell | mos-app/src/components/ui/state-kit.tsx :: mos-app/src/stories/v3/feedback.stories.tsx |
| PlanQtyStepper | mos-app/src/components/kitchen/plan-qty-stepper.tsx :: mos-app/src/stories/v3/feedback.stories.tsx |
| PlanQtyCell | mos-app/src/components/kitchen/plan-qty-cell.tsx :: mos-app/src/stories/v3/feedback.stories.tsx |
| PageFrame | mos-app/src/shell/page-frame.tsx :: mos-app/src/stories/v3/page-compositions.stories.tsx |
| PageHead | mos-app/src/shell/page-head.tsx :: mos-app/src/stories/v3/page-compositions.stories.tsx |
| DataTable | mos-app/src/components/dashboard/data-table.tsx :: mos-app/src/stories/v3/dense-collections.stories.tsx<br>mos-app/src/components/dashboard/data-table.tsx :: mos-app/src/stories/v3/page-compositions.stories.tsx |
| CommandMenu | mos-app/src/components/command/command-menu.tsx :: mos-app/src/stories/v3/overlays.stories.tsx |
| ConfirmDialog | mos-app/src/components/ui/confirm-dialog.tsx :: mos-app/src/stories/v3/overlays.stories.tsx |
| RowMenu | mos-app/src/components/tasks/row-menu.tsx :: mos-app/src/stories/v3/overlays.stories.tsx |
| RecordPanelHost | mos-app/src/shell/record-panel-host.tsx :: mos-app/src/stories/v3/accessibility-responsive.stories.tsx<br>mos-app/src/shell/record-panel-host.tsx :: mos-app/src/stories/v3/overlays.stories.tsx |
| ViewTabs | mos-app/src/components/ui/view-tabs.tsx :: mos-app/src/stories/v3/accessibility-responsive.stories.tsx<br>mos-app/src/components/ui/view-tabs.tsx :: mos-app/src/stories/v3/controls.stories.tsx |
| TasksIcon | mos-app/src/shell/icons.tsx :: mos-app/src/stories/v3/foundation.stories.tsx |
| CloseIcon | mos-app/src/shell/icons.tsx :: mos-app/src/stories/v3/foundation.stories.tsx |

## Accessibility configuration

- Addon configured: **yes**
- `parameters.a11y.test: 'error'`: **yes**
- External runner readiness hook: **postVisit + waitForPageReady**
- Storybook-only service boundary: **configured**
