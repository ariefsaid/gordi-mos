# V3 Storybook component/state/responsive matrix

This deterministic artifact is Issue 2 workbench evidence. It proves canonical story coverage and responsive/a11y configuration; it does not claim application migration or the Issue 9 representative rendered/driven owner gate.

## Package and runner

- Storybook: `10.5.2` with `@storybook/react-vite@10.5.2`
- Addon: `@storybook/addon-a11y@10.5.2`
- Isolated runner: `@storybook/test-runner@0.24.4` (external Playwright/Jest CLI; not a Storybook addon)
- A11y mechanism: `@storybook/addon-a11y` with `parameters.a11y.test: 'error'` executed by `test-storybook`; no Vitest 4 path

## Totals

- Story exports: **35**
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
- RecordPanelHost remains the current shell; desktop split Esc behavior is intentionally non-modal, and any I2 host unification is owned by Issue 4.

- Task vocabulary guard: **0 violations** (Task specimens use PIC + Supervisor; Owner/RACI vocabulary is rejected)

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

## Per-story ownership

| Story file | Jobs | States | Responsive | Canonical imports |
| --- | --- | --- | --- | --- |
| mos-app/src/stories/v3/foundation.stories.tsx | foundation.typography-roles<br>foundation.spacing-rhythm<br>foundation.colors-borders-radii-elevation<br>foundation.icons<br>foundation.focus-visible<br>foundation.runtime-fonts-background<br>foundation.responsive-frames<br>accessibility.runtime-proof | button.focus-visible | desktop1280<br>intermediate<br>phone390 | Button<br>TextInput<br>TasksIcon<br>CloseIcon |
| mos-app/src/stories/v3/controls.stories.tsx | controls.button-state-matrix<br>controls.field-state-matrix<br>controls.selection-status<br>controls.keyboard-focus<br>accessibility.keyboard-focus | button.default<br>button.hover-documentation<br>button.focus-visible<br>button.active<br>button.disabled<br>button.loading-debt<br>text-input.default<br>text-input.focus-visible<br>text-input.disabled<br>text-input.error<br>select.default<br>select.focus-visible<br>select.disabled<br>select.error<br>checkbox.default<br>checkbox.checked<br>checkbox.indeterminate<br>checkbox.disabled<br>toggle.default<br>status.semantic-tones | desktop1280<br>intermediate<br>phone390 | Button<br>ErrorState<br>TextInput<br>Select<br>Checkbox<br>Toggle<br>Pill<br>StatusPill<br>ViewTabs |
| mos-app/src/stories/v3/feedback.stories.tsx | feedback.empty-variants<br>feedback.error-retry<br>feedback.loading-skeleton<br>feedback.saving-saved<br>feedback.validation-retry | empty.quiet<br>empty.next-step<br>empty.awaiting<br>empty.blank<br>error.retry<br>loading.skeleton-rows<br>loading.shell<br>feedback.saving<br>feedback.saved<br>feedback.validation-retry | desktop1280<br>intermediate<br>phone390 | EmptyState<br>ErrorState<br>SkeletonRows<br>LoadingShell<br>PlanQtyStepper<br>PlanQtyCell |
| mos-app/src/stories/v3/page-compositions.stories.tsx | page-composition.workspace<br>page-composition.focused-record<br>page-composition.management | — | desktop1280<br>intermediate<br>phone390 | Button<br>PageFrame<br>PageHead<br>DataTable |
| mos-app/src/stories/v3/dense-collections.stories.tsx | dense-collection.realistic-gordi-records<br>dense-collection.viewport-matrix<br>dense-collection.state-matrix | collection.ready<br>collection.loading<br>collection.empty<br>collection.filtered-empty<br>collection.error | desktop1280<br>intermediate<br>phone390 | DataTable<br>StatusPill |
| mos-app/src/stories/v3/overlays.stories.tsx | overlay.command-search<br>overlay.confirmation<br>overlay.anchored-menu<br>overlay.current-record-panel-shell | overlay.current-host-shell | desktop1280<br>intermediate<br>phone390 | CommandMenu<br>Button<br>ConfirmDialog<br>RowMenu<br>RecordPanelHost |
| mos-app/src/stories/v3/accessibility-responsive.stories.tsx | accessibility.runnable-a11y<br>accessibility.runtime-proof<br>accessibility.keyboard-focus | button.focus-visible | desktop1280<br>intermediate<br>phone390 | Button<br>ViewTabs<br>RecordPanelHost<br>DataTable |

## Responsive story variants

| Story file | Export | `parameters.v3Viewport` | `globals.viewport` |
| --- | --- | --- | --- |
| mos-app/src/stories/v3/page-compositions.stories.tsx | Workspace | desktop1280 | desktop1280 |
| mos-app/src/stories/v3/page-compositions.stories.tsx | WorkspaceIntermediate | intermediate | intermediate |
| mos-app/src/stories/v3/page-compositions.stories.tsx | WorkspacePhone | phone390 | phone390 |
| mos-app/src/stories/v3/dense-collections.stories.tsx | ReadyDesktop | desktop1280 | desktop1280 |
| mos-app/src/stories/v3/dense-collections.stories.tsx | ReadyIntermediate | intermediate | intermediate |
| mos-app/src/stories/v3/dense-collections.stories.tsx | ReadyPhone | phone390 | phone390 |
| mos-app/src/stories/v3/overlays.stories.tsx | CurrentRecordPanelShell | desktop1280 | desktop1280 |
| mos-app/src/stories/v3/overlays.stories.tsx | CurrentRecordPanelShellIntermediate | intermediate | intermediate |
| mos-app/src/stories/v3/overlays.stories.tsx | CurrentRecordPanelShellPhone | phone390 | phone390 |
| mos-app/src/stories/v3/accessibility-responsive.stories.tsx | RuntimeAndViewport | desktop1280 | desktop1280 |
| mos-app/src/stories/v3/accessibility-responsive.stories.tsx | RuntimeIntermediate | intermediate | intermediate |
| mos-app/src/stories/v3/accessibility-responsive.stories.tsx | RuntimePhone | phone390 | phone390 |
| mos-app/src/stories/v3/accessibility-responsive.stories.tsx | KeyboardJourneys | phone390 | phone390 |

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
| ErrorState | mos-app/src/components/ui/state-kit.tsx :: mos-app/src/stories/v3/controls.stories.tsx<br>mos-app/src/components/ui/state-kit.tsx :: mos-app/src/stories/v3/feedback.stories.tsx |
| SkeletonRows | mos-app/src/components/ui/state-kit.tsx :: mos-app/src/stories/v3/feedback.stories.tsx |
| LoadingShell | mos-app/src/components/ui/state-kit.tsx :: mos-app/src/stories/v3/feedback.stories.tsx |
| PlanQtyStepper | mos-app/src/components/kitchen/plan-qty-stepper.tsx :: mos-app/src/stories/v3/feedback.stories.tsx |
| PlanQtyCell | mos-app/src/components/kitchen/plan-qty-cell.tsx :: mos-app/src/stories/v3/feedback.stories.tsx |
| PageFrame | mos-app/src/shell/page-frame.tsx :: mos-app/src/stories/v3/page-compositions.stories.tsx |
| PageHead | mos-app/src/shell/page-head.tsx :: mos-app/src/stories/v3/page-compositions.stories.tsx |
| DataTable | mos-app/src/components/dashboard/data-table.tsx :: mos-app/src/stories/v3/accessibility-responsive.stories.tsx<br>mos-app/src/components/dashboard/data-table.tsx :: mos-app/src/stories/v3/dense-collections.stories.tsx<br>mos-app/src/components/dashboard/data-table.tsx :: mos-app/src/stories/v3/page-compositions.stories.tsx |
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
- External runner hooks: **preVisit story viewport + postVisit waitForPageReady**
- Storybook-only service boundary: **configured**
